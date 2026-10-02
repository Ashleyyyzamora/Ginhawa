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

- **No accounts**: the app opens straight to the stations; anyone can view live data, history, alerts
  and download CSV without signing in.
- **Stations add themselves**: flash the same firmware onto every station and switch it on. It joins
  with the team secret (`ENROLL_SECRET`), receives its own key, and is named after the barangay at its
  GPS position (e.g. *Barangay Carmen*, OpenStreetMap). Moving it renames it.
- **Team admin**: the team signs in under **Settings → Team admin** with a shared passcode
  (`ADMIN_PASSCODE`) to rename stations, set alert thresholds, acknowledge alerts, and remove stations
  (or remove **and block** a lost or stolen device).
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
cp .env.example .env          # set JWT_SECRET, ADMIN_PASSCODE and ENROLL_SECRET
docker compose --profile simulator up --build
```

Open **https://localhost**. Your browser will warn about the certificate because Caddy made its own
local one. Click *Advanced → Proceed*. There is no sign-in: the stations show right away.

The simulator adds 3 placeholder stations ("Station 1 (placeholder)", …) the same way a real sensor
joins, loads 48 h of history and then streams live data. Leave out `--profile simulator` to run without
fake data, and remove the placeholders (station ⚙ → Remove station) once your real stations are running.

### Team admin

Go to **Settings → Team admin** and enter the `ADMIN_PASSCODE` from `.env`. Signed in, every station gets
a ⚙ button (rename, alert thresholds, GPS naming on/off, remove, remove and block) and alerts get an
**Acknowledge** button. Share the passcode only within the team; change it in `.env` and run
`docker compose up -d` to lock everyone out again.

> **Upgrading from the version with accounts:** add `ADMIN_PASSCODE` and `ENROLL_SECRET` to your `.env`
> (see `.env.example`). Existing stations and their data are kept; user accounts are removed.

### Open it on your phone (same Wi-Fi)

1. Find your laptop's LAN IP (e.g. `192.168.1.20`: `ipconfig` on Windows, `ifconfig` on macOS).
2. In `.env`: `SITE_ADDRESS=localhost, 192.168.1.20` and `DEFAULT_SNI=192.168.1.20`.
3. `docker compose up -d --build`, then open `https://192.168.1.20` on the phone.
4. Browser menu → **Add to Home screen**, and it opens like a native app.

> To avoid the certificate warning, install Caddy's root CA on the phone. It is inside the
> `caddy_data` volume: `docker compose cp web:/data/caddy/pki/authorities/local/root.crt .`

### Remove a station

Signed in as the team: open the station → ⚙ → **Remove station**. If its device is still switched on it
will join again as a new station; use **Remove and block device** for hardware that should never come
back. Without the app, from the project folder:

```bash
docker compose exec db psql -U ginhawa -d ginhawa -c "DELETE FROM devices WHERE name = 'Camaman-an';"
```

### Test it as a real app on your phone

The app is a Progressive Web App: installed from the browser it gets its own icon and opens full screen
like a native app. Phones only allow installing from a **trusted** HTTPS address, so the easiest way to
test is the free temporary tunnel:

```bash
docker compose --profile tunnel up -d
docker compose logs tunnel        # look for https://<random-words>.trycloudflare.com
```

Open that address on the phone (Wi-Fi or mobile data), then **Chrome menu → Add to Home screen /
Install app** (Android) or **Share → Add to Home Screen** (iPhone, Safari). The address changes each time
the tunnel restarts, and the app only works while this computer is on. For something permanent, deploy it
online (below).

### Connecting the real sensor

