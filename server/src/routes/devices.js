import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { config } from '../config.js';
import { requireUser, generateDeviceKey, hashDeviceKey } from '../auth.js';
import { HttpError, isUuid } from '../http.js';
import { METRICS, withSummary } from '../readings.js';

const BUCKETS = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '6h': 21600, '1d': 86400 };
const MAX_POINTS = 500;

const deviceFields = {
  name: z.string().trim().min(1).max(100),
  location: z.string().trim().max(200).nullish(),
  latitude: z.number().min(-90).max(90).nullish(),
  longitude: z.number().min(-180).max(180).nullish(),
};
const createSchema = z.object(deviceFields);
const updateSchema = z
  .object({
    ...deviceFields,
    pm25_threshold: z.number().positive().max(1000),
    voc_threshold: z.number().positive().max(500),
    nox_threshold: z.number().positive().max(500),
  })
  .partial();

const rangeSchema = z.object({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  bucket: z.enum(['auto', 'raw', ...Object.keys(BUCKETS)]).default('auto'),
});

/** Public shape of a device (never includes the key hash). */
function serializeDevice(row) {
  const { api_key_hash, owner_id, latest, open_alerts, ...device } = row;
  const lastSeen = device.last_seen_at ? new Date(device.last_seen_at).getTime() : 0;
  return {
    ...device,
    online: Date.now() - lastSeen < config.offlineAfterSeconds * 1000,
    latest: withSummary(latest ?? null),
    open_alerts: open_alerts ?? 0,
  };
}

const DEVICE_SELECT = `
  SELECT d.*,
    (SELECT to_jsonb(r) FROM readings r WHERE r.device_id = d.id
      ORDER BY r.recorded_at DESC LIMIT 1) AS latest,
    (SELECT count(*)::int FROM alerts a WHERE a.device_id = d.id AND a.resolved_at IS NULL) AS open_alerts
  FROM devices d`;

async function loadOwnedDevice(req) {
  const { id } = req.params;
  if (!isUuid(id)) throw new HttpError(404, 'Device not found');
  const { rows } = await query(`${DEVICE_SELECT} WHERE d.id = $1 AND d.owner_id = $2`, [id, req.user.id]);
  if (!rows[0]) throw new HttpError(404, 'Device not found');
  return rows[0];
}

function resolveRange(q) {
  const { from, to, bucket } = rangeSchema.parse(q);
  // Default "to" allows for device clocks running slightly ahead of the server.
  const toDate = to ? new Date(to) : new Date(Date.now() + 5 * 60 * 1000);
  const fromDate = from ? new Date(from) : new Date(Date.now() - 24 * 3600 * 1000);
  if (fromDate >= toDate) throw new HttpError(400, '`from` must be before `to`');
  const spanSeconds = (toDate - fromDate) / 1000;
  let seconds = null;
  if (bucket === 'auto') {
    seconds = Object.values(BUCKETS).find((s) => spanSeconds / s <= MAX_POINTS) ?? BUCKETS['1d'];
  } else if (bucket !== 'raw') {
    seconds = BUCKETS[bucket];
  }
  return { fromDate, toDate, seconds };
}

