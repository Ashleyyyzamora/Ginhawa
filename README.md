# Ginhawa

**A compact, portable air-quality monitor for high foot-traffic areas, with a live mobile app.**

A small sensor node (ESP32 + Sensirion SEN55) measures **PM2.5** (plus PM1/PM4/PM10), **VOC**,
**NOx**, temperature and humidity. It sends readings over **HTTPS** to a **Node.js REST API**, which
stores them in **PostgreSQL** and pushes them instantly over a **WebSocket** to a **React** mobile web
app (installable on Android/iOS home screens). Everything runs with one **Docker Compose** command.

```
 ┌──────────────┐   HTTPS POST /api/v1/ingest    ┌──────────────────────────────┐
 │ Sensor node  │ ─────────────────────────────▶ │ Caddy (HTTPS, auto certs)    │
 │ ESP32+SEN55  │ ◀── {aqi, level} → status LED  │  ├─ /        React app       │
 └──────────────┘                                │  ├─ /api/*   ─┐              │
                                                 │  └─ /ws      ─┤              │
 ┌──────────────┐   HTTPS REST + WSS (live)      │               ▼              │
 │ Phone / PC   │ ◀────────────────────────────▶ │ Node.js API (Express + ws)   │
 │ React PWA    │                                │               │              │
 └──────────────┘                                │               ▼              │
                                                 │ PostgreSQL 16                │
                                                 └──────────────────────────────┘
```

## Features

- **Stations**: each sensor is a station named after where it is placed (e.g. *Barangay Carmen*) plus an
  optional landmark (e.g. *near the public market entrance*). Adding a sensor adds its station.
- **Two roles**: **developers** (the team, listed in `DEV_EMAILS`) add, edit and delete any station.
  **Viewers** (anyone else who signs up) see every station, its live data and alerts, can acknowledge
  alerts and download data, but can't change stations.
- **Overview**: the worst air right now, stations online, active alerts and the worst station at a glance
- **Search & sort** stations by barangay/landmark; sort by worst air, A–Z or most recently updated
- **Live dashboard**: every station's AQI, PM2.5, VOC and NOx, updating live over WebSocket as each station reports (once a minute)
- **Station detail**: health advice, AQI color scale, all 8 measurements (tap one for a plain-language
  explanation and its levels), history charts (1 h / 24 h / 7 d / 30 d)
- **Pull-to-refresh**, in-app notifications when a new alert starts, and in-app confirm dialogs
- **Light / Dark / System theme**: follows the phone by default; switch with the sun/moon button or in
  Account → Appearance (remembered per device, no flash on load)
- Look & feel modelled on **IQAir** and **Apple Weather**: an AQI hero card coloured by the current level,
  health recommendations, a scrollable hourly AQI strip, weather-style reading tiles with gauges, large
  titles that collapse on scroll, and grouped settings lists
- **"Busiest hours"**: average pollution per hour of day, which shows how foot traffic affects air quality
- **Alerts**: open automatically when a threshold is crossed and close when air recovers (thresholds editable per station)
- **Sensor keys**: each station's sensor gets a secret key (stored hashed, shown once, rotatable)
- **CSV export** for analysis in Excel / Python (handy for the results chapter)
- **Offline buffering**: the node keeps readings while Wi-Fi is down and uploads them as a batch later
- **Simulator**: realistic rush-hour data for demos before the hardware is ready
- Mobile-first, installable as an app (PWA)

## Repository layout

| Path | What it is |
|---|---|
| `server/` | Node.js API: Express REST, `ws` WebSocket hub, PostgreSQL (`pg`), JWT auth, SQL migrations, tests, simulator |
| `client/` | React 19 + Vite app (react-router, Recharts); its Docker image is Caddy serving the app and proxying the API |
| `firmware/ginhawa_node/` | Arduino sketch for the ESP32 + SEN55 sensor node |
| `docker-compose.yml` | db + server + web (+ optional simulator) |

---

## Quick start (Docker)