1. Make the server reachable by the sensor: same Wi-Fi as this computer (see *Open it on your phone*, use
   the computer's IP), the tunnel address above, or your online domain. LTE needs a public address.
2. Copy `firmware/ginhawa_node/config.example.h` to `config.h` and fill in Wi-Fi, `API_BASE_URL`,
   `ENROLL_SECRET` (the same value as in `.env`) and the SIM's APN. The same `config.h` works for every
   station. Upload with the Arduino IDE (board: *ESP32 Dev Module*). Wiring is in
   `docs/diagrams/03-circuit-schematic.png`.
3. Switch the station on and open the Serial Monitor (115200 baud). You should see
   `Enrolled as "New station (F1B8)"` and then `Uploaded 1 reading(s) over Wi-Fi`. The station appears in
   the app for everyone within a minute, and is renamed after its barangay once the GPS has a fix.

A device can check its key and connection without storing anything with `GET /api/v1/ingest/ping`
(header `X-Device-Key`).

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
ADMIN_PASSCODE=team ENROLL_SECRET=dev-secret DATABASE_URL=postgres://ginhawa:ginhawa@localhost:5432/ginhawa npm run dev

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

1. Copy `config.example.h` to `config.h` and fill in Wi-Fi, server URL, `ENROLL_SECRET` (from `.env`) and
   the SIM's APN. Optionally set `STATION_NAME` / `STATION_LANDMARK`; otherwise the GPS names it.
2. Switch it on: it adds itself to the app (see *Connecting the real sensor*).
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

Base URL `https://<host>/api/v1`. JSON everywhere. Reading is public; team-only endpoints need
`Authorization: Bearer <token>` from `/admin/login` (otherwise `401`).

### Team admin
| Method | Path | Body / notes |
|---|---|---|
| POST | `/admin/login` | `{passcode}` → `{token}` (rate-limited) |
| GET | `/admin/me` | `200` while the token is valid |

### Enrollment (used by the station on first power-on)
`POST /enroll` with header `X-Enroll-Secret: <ENROLL_SECRET>` and `{"chip_id": "24A160C3F1B8", "name"?, "landmark"?}`
→ `201 {device, apiKey}` for a new station, or `200` with a new key for a station that enrolled before
(its name and history are kept). `401` wrong secret, `403` blocked device. Without `name` the station is
called "New station (F1B8)" until its first GPS fix names it after the barangay.

### Stations (`/devices`, one sensor = one station)
| Method | Path | Notes |
|---|---|---|
| GET | `/devices` | all stations, each with `latest` reading (incl. `aqi`, `level`, `category`), `online`, `open_alerts`, `name_from_gps`, `can_manage` |
| GET | `/devices/:id` | one station (`chip_id` only for the team) |
| PATCH | `/devices/:id` | team: `name`, `landmark`, `name_from_gps`, `pm25_threshold`, `voc_threshold`, `nox_threshold`, `latitude` + `longitude` |
| DELETE | `/devices/:id?block=true` | team: remove; `block=true` also stops the device from enrolling again |
| GET | `/devices/:id/readings?from&to&bucket` | time series; `bucket` = `auto` (default) \| `raw` \| `1m` `5m` `15m` `1h` `6h` `1d`; default last 24 h |
| GET | `/devices/:id/hourly-profile?days=7` | average PM2.5 / VOC / NOx per hour of day |
| GET | `/devices/:id/export.csv?from&to` | raw readings as CSV |

### Alerts
| Method | Path | Notes |
|---|---|---|
| GET | `/alerts?status=open\|all&device_id&limit` | newest first |
| POST | `/alerts/:id/ack` | team: mark as acknowledged |

### Ingest (used by the sensor node)
`GET /ingest/ping` with header `X-Device-Key: gnh_…` checks the key and returns the station, storing nothing.

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
No sign-in. The server sends `{"type":"ready"}` on connect, then pushes events for **all** stations:
   - `{"type":"reading","deviceId","reading"}`
   - `{"type":"alert","alert"}` / `{"type":"alert_resolved","alert"}`
   - `{"type":"device_created","deviceId"}` / `{"type":"device_updated","device"}` / `{"type":"device_deleted","deviceId"}`

---

## Database schema

`devices` = stations (chip ID, name, landmark, GPS location, name-from-GPS flag, thresholds, hashed
device key; name + landmark unique) → `readings` (time series,
indexed on `(device_id, recorded_at)`) and `alerts` (at most one open alert per device+metric,
enforced by a partial unique index); `blocked_chips` lists devices that may not enroll again. Migrations are in `server/src/migrations/` and run automatically at start-up.

## Ideas for next steps

- Wrap the React app with **Capacitor** to ship a real Android APK with push notifications
- Public, read-only page of all stations for the people passing through (no login)
- Move `readings` to **TimescaleDB** hypertables if you collect months of data
