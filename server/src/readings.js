import { withTransaction } from './db.js';
import { summarize } from './aqi.js';

export const METRICS = ['pm1', 'pm25', 'pm4', 'pm10', 'voc_index', 'nox_index', 'temperature', 'humidity'];
const ALERT_METRICS = [
  ['pm25', 'pm25_threshold'],
  ['voc_index', 'voc_threshold'],
  ['nox_index', 'nox_threshold'],
];

/** Adds the computed AQI / level / category to a reading row. */
export const withSummary = (r) => (r ? { ...r, ...summarize(r) } : null);

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
 * events to the device owner. Returns the newest stored reading.
 */
export async function ingestReadings(device, readings, realtime) {
  const { stored, alertEvents } = await withTransaction(async (db) => {
    const { rows: stored } = await db.query(
      `INSERT INTO readings (device_id, recorded_at, ${METRICS.join(', ')})
       SELECT $1, r.recorded_at, ${METRICS.map((m) => `r.${m}`).join(', ')}
       FROM jsonb_to_recordset($2::jsonb) AS r(
         recorded_at timestamptz, ${METRICS.map((m) => `${m} real`).join(', ')})
       RETURNING *`,
      [device.id, JSON.stringify(readings)],
    );
    await db.query('UPDATE devices SET last_seen_at = now() WHERE id = $1', [device.id]);

    const alertEvents = await evaluateAlerts(db, device, stored);
    return { stored, alertEvents };
  });

  const latest = withSummary(stored.reduce((a, b) => (b.recorded_at > a.recorded_at ? b : a)));
  realtime.publishToUser(device.owner_id, { type: 'reading', deviceId: device.id, reading: latest });
  for (const event of alertEvents) realtime.publishToUser(device.owner_id, event);
  return { count: stored.length, latest };
}
