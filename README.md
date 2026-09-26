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

- **Live dashboard**: every site's AQI, PM2.5, VOC and NOx, updating every few seconds over WebSocket
- **Device detail**: health advice, all 8 measurements, history charts (1 h / 24 h / 7 d / 30 d)
- **"Busiest hours"**: average pollution per hour of day, which shows how foot traffic affects air quality
- **Alerts**: open automatically when a threshold is crossed and close when air recovers (thresholds editable per device)
- **Device management**: per-device secret API keys (stored hashed, shown once, rotatable)
- **CSV export** for analysis in Excel / Python (handy for the results chapter)
- **Offline buffering**: the node keeps readings while Wi-Fi is down and uploads them as a batch later
- **Simulator**: realistic rush-hour data for demos before the hardware is ready
- Light & dark mode, mobile-first, installable as an app (PWA)

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
cp .env.example .env          # then set JWT_SECRET to a long random string
docker compose --profile simulator up --build
```

Open **https://localhost**. Your browser will warn about the certificate because Caddy made its own
local one. Click *Advanced → Proceed*. Sign in with the demo account the simulator creates:

- **Email:** `demo@ginhawa.local`
- **Password:** `ginhawa-demo`

It loads 48 h of history for 3 simulated sites and then streams live data. Leave out
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
DATABASE_URL=postgres://ginhawa:ginhawa@localhost:5432/ginhawa npm run dev

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

### Recommended (simplest wiring): ESP32 + Sensirion SEN55

One module gives every value the app shows. The sketch is in `firmware/ginhawa_node/`.

| Part | Approx. price | Notes |
|---|---|---|
| ESP32 DevKit v1 | ₱350 | Wi-Fi, HTTPS capable |
| Sensirion **SEN55** | ₱2,000–2,800 | PM1/2.5/4/10 + VOC + NOx + T/RH over I2C |
| JST GHR-06V cable, 2× 10 kΩ resistors | ₱150 | I2C pull-ups |
| 18650 cell + TP4056 charger + 5 V boost | ₱300 | makes it portable |
| RGB LED / buzzer (optional) | ₱50 | local "air is bad" indicator |

Wiring and setup are at the top of `ginhawa_node.ino`. Steps:

1. In the app: **Add device** → copy the key.
2. Copy `config.example.h` to `config.h` and fill in Wi-Fi, server URL and key.
3. Install the libraries *Sensirion I2C SEN5X* and *ArduinoJson* and upload to the ESP32.

### Budget alternative

**PMS5003** (PM, ~₱900) + **SGP41** (VOC & NOx index, ~₱700) + **SHT40** (T/RH, ~₱250). Replace the
`readMeasuredValues` call in the sketch with reads from these three sensors. The SGP41 needs
Sensirion's *Gas Index Algorithm* library to turn raw signals into VOC/NOx indices. The JSON sent to
the server stays the same.

> **About VOC/NOx values:** Sensirion sensors give an *index* (1–500), not ppm. VOC 100 and NOx 1
> are the "normal" baseline the sensor learns for its location, and higher means more gas than usual.
> Both need 5–10 minutes of warm-up and learn their baseline over about 12 h of running. The app's
> overall level for a site is the worst of the PM2.5 AQI (US EPA 2024 breakpoints) and the VOC/NOx levels.

---

## API reference

Base URL `https://<host>/api/v1`. JSON everywhere. User endpoints need `Authorization: Bearer <token>`.

### Auth
| Method | Path | Body / notes |
|---|---|---|
| POST | `/auth/register` | `{name, email, password(≥8)}` → `{token, user}` |
| POST | `/auth/login` | `{email, password}` → `{token, user}` |
| GET | `/auth/me` | current user |

### Devices (sensor nodes)
| Method | Path | Notes |
|---|---|---|
| GET | `/devices` | your devices, each with `latest` reading (incl. `aqi`, `level`, `category`), `online`, `open_alerts` |
| POST | `/devices` | `{name, location?, latitude?, longitude?}` → `{device, apiKey}` (**key shown once**) |
| GET / PATCH / DELETE | `/devices/:id` | PATCH also accepts `pm25_threshold`, `voc_threshold`, `nox_threshold` |
| POST | `/devices/:id/rotate-key` | new `apiKey`; the old one stops working |
| GET | `/devices/:id/readings?from&to&bucket` | time series; `bucket` = `auto` (default) \| `raw` \| `1m` `5m` `15m` `1h` `6h` `1d`; default last 24 h |
| GET | `/devices/:id/hourly-profile?days=7` | average PM2.5 / VOC / NOx per hour of day |
| GET | `/devices/:id/export.csv?from&to` | raw readings as CSV |

### Alerts
| Method | Path | Notes |
|---|---|---|
| GET | `/alerts?status=open\|all&device_id&limit` | newest first |
| POST | `/alerts/:id/ack` | mark as acknowledged |

### Ingest (used by the sensor node)
`POST /ingest` with header `X-Device-Key: gnh_…`

```json
{ "pm1": 10.2, "pm25": 15.1, "pm4": 17.0, "pm10": 19.8,
  "voc_index": 120, "nox_index": 4, "temperature": 30.5, "humidity": 68,
  "recorded_at": "2026-09-26T06:00:00Z" }
```
All fields are optional. `recorded_at` defaults to the server time. Send `{"readings": [ … up to 500 … ]}`
to upload a buffered batch. The response `{"accepted": 1, "status": {"aqi": 57, "level": 1, "category": "Moderate"}}`
lets the device drive a status LED.

### WebSocket `wss://<host>/ws`
1. Send `{"type":"auth","token":"<JWT>"}` as the first message and receive `{"type":"ready"}`.
2. After that the server pushes events for **your** devices only:
   - `{"type":"reading","deviceId","reading"}`
   - `{"type":"alert","alert"}` / `{"type":"alert_resolved","alert"}`
   - `{"type":"device_updated","device"}` / `{"type":"device_deleted","deviceId"}`

---

## Database schema

`users` → `devices` (owner, location, thresholds, hashed API key) → `readings` (time series,
indexed on `(device_id, recorded_at)`) and `alerts` (at most one open alert per device+metric,
enforced by a partial unique index). Migrations are in `server/src/migrations/` and run automatically at start-up.

## Ideas for next steps

- Wrap the React app with **Capacitor** to ship a real Android APK with push notifications
- Public, read-only map of all sites for the people passing through
- Move `readings` to **TimescaleDB** hypertables if you collect months of data
