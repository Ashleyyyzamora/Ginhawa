// Copy this file to config.h and fill in your values. config.h is git-ignored.
#pragma once

#define WIFI_SSID      "your-wifi"
#define WIFI_PASSWORD  "your-wifi-password"

// Base URL of the Ginhawa server, WITHOUT a trailing slash.
//   Docker on your laptop:   "https://192.168.1.20"   (set SITE_ADDRESS/DEFAULT_SNI in .env to that IP)
//   Deployed with a domain:  "https://ginhawa.example.com"
// The LTE fallback reaches the server over the internet, so it needs a public address (domain or VPS).
#define API_BASE_URL   "https://192.168.1.20"

// Team secret: the same value as ENROLL_SECRET in the server's .env, and the same for every station.
// On first power-on the station uses it to add itself to the app and receives its own key, which it
// keeps in flash memory. No per-station setup in the app is needed.
#define ENROLL_SECRET  "paste-ENROLL_SECRET-from-.env"

// Optional fixed name and landmark. Leave both "" to have the station named automatically after the
// barangay at its GPS position (the team can still rename it in the app).
#define STATION_NAME      ""
#define STATION_LANDMARK  ""

// Leave empty ("") to skip certificate checks, fine for a LAN demo with Caddy's self-signed
// certificate. For a real domain, paste the root CA PEM (e.g. ISRG Root X1 for Let's Encrypt).
#define ROOT_CA_PEM    ""

// How often to average and upload a reading (ms). VOC, NOx, temperature and humidity
// are sampled every second; particles are measured PM_ON_MS out of every PM_CYCLE_MS.
#define REPORT_INTERVAL_MS  60000
#define PM_CYCLE_MS        300000   // 5 minutes
#define PM_ON_MS            60000   // particle sensor (fan + laser) on for 1 minute
#define PM_WARMUP_MS        30000   // ignore the first 30 s after the fan starts

// INA219 power monitor on the same I2C bus (battery voltage and current).
// If it is not found at start-up, battery data is simply omitted.
#define INA219_ADDR       0x40

// ---- SIMCom A7670SA breakout (4G LTE + GNSS, 3.3 V logic) on UART2 ----
// Set LTE_ENABLED to 0 if the station has no modem (then there is no LTE fallback and no GPS).
#define LTE_ENABLED     1
#define LTE_RX_PIN      16   // ESP32 RX2  <- module TXD
#define LTE_TX_PIN      17   // ESP32 TX2  -> module RXD
#define LTE_PWRKEY_PIN   4   // -> module PWRKEY (through the breakout's transistor)
#define LTE_APN         "internet"   // Smart: "internet"; Globe: "internet.globe.com.ph"
#define LTE_MIN_BATTERY_V  3.5       // below this the modem is not started (it needs >= 3.4 V)
#define WIFI_RETRY_MS   600000       // while on LTE, try Wi-Fi again every 10 minutes

// GPS uses the GNSS receiver built into the A7670SA (GNSS antenna on the module's GNSS connector).
#define GPS_ENABLED     1
#define GPS_INTERVAL_MS 900000  // look for a fix every 15 minutes
#define GPS_TIMEOUT_MS  120000  // give up after 2 minutes (e.g. mounted under a roof)

// Optional status LEDs (-1 = none; the compact station has none). Green = good, both = moderate, red = unhealthy.
// Pins used above: 4, 16, 17, 21, 22 (I2C). Avoid strapping pins 0, 2, 5, 12, 15 and flash pins 6-11.
#define LED_RED_PIN    -1
#define LED_GREEN_PIN  -1
#define BUZZER_PIN     -1
