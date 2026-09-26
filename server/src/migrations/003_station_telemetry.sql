-- Station telemetry for the compact solar design and GPS map:
-- battery voltage/current (INA219), which network carried the upload,
-- and the station's own GPS location.
ALTER TABLE readings
  ADD COLUMN battery_voltage real,   -- V, battery pack
  ADD COLUMN battery_current real,   -- A, + charging / − discharging
  ADD COLUMN network text CHECK (network IN ('wifi', 'lte'));

ALTER TABLE devices
  ADD COLUMN latitude double precision,
  ADD COLUMN longitude double precision,
  ADD COLUMN location_updated_at timestamptz;

-- Particles are measured 1 minute in every 5, so "latest particle reading" is its own lookup.
CREATE INDEX readings_device_pm_idx ON readings (device_id, recorded_at DESC) WHERE pm25 IS NOT NULL;
