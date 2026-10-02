import { query } from './db.js';
import { config } from './config.js';
import { withCarriedPm, withSummary } from './readings.js';

export const DEVICE_SELECT = `
  SELECT d.*,
    (SELECT to_jsonb(r) FROM readings r WHERE r.device_id = d.id
      ORDER BY r.recorded_at DESC LIMIT 1) AS latest,
    (SELECT to_jsonb(p) FROM (SELECT pm1, pm25, pm4, pm10, recorded_at FROM readings r
      WHERE r.device_id = d.id AND r.pm25 IS NOT NULL ORDER BY r.recorded_at DESC LIMIT 1) p) AS latest_pm,
    (SELECT count(*)::int FROM alerts a WHERE a.device_id = d.id AND a.resolved_at IS NULL) AS open_alerts
  FROM devices d`;

/** Public shape of a station (never includes the key hash; the chip ID only for the team). */
export function serializeDevice(row, admin = false) {
  const { api_key_hash, chip_id, latest, latest_pm, open_alerts, ...device } = row;
  const lastSeen = device.last_seen_at ? new Date(device.last_seen_at).getTime() : 0;
  return {
    ...device,
    ...(admin && { chip_id }),
    online: Date.now() - lastSeen < config.offlineAfterSeconds * 1000,
    latest: withSummary(withCarriedPm(latest ?? null, latest_pm)),
    open_alerts: open_alerts ?? 0,
    can_manage: admin,
  };
}

export async function loadStation(id, db = { query }) {
  const { rows } = await db.query(`${DEVICE_SELECT} WHERE d.id = $1`, [id]);
  return rows[0] ?? null;
}

/**
 * Picks a station name that is not taken yet for this landmark: two stations in the same
 * barangay become "Barangay Carmen" and "Barangay Carmen 2".
 */
export async function uniqueName(name, landmark, exceptId = null, db = { query }) {
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? name : `${name} ${n}`;
    const { rows } = await db.query(
      `SELECT 1 FROM devices WHERE lower(name) = lower($1) AND lower(coalesce(landmark, '')) = lower(coalesce($2, ''))
         AND ($3::uuid IS NULL OR id <> $3)`,
      [candidate, landmark, exceptId],
    );
    if (!rows.length) return candidate;
  }
}
