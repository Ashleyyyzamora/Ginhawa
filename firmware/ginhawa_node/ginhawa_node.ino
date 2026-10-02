/*
 * Ginhawa monitoring station: ESP32 DevKit V1 (ESP32-WROOM-32) + Sensirion SEN55 + INA219
 *   + SIMCom A7670 4G LTE module (fallback) + ATGM336H GPS, on 3 x 18650 Li-ion cells (1S3P).
 *
 * Power-saving schedule (see docs/diagrams):
 *   - VOC index, NOx index, temperature and humidity: sampled every second
 *   - particles (PM1.0/2.5/4.0/10): the SEN55 fan and laser run 1 minute in every 5;
 *     the first 30 s after start-up are discarded, the rest are averaged
 *   - every minute: average the samples, read battery voltage/current, and upload
 *   - GPS: powered for up to 90 s every 15 minutes, then switched off
 *   - LTE modem: off while Wi-Fi works; started only when Wi-Fi is unavailable
 *
 * Wiring (see docs/diagrams/03-circuit-schematic and 03-circuit-notes.md):
 *   SEN55 pin 1 VDD -> 5 V boost, pin 2 GND, pin 3 SDA -> GPIO21, pin 4 SCL -> GPIO22,
 *   pin 5 SEL -> GND (I2C), pin 6 NC; 4.7 kΩ pull-ups from SDA/SCL to 3.3 V.
 *   INA219 on the same I2C bus (0x40), in series with the battery (+ = charging).
 *   LTE module: TXD -> GPIO16, RXD <- GPIO17, PWRKEY <- GPIO4, VBAT from the battery rail.
 *   GPS: TX -> GPIO25, RX <- GPIO26, 3.3 V switched by a P-MOSFET whose gate is GPIO27.
 *
 * Libraries (Arduino Library Manager):
 *   "Sensirion I2C SEN5X" (+ "Sensirion Core"), "Adafruit INA219", "ArduinoJson" v7, "TinyGPSPlus"
 * Board: "ESP32 Dev Module" (esp32 by Espressif)
 *
 * First power-on: POST {API_BASE_URL}/api/v1/enroll with header X-Enroll-Secret and
 *   {"chip_id": <ESP32 hardware ID>} -> the station is added to the app and receives its own key,
 *   which is kept in flash (Preferences). If the server ever rejects the key, it enrolls again.
 * Upload: POST {API_BASE_URL}/api/v1/ingest with header X-Device-Key, JSON
 *   {"readings":[{recorded_at, pm1..pm10 (only when measured), voc_index, nox_index,
 *                 temperature, humidity, battery_voltage, battery_current, network,
 *                 latitude/longitude (only when a new GPS fix was obtained)}]}
 * Readings are buffered while offline and sent as one batch when the connection returns.
 */
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <time.h>
#include <ArduinoJson.h>
#include <SensirionI2CSen5x.h>
#include <Adafruit_INA219.h>
#include <TinyGPSPlus.h>
#include <sys/time.h>
#include <Preferences.h>
#include "config.h"
#include "lte.h"

static const size_t MAX_BUFFER = 240;  // 4 hours at one reading per minute

struct Reading {
  time_t ts;  // 0 when the clock wasn't synced yet: the server then uses its own time
  float pm1, pm25, pm4, pm10, voc, nox, temp, rh, battV, battA;
  double lat, lon;  // NaN when no new GPS fix in this minute
};

SensirionI2CSen5x sen5x;
Adafruit_INA219 ina219(INA219_ADDR);
bool haveIna = false;
Reading buffer[MAX_BUFFER];
size_t buffered = 0;

struct Acc {
  double sum = 0;
  uint16_t n = 0;
  void add(float v) { if (!isnan(v)) { sum += v; n++; } }
  float avg() const { return n ? sum / n : NAN; }
};
Acc aPm1, aPm25, aPm4, aPm10, aVoc, aNox, aTemp, aRh, aV, aA;

unsigned long lastReport = 0, lastSample = 0, pmStartedAt = 0;
bool pmOn = false;

TinyGPSPlus gps;
bool gpsOn = false;
unsigned long gpsStartedAt = 0, lastGpsRun = 0;
double fixLat = NAN, fixLon = NAN;  // new fix waiting to be attached to the next reading

