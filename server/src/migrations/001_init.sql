CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  name          text NOT NULL,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE devices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            text NOT NULL,
  location        text,
  latitude        double precision,
  longitude       double precision,
  -- Only a SHA-256 hash of the device key is stored; the key is shown once.
  api_key_hash    text NOT NULL UNIQUE,
  -- Alert thresholds (per device so each site can be tuned).
  pm25_threshold  real NOT NULL DEFAULT 35.4,  -- µg/m³, top of US AQI "Moderate"
  voc_threshold   real NOT NULL DEFAULT 250,   -- Sensirion VOC index
  nox_threshold   real NOT NULL DEFAULT 20,    -- Sensirion NOx index
  last_seen_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX devices_owner_idx ON devices (owner_id);

CREATE TABLE readings (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  device_id    uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  recorded_at  timestamptz NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now(),
  pm1          real,  -- µg/m³
  pm25         real,  -- µg/m³
  pm4          real,  -- µg/m³
  pm10         real,  -- µg/m³
  voc_index    real,  -- 1..500, 100 = typical baseline
  nox_index    real,  -- 1..500, 1 = typical baseline
  temperature  real,  -- °C
  humidity     real   -- %RH
);
CREATE INDEX readings_device_time_idx ON readings (device_id, recorded_at DESC);

CREATE TABLE alerts (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  device_id       uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  metric          text NOT NULL CHECK (metric IN ('pm25', 'voc_index', 'nox_index')),
  threshold       real NOT NULL,
  peak_value      real NOT NULL,
  started_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz,
  acknowledged_at timestamptz
);
-- At most one open alert per device + metric; later readings just raise its peak.
CREATE UNIQUE INDEX alerts_one_open_idx ON alerts (device_id, metric) WHERE resolved_at IS NULL;
CREATE INDEX alerts_device_started_idx ON alerts (device_id, started_at DESC);
