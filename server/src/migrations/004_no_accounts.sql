-- No user accounts: anyone can view the stations, stations add themselves when a sensor is
-- switched on (enrollment with the team secret), and the team manages them with an admin passcode.
ALTER TABLE devices DROP COLUMN owner_id;
DROP TABLE users;

ALTER TABLE devices
  ADD COLUMN chip_id text UNIQUE,                          -- ESP32 hardware ID, set by enrollment
  ADD COLUMN name_from_gps boolean NOT NULL DEFAULT false;  -- name follows the GPS address until renamed

-- Removed stations whose device must not join again (e.g. lost or stolen).
CREATE TABLE blocked_chips (
  chip_id    text PRIMARY KEY,
  blocked_at timestamptz NOT NULL DEFAULT now()
);