Preferences prefs;
String deviceKey;  // issued by the server at enrollment, stored in flash

bool onLte = false;               // Wi-Fi was unavailable: uploads go through the LTE modem
unsigned long lastWifiTry = 0;

// ---------------------------------------------------------------- helpers

void setLed(int level) {
  if (LED_RED_PIN >= 0) digitalWrite(LED_RED_PIN, level >= 1 ? HIGH : LOW);
  if (LED_GREEN_PIN >= 0) digitalWrite(LED_GREEN_PIN, level <= 1 ? HIGH : LOW);  // both on = moderate
  if (BUZZER_PIN >= 0) digitalWrite(BUZZER_PIN, level >= 3 ? HIGH : LOW);
}

void ensureWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.printf("Connecting to %s", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) { delay(250); Serial.print('.'); }
  Serial.println(WiFi.status() == WL_CONNECTED ? " connected, IP " + WiFi.localIP().toString() : " failed");
  if (WiFi.status() == WL_CONNECTED) configTime(0, 0, "pool.ntp.org", "time.google.com");  // UTC
}

bool clockSynced() { return time(nullptr) > 1700000000; }

void addField(JsonObject o, const char *key, float v, int digits) {
  if (!isnan(v)) o[key] = serialized(String(v, digits));
}

// Particle sensing on/off: full measurement mode vs. the SEN55's gas/RH/T-only mode.
void setPm(bool on) {
  uint16_t err = on ? sen5x.startMeasurement() : sen5x.startMeasurementWithoutPm();
  if (err) Serial.printf("SEN55 mode change error %u\n", err);
  pmOn = on;
  if (on) pmStartedAt = millis();
}

// ---------------------------------------------------------------- GPS

void setGps(bool on) {
  if (GPS_POWER_PIN >= 0) digitalWrite(GPS_POWER_PIN, on ? LOW : HIGH);  // P-MOSFET: LOW = on
  gpsOn = on;
  if (on) gpsStartedAt = millis();
}

void serviceGps(unsigned long now) {
  if (!GPS_ENABLED) return;
  if (!gpsOn) {
    if (lastGpsRun == 0 || now - lastGpsRun >= GPS_INTERVAL_MS) { lastGpsRun = now ? now : 1; setGps(true); }
    return;
  }
  while (Serial1.available()) gps.encode(Serial1.read());
  bool fix = gps.location.isValid() && gps.location.age() < 2000 && gps.satellites.value() >= 4;
  if (fix) {
    fixLat = gps.location.lat();
    fixLon = gps.location.lng();
    if (!clockSynced() && gps.date.isValid() && gps.time.isValid()) {  // no NTP (e.g. on LTE): use GPS time
      struct tm t = {};
      t.tm_year = gps.date.year() - 1900; t.tm_mon = gps.date.month() - 1; t.tm_mday = gps.date.day();
      t.tm_hour = gps.time.hour(); t.tm_min = gps.time.minute(); t.tm_sec = gps.time.second();
      setenv("TZ", "UTC0", 1); tzset();
      struct timeval tv = {mktime(&t), 0};
      settimeofday(&tv, nullptr);
    }
    Serial.printf("GPS fix %.6f, %.6f (%u satellites)\n", fixLat, fixLon, (unsigned)gps.satellites.value());
    setGps(false);
  } else if (now - gpsStartedAt >= GPS_TIMEOUT_MS) {
    Serial.println("GPS: no fix, keeping the last known location");
    setGps(false);
  }
}

// ---------------------------------------------------------------- upload