Requirements: [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
cp .env.example .env          # set JWT_SECRET, and put your team's emails in DEV_EMAILS
docker compose --profile simulator up --build
```

Open **https://localhost**. Your browser will warn about the certificate because Caddy made its own
local one. Click *Advanced → Proceed*. Sign in with the demo account the simulator creates:

- **Email:** `demo@ginhawa.local`
- **Password:** `ginhawa-demo`

It creates 3 placeholder stations ("Station 1 (placeholder)", …), loads 48 h of history and then streams
live data. The placeholder stations are visible to every user, so delete them (station ⚙ → Delete station,
signed in as a developer) once your real stations are running.

### Who is a developer?

Only emails listed in `DEV_EMAILS` (in `.env`, comma-separated) can add, edit or delete stations:

```
DEV_EMAILS=demo@ginhawa.local,ana@gmail.com,ben@gmail.com
```

Sign up in the app with one of those emails and you get the **Add station** tab. Everyone else is a
viewer. After changing the list, restart the server (`docker compose up -d`); the change applies
immediately, even to people who are already signed in. Keep `demo@ginhawa.local` in the list while you use
the simulator, because it needs to add its placeholder stations. Leave out
`--profile simulator` to run without fake data.

### Open it on your phone (same Wi-Fi)

1. Find your laptop's LAN IP (e.g. `192.168.1.20`: `ipconfig` on Windows, `ifconfig` on macOS).
2. In `.env`: `SITE_ADDRESS=localhost, 192.168.1.20` and `DEFAULT_SNI=192.168.1.20`.
3. `docker compose up -d --build`, then open `https://192.168.1.20` on the phone.
4. Browser menu → **Add to Home screen**, and it opens like a native app.

> To avoid the certificate warning, install Caddy's root CA on the phone. It is inside the
> `caddy_data` volume: `docker compose cp web:/data/caddy/pki/authorities/local/root.crt .`

### Deploying online

On a cloud VM with a domain pointing at it, set `SITE_ADDRESS=ginhawa.yourdomain.com` and
`CADDY_TLS=you@email.com`. Caddy then gets a free, trusted Let's Encrypt certificate automatically.

---

## Local development (without Docker)

Requires Node 20+ and PostgreSQL 14+.

```bash
# database
createdb ginhawa   # or: docker run -d -p 5432:5432 -e POSTGRES_USER=ginhawa -e POSTGRES_PASSWORD=ginhawa -e POSTGRES_DB=ginhawa postgres:16-alpine

# API → http://localhost:4000 (runs migrations on start)
cd server && npm install
DEV_EMAILS=demo@ginhawa.local,you@example.com DATABASE_URL=postgres://ginhawa:ginhawa@localhost:5432/ginhawa npm run dev

# simulator (another terminal)
cd server && npm run simulate -- --backfill 48 --devices 3

# app → http://localhost:5173 (proxies /api and /ws to :4000)
cd client && npm install && npm run dev
```

Tests (unit tests always run; API tests run against a throwaway database):

```bash
cd server && TEST_DATABASE_URL=postgres://ginhawa:ginhawa@localhost:5432/ginhawa_test npm test
```

⚠️ The API test **drops and recreates the `public` schema** of `TEST_DATABASE_URL`, so use a separate database.

To serve HTTPS straight from Node (no Caddy), set `TLS_KEY_FILE` and `TLS_CERT_FILE`.

---

## Hardware

### Compact solar station (the design in the proposal)

One compact unit (≈150 × 110 × 260 mm, ≈0.8 kg) plus a small solar panel, built around a standard
**ESP32 DevKit V1**. Full wiring: `docs/diagrams/03-circuit-schematic.png`; parts list:
`docs/diagrams/03-circuit-notes.md`.

| Part | Approx. price | Notes |
|---|---|---|
| ESP32 DevKit V1 (ESP32-WROOM-32) | already owned | MCU + Wi-Fi |
| Sensirion **SEN55** | ₱2,000–2,800 | PM1/2.5/4/10 + VOC + NOx + T/RH over I2C |
| SIMCom **A7670** 4G LTE Cat-1 breakout + LTE antenna | ₱1,350–2,100 | fallback when there is no Wi-Fi |
| GPS module ATGM336H + AO3401 switch | ₱250–450 | position every 15 min |
| INA219 module | ₱150–250 | battery voltage and current |
| 3× 18650 Li-ion 3000 mAh + 1S BMS + holder | ₱850–1,450 | 3.7 V 9 Ah (≈33 Wh) pack, ≈0.15 kg |
| CN3791 solar charger + 6 V 6 W panel | ₱500–1,000 | recharges the pack |
| 3.3 V buck-boost + 5 V boost (MT3608) + 1000 µF | ₱200–470 | ESP32/GPS and SEN55 supplies |
| IP65 box 150×100×70 mm + 3D-printed radiation shield | ₱550–1,350 | enclosure |

**Power-saving schedule** (≈7.5 Wh/day on Wi-Fi, ≈11.6 Wh/day on LTE; ≈3.5 / 2.3 days without sun):
VOC, NOx, temperature and humidity are sampled every second; the SEN55 fan and laser run **1 minute
in every 5** for particles; the station averages and uploads **once a minute**. The GPS is powered for
up to 90 s every 15 minutes, and the LTE modem is started only when Wi-Fi is unavailable. The server
carries the latest particle reading forward for up to 10 minutes so the AQI stays continuous, and marks
a station offline after 5 minutes of silence.

Wiring and setup are at the top of `ginhawa_node.ino`. Steps:

1. In the app, signed in as a developer: **Add station** → enter where the sensor is placed (e.g. *Barangay Carmen*) → copy the key.
2. Copy `config.example.h` to `config.h` and fill in Wi-Fi, server URL, key and the SIM's APN.
3. Install the libraries *Sensirion I2C SEN5X*, *Adafruit INA219*, *ArduinoJson* and *TinyGPSPlus*,
   select the board **ESP32 Dev Module** and upload.

The LTE upload uses the A7670's built-in HTTP(S) AT commands (`lte.h`); test it on the bench with the
exact breakout you buy. LTE needs the server on a public address (domain or VPS).

### Budget alternative

**PMS5003** (PM, ~₱900) + **SGP41** (VOC & NOx index, ~₱700) + **SHT40** (T/RH, ~₱250). Replace the
`readMeasuredValues` call in the sketch with reads from these three sensors. The SGP41 needs
Sensirion's *Gas Index Algorithm* library to turn raw signals into VOC/NOx indices. The JSON sent to
the server stays the same.

> **About VOC/NOx values:** Sensirion sensors give an *index* (1–500), not ppm. VOC 100 and NOx 1
> are the "normal" baseline the sensor learns for its location, and higher means more gas than usual.
> Both need 5–10 minutes of warm-up and learn their baseline over about 12 h of running. The app's
> overall level for a station is the worst of the PM2.5 AQI (US EPA 2024 breakpoints) and the VOC/NOx levels.

---

## API reference

Base URL `https://<host>/api/v1`. JSON everywhere. User endpoints need `Authorization: Bearer <token>`.

### Auth
| Method | Path | Body / notes |
|---|---|---|
| POST | `/auth/register` | `{name, email, password(≥8)}` → `{token, user}`; `user.role` is `dev` or `viewer` |
| POST | `/auth/login` | `{email, password}` → `{token, user}` |
| GET | `/auth/me` | current user |

### Stations (`/devices`, one sensor = one station)
Every signed-in user can read every station. Adding or changing one (POST, PATCH, DELETE, rotate-key) is
limited to developers (`DEV_EMAILS`); others get `403`. Each station has `can_manage` and `created_by`.

| Method | Path | Notes |
|---|---|---|
| GET | `/devices` | all stations, each with `latest` reading (incl. `aqi`, `level`, `category`), `online`, `open_alerts`, `created_by`, `can_manage` |
| POST | `/devices` | `{name, landmark?}`, e.g. `{"name":"Barangay Carmen","landmark":"Near the public market"}` → `{device, apiKey}` (**key shown once**). `409` if the same name + landmark exists |
| GET / PATCH / DELETE | `/devices/:id` | PATCH accepts `name`, `landmark`, `pm25_threshold`, `voc_threshold`, `nox_threshold`, and `latitude` + `longitude` (manual location) |
| POST | `/devices/:id/rotate-key` | new `apiKey`; the old one stops working |
| GET | `/devices/:id/readings?from&to&bucket` | time series; `bucket` = `auto` (default) \| `raw` \| `1m` `5m` `15m` `1h` `6h` `1d`; default last 24 h |
| GET | `/devices/:id/hourly-profile?days=7` | average PM2.5 / VOC / NOx per hour of day |
| GET | `/devices/:id/export.csv?from&to` | raw readings as CSV |

### Alerts
| Method | Path | Notes |
|---|---|---|
| GET | `/alerts?status=open\|all&device_id&limit` | newest first |
| POST | `/alerts/:id/ack` | mark as acknowledged (any signed-in user) |

### Ingest (used by the sensor node)
`POST /ingest` with header `X-Device-Key: gnh_…`

```json
{ "pm1": 10.2, "pm25": 15.1, "pm4": 17.0, "pm10": 19.8,
  "voc_index": 120, "nox_index": 4, "temperature": 30.5, "humidity": 68,
  "battery_voltage": 3.31, "battery_current": -0.12, "network": "wifi",
  "latitude": 8.4822, "longitude": 124.6472,
  "recorded_at": "2026-09-26T06:00:00Z" }
```
All fields are optional. Leave the PM fields out when particles weren't measured (4 of every 5
uploads); the server then reports the last particle reading (up to 10 minutes old) with its
`pm_recorded_at`. `battery_current` is positive while charging. `latitude`/`longitude` must be
sent together and update the station's map location. `recorded_at` defaults to the server time. Send `{"readings": [ … up to 500 … ]}`
to upload a buffered batch. The response `{"accepted": 1, "status": {"aqi": 57, "level": 1, "category": "Moderate"}}`
lets the device drive a status LED.

### WebSocket `wss://<host>/ws`
1. Send `{"type":"auth","token":"<JWT>"}` as the first message and receive `{"type":"ready"}`.
2. After that the server pushes events for **all** stations:
   - `{"type":"reading","deviceId","reading"}`
   - `{"type":"alert","alert"}` / `{"type":"alert_resolved","alert"}`
   - `{"type":"device_created","deviceId"}` / `{"type":"device_updated","device"}` / `{"type":"device_deleted","deviceId"}`

---

## Database schema

`users` → `devices` = stations (name, landmark, who added it, thresholds, hashed API key; name + landmark
unique) → `readings` (time series,
indexed on `(device_id, recorded_at)`) and `alerts` (at most one open alert per device+metric,
enforced by a partial unique index). Migrations are in `server/src/migrations/` and run automatically at start-up.

## Ideas for next steps

- Wrap the React app with **Capacitor** to ship a real Android APK with push notifications
- Public, read-only page of all stations for the people passing through (no login)
- Move `readings` to **TimescaleDB** hypertables if you collect months of data
