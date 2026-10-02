import { withTransaction } from './db.js';
import { summarize } from './aqi.js';
import { nameFromGps } from './geocode.js';

// Numeric columns of a reading (averaged in history queries, exported to CSV).
export const METRICS = [
  'pm1', 'pm25', 'pm4', 'pm10', 'voc_index', 'nox_index', 'temperature', 'humidity',
  'battery_voltage', 'battery_current',
];
export const PM_FIELDS = ['pm1', 'pm25', 'pm4', 'pm10'];

// Stations measure particles for 1 minute in every 5 to save power, so most uploads carry
// no PM values. The latest particle reading stays valid for this long (two PM cycles).
export const PM_CARRY_MS = 10 * 60 * 1000;
const ALERT_METRICS = [
  ['pm25', 'pm25_threshold'],
  ['voc_index', 'voc_threshold'],
  ['nox_index', 'nox_threshold'],
];

/** Adds the computed AQI / level / category to a reading row. */
export const withSummary = (r) => (r ? { ...r, ...summarize(r) } : null);

/**
 * Fills a reading's missing PM values from the station's last particle measurement, if that
 * measurement is recent enough, and records when the PM values were measured (pm_recorded_at).
 */
export function withCarriedPm(latest, lastPm) {
  if (!latest) return null;
  if (latest.pm25 != null) return { ...latest, pm_recorded_at: latest.recorded_at };
  if (!lastPm || new Date(latest.recorded_at) - new Date(lastPm.recorded_at) > PM_CARRY_MS) {
    return { ...latest, pm_recorded_at: lastPm?.recorded_at ?? null };
  }
  const pm = Object.fromEntries(PM_FIELDS.map((f) => [f, latest[f] ?? lastPm[f]]));
  return { ...latest, ...pm, pm_recorded_at: lastPm.recorded_at };
}

export const LAST_PM_SQL = `SELECT pm1, pm25, pm4, pm10, recorded_at FROM readings
  WHERE device_id = $1 AND pm25 IS NOT NULL ORDER BY recorded_at DESC LIMIT 1`;

/**
 * Walks the batch in time order and opens / updates / resolves alerts, so readings a
 * device buffered while offline still produce correct alert start and end times.
 * Only state changes hit the database.
 */
async function evaluateAlerts(db, device, readings) {
  const { rows: openRows } = await db.query(
    'SELECT * FROM alerts WHERE device_id = $1 AND resolved_at IS NULL',
    [device.id],
  );
  const open = new Map(openRows.map((a) => [a.metric, { alert: a, peak: a.peak_value }]));
  const events = [];
  const withName = (alert) => ({ ...alert, device_name: device.name });
  const sorted = [...readings].sort((a, b) => a.recorded_at - b.recorded_at);

  for (const reading of sorted) {
    for (const [metric, thresholdCol] of ALERT_METRICS) {
      const value = reading[metric];
      if (value == null) continue;
      const threshold = device[thresholdCol];
      const current = open.get(metric);
      if (value > threshold) {
        if (current) {
          current.peak = Math.max(current.peak, value);
          continue;
        }
        const { rows } = await db.query(
          `INSERT INTO alerts (device_id, metric, threshold, peak_value, started_at)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [device.id, metric, threshold, value, reading.recorded_at],
        );
        open.set(metric, { alert: rows[0], peak: value });
        events.push({ type: 'alert', alert: withName(rows[0]) });
      } else if (current) {
        const { rows } = await db.query(
          `UPDATE alerts SET resolved_at = GREATEST($2::timestamptz, started_at), peak_value = $3
           WHERE id = $1 RETURNING *`,
          [current.alert.id, reading.recorded_at, current.peak],
        );
        open.delete(metric);
        events.push({ type: 'alert_resolved', alert: withName(rows[0]) });
      }
    }
  }
  for (const { alert, peak } of open.values()) {
    if (peak > alert.peak_value) await db.query('UPDATE alerts SET peak_value = $2 WHERE id = $1', [alert.id, peak]);
  }
  return events;
}

/**
 * Stores a batch of readings for a device, updates its alerts and pushes live
 * events to everyone watching. Returns the newest stored reading.
 */
export async function ingestReadings(device, readings, realtime) {
  const result = await withTransaction(async (db) => {
    const { rows: stored } = await db.query(
      `INSERT INTO readings (device_id, recorded_at, network, ${METRICS.join(', ')})
       SELECT $1, r.recorded_at, r.network, ${METRICS.map((m) => `r.${m}`).join(', ')}
       FROM jsonb_to_recordset($2::jsonb) AS r(
         recorded_at timestamptz, network text, ${METRICS.map((m) => `${m} real`).join(', ')})
       RETURNING *`,
      [device.id, JSON.stringify(readings)],
    );
    await db.query('UPDATE devices SET last_seen_at = now() WHERE id = $1', [device.id]);

    // The station reports its own GPS position; keep the newest fix from this batch.
    const fix = readings
      .filter((r) => r.latitude != null && r.longitude != null)
      .sort((a, b) => Date.parse(b.recorded_at) - Date.parse(a.recorded_at))[0];
    if (fix) {
      await db.query(
        `UPDATE devices SET latitude = $2, longitude = $3, location_updated_at = $4
         WHERE id = $1 AND (location_updated_at IS NULL OR location_updated_at <= $4)`,
        [device.id, fix.latitude, fix.longitude, fix.recorded_at],
      );
    }

    const alertEvents = await evaluateAlerts(db, device, stored);
    const newest = stored.reduce((a, b) => (b.recorded_at > a.recorded_at ? b : a));
    const { rows: lastPm } = newest.pm25 == null ? await db.query(LAST_PM_SQL, [device.id]) : { rows: [] };
    return { stored, alertEvents, latest: withCarriedPm(newest, lastPm[0]), location: fix };
  });

  const latest = withSummary(result.latest);
  const { stored, alertEvents, location } = result;
  realtime.broadcast({
    type: 'reading',
    deviceId: device.id,
    reading: latest,
    ...(location && { location: { latitude: location.latitude, longitude: location.longitude, updated_at: location.recorded_at } }),
  });
  for (const event of alertEvents) realtime.broadcast(event);
  if (location) nameFromGps(device, location, realtime);
  return { count: stored.length, latest };
}