String buildBody(const char *network) {
  JsonDocument doc;
  JsonArray arr = doc["readings"].to<JsonArray>();
  for (size_t i = 0; i < buffered; i++) {
    const Reading &r = buffer[i];
    JsonObject o = arr.add<JsonObject>();
    if (r.ts) {
      char iso[25];
      strftime(iso, sizeof iso, "%Y-%m-%dT%H:%M:%SZ", gmtime(&r.ts));
      o["recorded_at"] = iso;
    }
    addField(o, "pm1", r.pm1, 1);  // omitted (NaN) outside the particle window
    addField(o, "pm25", r.pm25, 1);
    addField(o, "pm4", r.pm4, 1);
    addField(o, "pm10", r.pm10, 1);
    addField(o, "voc_index", r.voc, 0);
    addField(o, "nox_index", r.nox, 0);
    addField(o, "temperature", r.temp, 1);
    addField(o, "humidity", r.rh, 1);
    addField(o, "battery_voltage", r.battV, 3);
    addField(o, "battery_current", r.battA, 3);
    if (!isnan(r.lat) && !isnan(r.lon)) {
      o["latitude"] = serialized(String(r.lat, 6));
      o["longitude"] = serialized(String(r.lon, 6));
    }
    o["network"] = network;
  }
  String body;
  serializeJson(doc, body);
  return body;
}

// HTTPS POST over Wi-Fi with one extra header. Returns the HTTP status (negative on network errors).
int postWifi(const char *path, const String &body, const char *header, const String &value, String &resp) {
  WiFiClientSecure client;
  if (strlen(ROOT_CA_PEM) > 0) client.setCACert(ROOT_CA_PEM);
  else client.setInsecure();  // LAN demo only: encrypts but doesn't verify the server

  HTTPClient http;
  http.setTimeout(8000);
  http.begin(client, String(API_BASE_URL) + path);
  http.addHeader("Content-Type", "application/json");
  http.addHeader(header, value);
  int code = http.POST(body);
  resp = http.getString();
  http.end();
  return code;
}

int post(const char *path, const String &body, const char *header, const String &value, String &resp) {
  if (!onLte) return postWifi(path, body, header, value, resp);
  return lte::post(String(API_BASE_URL) + path, body, String(header) + ": " + value, resp);
}

String chipId() {
  char id[13];
  snprintf(id, sizeof id, "%012llX", (unsigned long long)ESP.getEfuseMac());
  return String(id);
}

// Adds this station to the app (first power-on) or gets a new key (e.g. after the old one was rejected).
bool enroll() {
  JsonDocument doc;
  doc["chip_id"] = chipId();
  if (strlen(STATION_NAME) > 0) doc["name"] = STATION_NAME;
  if (strlen(STATION_LANDMARK) > 0) doc["landmark"] = STATION_LANDMARK;
  String body, resp;
  serializeJson(doc, body);
  int code = post("/api/v1/enroll", body, "X-Enroll-Secret", ENROLL_SECRET, resp);
  JsonDocument res;
  if ((code == 200 || code == 201) && !deserializeJson(res, resp) && res["apiKey"].is<const char *>()) {
    deviceKey = res["apiKey"].as<String>();
    prefs.putString("key", deviceKey);
    Serial.printf("Enrolled as \"%s\" (chip %s)\n", (const char *)(res["device"]["name"] | "?"), chipId().c_str());
    return true;
  }
  Serial.printf("Enrollment failed (HTTP %d): %s\n", code, resp.c_str());
  if (code == 403) Serial.println("This device was blocked by the Ginhawa team.");
  return false;
}

bool upload(float battV) {
  if (buffered == 0) return true;
  unsigned long now = millis();

  // Wi-Fi first. While on LTE, only retry Wi-Fi every WIFI_RETRY_MS (joining costs power).
  if (!onLte || now - lastWifiTry >= WIFI_RETRY_MS) {
    lastWifiTry = now;
    ensureWifi();
    if (WiFi.status() == WL_CONNECTED) {
      if (onLte) { Serial.println("Wi-Fi is back: LTE modem off"); lte::down(); }
      onLte = false;
    } else if (LTE_ENABLED) {
      WiFi.disconnect(true);
      WiFi.mode(WIFI_OFF);  // don't keep the radio searching
      onLte = true;
    }
  }

  if (onLte && !isnan(battV) && battV < LTE_MIN_BATTERY_V) {
    Serial.printf("Battery %.2f V: too low to start the LTE modem, keeping readings\n", battV);
    return false;
  }
  if (deviceKey.length() == 0 && !enroll()) return false;  // readings stay buffered

  String resp;
  int code = post("/api/v1/ingest", buildBody(onLte ? "lte" : "wifi"), "X-Device-Key", deviceKey, resp);

  if (code == 201) {
    JsonDocument res;
    if (!deserializeJson(res, resp)) {
      Serial.printf("Uploaded %u reading(s) over %s: %s\n", (unsigned)buffered, onLte ? "LTE" : "Wi-Fi",
                    (const char *)(res["status"]["category"] | "?"));
      setLed(res["status"]["level"] | 0);
    }
    buffered = 0;
    return true;
  }
  Serial.printf("Upload failed (HTTP %d): %s\n", code, resp.c_str());
  if (code == 400) buffered = 0;  // payload rejected: don't retry the same bad data forever
  if (code == 401) {               // key no longer valid (e.g. station removed): enroll again next time
    deviceKey = "";
    prefs.remove("key");
  }
  return false;
}

