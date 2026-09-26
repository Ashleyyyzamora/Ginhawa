/*
 * Ginhawa sensor node: ESP32 + Sensirion SEN55
 *
 * The SEN55 is a single I2C module that measures PM1.0 / PM2.5 / PM4.0 / PM10,
 * VOC index, NOx index, temperature and humidity: everything Ginhawa needs.
 *
 * Wiring (SEN55 JST GHR-06V cable):
 *   pin 1 VDD -> 5V (VIN)     pin 2 GND -> GND
 *   pin 3 SDA -> GPIO 21      pin 4 SCL -> GPIO 22
 *   pin 5 SEL -> GND (selects I2C)   pin 6 NC
 *   add 4.7 kΩ pull-ups from SDA and SCL to 3.3 V (see docs/diagrams/03-circuit-schematic)
 *
 * Libraries (Arduino Library Manager):
 *   - "Sensirion I2C SEN5X" (and its dependency "Sensirion Core")
 *   - "ArduinoJson" v7
 * Board: "ESP32 Dev Module" (esp32 by Espressif)
 *
 * Behaviour:
 *   - averages the 1 Hz sensor readings over REPORT_INTERVAL_MS
 *   - POSTs JSON to  {API_BASE_URL}/api/v1/ingest  with header X-Device-Key over HTTPS
 *   - if Wi-Fi or the server is down, keeps up to MAX_BUFFER readings in RAM and
 *     uploads them as one batch when the connection comes back
 *   - the server replies with the current air-quality level, shown on the status LED
 */
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <time.h>
#include <ArduinoJson.h>
#include <SensirionI2CSen5x.h>
#include "config.h"

static const size_t MAX_BUFFER = 120;  // 20 minutes at a 10 s interval

struct Reading {
  time_t ts;  // 0 when the clock wasn't synced yet: the server then uses its own time
  float pm1, pm25, pm4, pm10, voc, nox, temp, rh;
};

SensirionI2CSen5x sen5x;
Reading buffer[MAX_BUFFER];
size_t buffered = 0;

// Running sums for averaging
struct Acc { double sum = 0; uint16_t n = 0; void add(float v) { if (!isnan(v)) { sum += v; n++; } } float avg() const { return n ? sum / n : NAN; } };
Acc aPm1, aPm25, aPm4, aPm10, aVoc, aNox, aTemp, aRh;
unsigned long lastReport = 0, lastSample = 0;

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
    addField(o, "pm1", r.pm1, 1);
    addField(o, "pm25", r.pm25, 1);
    addField(o, "pm4", r.pm4, 1);
    addField(o, "pm10", r.pm10, 1);
    addField(o, "voc_index", r.voc, 0);
    addField(o, "nox_index", r.nox, 0);
    addField(o, "temperature", r.temp, 1);
    addField(o, "humidity", r.rh, 1);
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
      int level = res["status"]["level"] | 0;
      Serial.printf("Uploaded %u reading(s): AQI %d, %s\n", (unsigned)buffered, res["status"]["aqi"] | -1,
                    (const char *)(res["status"]["category"] | "?"));
      setLed(level);
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
  uint16_t err = sen5x.deviceReset();
  if (err) Serial.printf("SEN55 reset error %u\n", err);
  // Compensate for heat from the enclosure / ESP32 (°C). Tune by comparing with a thermometer.
  sen5x.setTemperatureOffsetSimple(2.0);
  err = sen5x.startMeasurement();
  if (err) Serial.printf("SEN55 start error %u\n", err);

  ensureWifi();
  Serial.println("Ginhawa node ready. Note: VOC/NOx need a few minutes to warm up after power-on.");
}

void loop() {
  unsigned long now = millis();

  if (now - lastSample >= 1000) {
    lastSample = now;
    float pm1, pm25, pm4, pm10, rh, temp, voc, nox;
    uint16_t err = sen5x.readMeasuredValues(pm1, pm25, pm4, pm10, rh, temp, voc, nox);
    if (!err) {
      aPm1.add(pm1); aPm25.add(pm25); aPm4.add(pm4); aPm10.add(pm10);
      aRh.add(rh); aTemp.add(temp); aVoc.add(voc); aNox.add(nox);  // NaN (warming up) is skipped
    }
  }

  if (now - lastReport >= REPORT_INTERVAL_MS) {
    lastReport = now;
    if (aPm25.n > 0) {
      if (buffered == MAX_BUFFER) {  // drop the oldest reading
        memmove(buffer, buffer + 1, sizeof(Reading) * (MAX_BUFFER - 1));
        buffered--;
      }
      buffer[buffered++] = {clockSynced() ? time(nullptr) : 0, aPm1.avg(), aPm25.avg(), aPm4.avg(), aPm10.avg(),
                            aVoc.avg(), aNox.avg(), aTemp.avg(), aRh.avg()};
      aPm1 = aPm25 = aPm4 = aPm10 = aVoc = aNox = aTemp = aRh = Acc();
    }
    upload();
  }
}
