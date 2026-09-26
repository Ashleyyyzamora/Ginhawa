// Copy this file to config.h and fill in your values. config.h is git-ignored.
#pragma once

#define WIFI_SSID      "your-wifi"
#define WIFI_PASSWORD  "your-wifi-password"

// Base URL of the Ginhawa server, WITHOUT a trailing slash.
//   Docker on your laptop:   "https://192.168.1.20"   (set SITE_ADDRESS/DEFAULT_SNI in .env to that IP)
//   Deployed with a domain:  "https://ginhawa.example.com"
#define API_BASE_URL   "https://192.168.1.20"

// Key shown once in the app when you add this sensor's station (Add station -> copy key).
#define DEVICE_KEY     "gnh_paste_your_key_here"

// Leave empty ("") to skip certificate checks, fine for a LAN demo with Caddy's self-signed
// certificate. For a real domain, paste the root CA PEM (e.g. ISRG Root X1 for Let's Encrypt).
#define ROOT_CA_PEM    ""

// How often to average and upload a reading (ms). The SEN55 measures every second.
#define REPORT_INTERVAL_MS  10000

// Optional status LED pins (-1 to disable). Green = good, both = moderate, red = unhealthy.
// On the LilyGO T-SIM7600 these pins are wired on the board and must NOT be used:
//   IO4 (PWRKEY), IO12 (LED), IO25-27 (modem), IO32-36 (modem/ADC), IO2/13/14/15 (microSD).
// Free header pins: IO5, IO18, IO19, IO21/22 (I2C, used by the SEN55), IO23.
#define LED_RED_PIN    18
#define LED_GREEN_PIN  19
#define BUZZER_PIN     -1