export default function devicesRouter(realtime) {
  const router = Router();
  router.use(requireUser);

  router.get('/', async (req, res) => {
    const { rows } = await query(`${DEVICE_SELECT} WHERE d.owner_id = $1 ORDER BY d.created_at`, [req.user.id]);
    res.json({ devices: rows.map(serializeDevice) });
  });

  router.post('/', async (req, res) => {
    const body = createSchema.parse(req.body);
    const apiKey = generateDeviceKey();
    const { rows } = await query(
      `INSERT INTO devices (owner_id, name, location, latitude, longitude, api_key_hash)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.user.id, body.name, body.location ?? null, body.latitude ?? null, body.longitude ?? null, hashDeviceKey(apiKey)],
    );
    // The plain key is only ever returned here (and on rotate).
    res.status(201).json({ device: serializeDevice(rows[0]), apiKey });
  });

  router.get('/:id', async (req, res) => {
    res.json({ device: serializeDevice(await loadOwnedDevice(req)) });
  });

  router.patch('/:id', async (req, res) => {
    const device = await loadOwnedDevice(req);
    const body = updateSchema.parse(req.body);
    const keys = Object.keys(body);
    if (keys.length) {
      const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
      await query(`UPDATE devices SET ${sets} WHERE id = $1`, [device.id, ...keys.map((k) => body[k] ?? null)]);
    }
    const updated = serializeDevice(await loadOwnedDevice(req));
    realtime.publishToUser(req.user.id, { type: 'device_updated', device: updated });
    res.json({ device: updated });
  });

  router.delete('/:id', async (req, res) => {
    const device = await loadOwnedDevice(req);
    await query('DELETE FROM devices WHERE id = $1', [device.id]);
    realtime.publishToUser(req.user.id, { type: 'device_deleted', deviceId: device.id });
    res.status(204).end();
  });

  router.post('/:id/rotate-key', async (req, res) => {
    const device = await loadOwnedDevice(req);
    const apiKey = generateDeviceKey();
    await query('UPDATE devices SET api_key_hash = $2 WHERE id = $1', [device.id, hashDeviceKey(apiKey)]);
    res.json({ apiKey });
  });

  /**
   * GET /devices/:id/readings?from=ISO&to=ISO&bucket=auto|raw|1m|5m|15m|1h|6h|1d
   * Aggregated (average) time series; defaults to the last 24 h.
   */
  router.get('/:id/readings', async (req, res) => {
    const device = await loadOwnedDevice(req);
    const { fromDate, toDate, seconds } = resolveRange(req.query);
    let rows;
    if (seconds == null) {
      ({ rows } = await query(
        `SELECT recorded_at AS t, ${METRICS.join(', ')} FROM readings
         WHERE device_id = $1 AND recorded_at >= $2 AND recorded_at < $3
         ORDER BY recorded_at LIMIT 5000`,
        [device.id, fromDate, toDate],
      ));
    } else {
      ({ rows } = await query(
        `SELECT date_bin(make_interval(secs => $4), recorded_at, TIMESTAMPTZ '2000-01-01') AS t,
           ${METRICS.map((m) => `avg(${m})::real AS ${m}`).join(', ')},
           max(pm25)::real AS pm25_max, count(*)::int AS samples
         FROM readings
         WHERE device_id = $1 AND recorded_at >= $2 AND recorded_at < $3
         GROUP BY 1 ORDER BY 1`,
        [device.id, fromDate, toDate, seconds],
      ));
    }
    res.json({ from: fromDate, to: toDate, bucket_seconds: seconds, points: rows });
  });

  /**
   * GET /devices/:id/hourly-profile?days=7
   * Average pollution per hour of day — shows how foot traffic affects air quality.
   */
  router.get('/:id/hourly-profile', async (req, res) => {
    const device = await loadOwnedDevice(req);
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(90).default(7) }).parse(req.query);
    const { rows } = await query(
      `SELECT extract(hour FROM recorded_at AT TIME ZONE $3)::int AS hour,
         avg(pm25)::real AS pm25, avg(voc_index)::real AS voc_index, avg(nox_index)::real AS nox_index,
         count(*)::int AS samples
       FROM readings
       WHERE device_id = $1 AND recorded_at >= now() - make_interval(days => $2)
       GROUP BY 1 ORDER BY 1`,
      [device.id, days, config.timezone],
    );
    res.json({ days, timezone: config.timezone, hours: rows });
  });

  /** GET /devices/:id/export.csv?from&to — raw readings for analysis in Excel / Python. */
  router.get('/:id/export.csv', async (req, res) => {
    const device = await loadOwnedDevice(req);
    const { fromDate, toDate } = resolveRange({ ...req.query, bucket: 'raw' });
    const { rows } = await query(
      `SELECT recorded_at, ${METRICS.join(', ')} FROM readings
       WHERE device_id = $1 AND recorded_at >= $2 AND recorded_at < $3 ORDER BY recorded_at`,
      [device.id, fromDate, toDate],
    );
    const header = ['recorded_at', ...METRICS].join(',');
    const lines = rows.map((r) =>
      [r.recorded_at.toISOString(), ...METRICS.map((m) => (r[m] == null ? '' : r[m]))].join(','),
    );
    const filename = `${device.name.replace(/[^a-z0-9-_]+/gi, '_')}_readings.csv`;
    res.type('text/csv').attachment(filename).send([header, ...lines].join('\n'));
  });

  return router;
}
