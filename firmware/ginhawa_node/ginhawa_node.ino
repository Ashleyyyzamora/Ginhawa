/*
 * Ginhawa monitoring station: LilyGO T-SIM7600 (ESP32) + Sensirion SEN55 + INA219
 *
 * Power-saving schedule (compact solar/LiFePO4 design, see docs/diagrams):
 *   - VOC index, NOx index, temperature and humidity: sampled every second
 *   - particles (PM1.0/2.5/4.0/10): the SEN55 fan and laser run 1 minute in every 5;
 *     the first 30 s after start-up are discarded, the rest are averaged
 *   - every minute: average the samples, read battery voltage/current, and upload
 *
 * Wiring (see docs/diagrams/03-circuit-schematic):
 *   SEN55 pin 1 VDD -> 5 V, pin 2 GND, pin 3 SDA -> GPIO21, pin 4 SCL -> GPIO22,
 *   pin 5 SEL -> GND (I2C), pin 6 NC; 4.7 kΩ pull-ups from SDA/SCL to 3.3 V.
 *   INA219 on the same I2C bus (0x40), in series with the battery (+ = charging).
 *
 * Libraries (Arduino Library Manager):
 *   "Sensirion I2C SEN5X" (+ "Sensirion Core"), "Adafruit INA219", "ArduinoJson" v7
 * Board: "ESP32 Wrover Module" (esp32 by Espressif)
 *
 * Upload: POST {API_BASE_URL}/api/v1/ingest with header X-Device-Key, JSON
 *   {"readings":[{recorded_at, pm1..pm10 (only when measured), voc_index, nox_index,
 *                 temperature, humidity, battery_voltage, battery_current, network}]}
 * Readings are buffered while offline and sent as one batch when the connection returns.
 *
 * Next sprint: 4G LTE fallback and GPS through the SIM7600 modem (TinyGSM). Until then
 * the station uploads over Wi-Fi only and reports network = "wifi".
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
#include "config.h"

static const size_t MAX_BUFFER = 240;  // 4 hours at one reading per minute

struct Reading {
  time_t ts;  // 0 when the clock wasn't synced yet: the server then uses its own time
  float pm1, pm25, pm4, pm10, voc, nox, temp, rh, battV, battA;
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

// ---------------------------------------------------------------- upload

bool upload() {
  if (buffered == 0) return true;
  ensureWifi();
  if (WiFi.status() != WL_CONNECTED) return false;

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
    o["network"] = "wifi";
  }
  String body;
  serializeJson(doc, body);

  WiFiClientSecure client;
  if (strlen(ROOT_CA_PEM) > 0) client.setCACert(ROOT_CA_PEM);
  else client.setInsecure();  // LAN demo only: encrypts but doesn't verify the server

  HTTPClient http;
  http.setTimeout(8000);
  http.begin(client, String(API_BASE_URL) + "/api/v1/ingest");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_KEY);
  int code = http.POST(body);
  String resp = http.getString();
  http.end();

  if (code == 201) {
    JsonDocument res;
    if (!deserializeJson(res, resp)) {
      Serial.printf("Uploaded %u reading(s): %s\n", (unsigned)buffered, (const char *)(res["status"]["category"] | "?"));
      setLed(res["status"]["level"] | 0);
    }
    buffered = 0;
    return true;
  }
  Serial.printf("Upload failed (HTTP %d): %s\n", code, resp.c_str());
  if (code == 400) buffered = 0;  // payload rejected: don't retry the same bad data forever
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
                            aVoc.avg(), aNox.avg(), aTemp.avg(), aRh.avg(), aV.avg(), aA.avg()};
      aPm1 = aPm25 = aPm4 = aPm10 = aVoc = aNox = aTemp = aRh = aV = aA = Acc();
    }
    upload();
  }
}
