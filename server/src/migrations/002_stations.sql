-- Each device is a monitoring station, named after where it is placed
-- (e.g. "Barangay Carmen"), with an optional landmark for the exact spot.
-- Stations are shared: every user can see every station.
ALTER TABLE devices RENAME COLUMN location TO landmark;
ALTER TABLE devices DROP COLUMN latitude, DROP COLUMN longitude;
CREATE UNIQUE INDEX devices_station_unique_idx ON devices (lower(name), lower(coalesce(landmark, '')));

-- Remove the mock sites the first simulator version created (MRT station, mall, etc.).
-- Only simulator-made stations used the "Sim · " prefix. Readings and alerts cascade.
DELETE FROM devices WHERE name LIKE 'Sim · %';