// ---------------------------------------------------------------- setup / loop

void setup() {
  Serial.begin(115200);
  for (int pin : {LED_RED_PIN, LED_GREEN_PIN, BUZZER_PIN}) if (pin >= 0) pinMode(pin, OUTPUT);

  Wire.begin();  // SDA 21, SCL 22
  sen5x.begin(Wire);
  if (uint16_t err = sen5x.deviceReset()) Serial.printf("SEN55 reset error %u\n", err);
  sen5x.setTemperatureOffsetSimple(2.0);  // enclosure heat; tune against a thermometer
  setPm(true);                            // start with a particle window

  if (GPS_ENABLED) {
    pinMode(GPS_POWER_PIN, OUTPUT);
    setGps(false);
    Serial1.begin(GPS_BAUD, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
  }
  if (LTE_ENABLED) lte::begin();

  prefs.begin("ginhawa", false);
  deviceKey = prefs.getString("key", "");
  Serial.printf("Chip ID %s, %s\n", chipId().c_str(), deviceKey.length() ? "already enrolled" : "will enroll on first upload");

  haveIna = ina219.begin();
  if (!haveIna) Serial.println("INA219 not found: battery data will be omitted");

  ensureWifi();
  Serial.println("Ginhawa station ready. VOC/NOx need a few minutes to warm up after power-on.");
}

void loop() {
  unsigned long now = millis();

  // Particle window: on for PM_ON_MS at the start of every PM_CYCLE_MS.
  bool wantPm = (now % PM_CYCLE_MS) < PM_ON_MS;
  if (wantPm != pmOn) setPm(wantPm);

  serviceGps(now);

  if (now - lastSample >= 1000) {
    lastSample = now;
    float pm1, pm25, pm4, pm10, rh, temp, voc, nox;
    if (!sen5x.readMeasuredValues(pm1, pm25, pm4, pm10, rh, temp, voc, nox)) {
      if (pmOn && now - pmStartedAt >= PM_WARMUP_MS) {  // skip fan spin-up
        aPm1.add(pm1); aPm25.add(pm25); aPm4.add(pm4); aPm10.add(pm10);
      }
      aRh.add(rh); aTemp.add(temp); aVoc.add(voc); aNox.add(nox);  // NaN (warming up) is skipped
    }
    if (haveIna) {
      aV.add(ina219.getBusVoltage_V() + ina219.getShuntVoltage_mV() / 1000.0);
      aA.add(ina219.getCurrent_mA() / 1000.0);
    }
  }

  if (now - lastReport >= REPORT_INTERVAL_MS) {
    lastReport = now;
    if (aVoc.n > 0 || aPm25.n > 0) {
      if (buffered == MAX_BUFFER) {  // drop the oldest reading
        memmove(buffer, buffer + 1, sizeof(Reading) * (MAX_BUFFER - 1));
        buffered--;
      }
      buffer[buffered++] = {clockSynced() ? time(nullptr) : 0, aPm1.avg(), aPm25.avg(), aPm4.avg(), aPm10.avg(),
                            aVoc.avg(), aNox.avg(), aTemp.avg(), aRh.avg(), aV.avg(), aA.avg(), fixLat, fixLon};
      fixLat = fixLon = NAN;
    }
    float battV = aV.avg();
    aPm1 = aPm25 = aPm4 = aPm10 = aVoc = aNox = aTemp = aRh = aV = aA = Acc();
    upload(battV);
  }
}
