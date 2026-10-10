// 4G LTE fallback and GNSS (GPS) through a SIMCom A7670SA module (the GNSS version), using the module's built-in HTTP(S)
// AT commands (AT+HTTPINIT / HTTPPARA / HTTPDATA / HTTPACTION / HTTPREAD).
// Bench-test with the exact breakout you buy: command replies can differ between firmware versions.
#pragma once
#include <Arduino.h>
#include "config.h"

namespace lte {

HardwareSerial &at = Serial2;
bool powered = false;

// Send a command and wait for `expect` (or "ERROR"). Returns true when `expect` was seen.
bool cmd(const String &c, const char *expect = "OK", unsigned long timeout = 3000, String *out = nullptr) {
  if (c.length()) {  // an empty command just waits for more output of the previous one
    while (at.available()) at.read();
    at.println(c);
  }
  String buf;
  unsigned long t0 = millis();
  while (millis() - t0 < timeout) {
    while (at.available()) buf += (char)at.read();
    if (buf.indexOf(expect) >= 0) { if (out) *out = buf; return true; }
    if (buf.indexOf("ERROR") >= 0) break;
    delay(10);
  }
  if (out) *out = buf;
  return false;
}

void pulsePwrKey() {
  digitalWrite(LTE_PWRKEY_PIN, HIGH);
  delay(1000);
  digitalWrite(LTE_PWRKEY_PIN, LOW);
}

void begin() {
  pinMode(LTE_PWRKEY_PIN, OUTPUT);
  digitalWrite(LTE_PWRKEY_PIN, LOW);
  at.begin(115200, SERIAL_8N1, LTE_RX_PIN, LTE_TX_PIN);
}

// Power the modem on (no network needed: also used for GNSS while the station is on Wi-Fi).
bool powerOn() {
  if (powered) return true;
  if (!cmd("AT", "OK", 500)) {
    pulsePwrKey();
    bool ok = false;
    for (int i = 0; i < 20 && !ok; i++) ok = cmd("AT", "OK", 1000);
    if (!ok) { Serial.println("LTE: modem not responding"); return false; }
  }
  powered = true;
  cmd("ATE0");
  cmd(String("AT+CGDCONT=1,\"IP\",\"") + LTE_APN + "\"");
  return true;
}

// Power the modem on and wait until it is registered on the LTE network.
bool up() {
  if (!powerOn()) return false;
  for (int i = 0; i < 30; i++) {  // up to ~60 s for registration
    String r;
    cmd("AT+CEREG?", "OK", 2000, &r);
    if (r.indexOf(",1") >= 0 || r.indexOf(",5") >= 0) return true;  // home or roaming
    delay(1000);
  }
  Serial.println("LTE: not registered");
  return false;
}

// ---- GNSS (built into the A7670SA) ----

void gnssOn() {
  cmd("AT+CVAUXS=1");                          // power an active GNSS antenna (ignored if not supported)
  cmd("AT+CGNSSPWR=1", "OK", 5000);            // the receiver reports "+CGNSSPWR: READY!" when it is up
}

void gnssOff() { cmd("AT+CGNSSPWR=0", "OK", 3000); }

// ddmm.mmmm (NMEA style) -> decimal degrees
double nmeaToDeg(const String &v, const String &hemi) {
  double x = v.toDouble();
  int deg = (int)(x / 100);
  double d = deg + (x - deg * 100) / 60.0;
  return (hemi == "S" || hemi == "W") ? -d : d;
}

// One position query. Returns true with lat/lon (and UTC date/time "ddmmyy","hhmmss") once there is a fix.
// Reply: +CGPSINFO: 0828.633100,N,12438.754000,E,021026,061530.0,25.0,0.0,0  (empty fields = no fix yet)
bool gnssRead(double &lat, double &lon, String &date, String &time) {
  String r;
  if (!cmd("AT+CGPSINFO", "OK", 2000, &r)) return false;
  int p = r.indexOf("+CGPSINFO:");
  if (p < 0) return false;
  String f[9];
  int start = p + 10, n = 0;
  for (int i = start; i <= (int)r.length() && n < 9; i++) {
    if (i == (int)r.length() || r[i] == ',' || r[i] == '\r' || r[i] == '\n') {
      f[n++] = r.substring(start, i);
      start = i + 1;
      if (i < (int)r.length() && (r[i] == '\r' || r[i] == '\n')) break;
    }
  }
  for (auto &x : f) x.trim();
  if (n < 6 || f[0].length() == 0 || f[2].length() == 0) return false;
  lat = nmeaToDeg(f[0], f[1]);
  lon = nmeaToDeg(f[2], f[3]);
  date = f[4];
  time = f[5];
  return true;
}

void down() {
  if (!powered) return;
  cmd("AT+CPOF", "OK", 5000);  // clean power-off
  powered = false;
}

// POST `body` to `url` with one extra header line (e.g. "X-Device-Key: gnh_..."). Returns the HTTP
// status (or -1) and fills `response`.
int post(const String &url, const String &body, const String &header, String &response) {
  if (!up()) return -1;
  cmd("AT+HTTPTERM", "OK", 1000);  // clear a session left open by an earlier failure
  if (!cmd("AT+HTTPINIT")) return -1;
  cmd("AT+HTTPPARA=\"URL\",\"" + url + "\"");
  cmd("AT+HTTPPARA=\"CONTENT\",\"application/json\"");
  cmd("AT+HTTPPARA=\"USERDATA\",\"" + header + "\"");
  int status = -1;
  if (cmd("AT+HTTPDATA=" + String(body.length()) + ",10000", "DOWNLOAD", 5000)) {
    at.print(body);
    cmd("", "OK", 10000);
    String r;
    if (cmd("AT+HTTPACTION=1", "+HTTPACTION:", 60000, &r)) {
      delay(50);
      while (at.available()) r += (char)at.read();
      int p = r.indexOf("+HTTPACTION:");
      int c1 = r.indexOf(',', p), c2 = r.indexOf(',', c1 + 1);
      status = r.substring(c1 + 1, c2).toInt();
      int len = r.substring(c2 + 1).toInt();
      if (len > 0) {
        String data;
        cmd("AT+HTTPREAD=0," + String(min(len, 1024)), "+HTTPREAD: 0", 5000, &data);
        int s = data.indexOf('{'), e = data.lastIndexOf('}');
        if (s >= 0 && e > s) response = data.substring(s, e + 1);
      }
    }
  }
  cmd("AT+HTTPTERM");
  return status;
}

}  // namespace lte
