import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { config } from '../config.js';
import { requireUser, requireDev, generateDeviceKey, hashDeviceKey } from '../auth.js';
import { HttpError, isUuid } from '../http.js';
import { METRICS, withCarriedPm, withSummary } from '../readings.js';

const BUCKETS = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '6h': 21600, '1d': 86400 };
const MAX_POINTS = 500;

// Each device is a station: `name` is where it is placed (e.g. "Barangay Carmen"),
// `landmark` is the exact spot (e.g. "near the public market entrance").
const deviceFields = {
  name: z.string().trim().min(1).max(100),
  landmark: z.string().trim().max(200).nullish(),
};
const createSchema = z.object(deviceFields);
const updateSchema = z
  .object({
    ...deviceFields,
    pm25_threshold: z.number().positive().max(1000),
    voc_threshold: z.number().positive().max(500),
    nox_threshold: z.number().positive().max(500),
    // Manual location, for stations that cannot get a GPS fix (e.g. under a roof).
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
  })
  .partial()
  .refine((b) => ('latitude' in b) === ('longitude' in b), { message: 'latitude and longitude must be sent together' });

const rangeSchema = z.object({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  bucket: z.enum(['auto', 'raw', ...Object.keys(BUCKETS)]).default('auto'),
});

/** Public shape of a device (never includes the key hash). */
function serializeDevice(row, user) {
  const { api_key_hash, owner_id, latest, latest_pm, open_alerts, ...device } = row;
  const lastSeen = device.last_seen_at ? new Date(device.last_seen_at).getTime() : 0;
  return {
    ...device,
    online: Date.now() - lastSeen < config.offlineAfterSeconds * 1000,
    latest: withSummary(withCarriedPm(latest ?? null, latest_pm)),
    open_alerts: open_alerts ?? 0,
    // Stations are visible to everyone; only developers may change them.
    can_manage: user.isDev,
  };
}

const DEVICE_SELECT = `
  SELECT d.*,
    (SELECT to_jsonb(r) FROM readings r WHERE r.device_id = d.id
      ORDER BY r.recorded_at DESC LIMIT 1) AS latest,
    (SELECT to_jsonb(p) FROM (SELECT pm1, pm25, pm4, pm10, recorded_at FROM readings r
      WHERE r.device_id = d.id AND r.pm25 IS NOT NULL ORDER BY r.recorded_at DESC LIMIT 1) p) AS latest_pm,
    (SELECT count(*)::int FROM alerts a WHERE a.device_id = d.id AND a.resolved_at IS NULL) AS open_alerts,
    u.name AS created_by
  FROM devices d JOIN users u ON u.id = d.owner_id`;

async function loadDevice(req) {
  const { id } = req.params;
  if (!isUuid(id)) throw new HttpError(404, 'Station not found');
  const { rows } = await query(`${DEVICE_SELECT} WHERE d.id = $1`, [id]);
  if (!rows[0]) throw new HttpError(404, 'Station not found');
  return rows[0];
}

async function loadManagedDevice(req) {
  if (!req.user.isDev) throw new HttpError(403, 'Only developers can manage stations');
  return loadDevice(req);
}

// The unique index on (name, landmark) turns duplicate stations into a clear message.
function duplicateStation(err) {
  if (err.code === '23505' && err.constraint === 'devices_station_unique_idx') {
    return new HttpError(409, 'A station with that name and landmark already exists');
  }
  return err;
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
    const { rows } = await query(`${DEVICE_SELECT} ORDER BY lower(d.name), lower(coalesce(d.landmark, ''))`);
    res.json({ devices: rows.map((r) => serializeDevice(r, req.user)) });
  });

  router.post('/', requireDev, async (req, res) => {
    const body = createSchema.parse(req.body);
    const apiKey = generateDeviceKey();
    const { rows } = await query(
      `INSERT INTO devices (owner_id, name, landmark, api_key_hash) VALUES ($1, $2, $3, $4) RETURNING id`,
      [req.user.id, body.name, body.landmark || null, hashDeviceKey(apiKey)],
    ).catch((err) => {
      throw duplicateStation(err);
    });
    req.params.id = rows[0].id;
    const device = serializeDevice(await loadDevice(req), req.user);
    realtime.broadcast({ type: 'device_created', deviceId: device.id });
    // The plain key is only ever returned here (and on rotate).
    res.status(201).json({ device, apiKey });
  });

  router.get('/:id', async (req, res) => {
    res.json({ device: serializeDevice(await loadDevice(req), req.user) });
  });

  router.patch('/:id', async (req, res) => {
    const device = await loadManagedDevice(req);
    const body = updateSchema.parse(req.body);
    if (body.landmark === '') body.landmark = null;
    const keys = Object.keys(body);
    if (keys.length) {
      let sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
      if ('latitude' in body) sets += `, location_updated_at = ${body.latitude == null ? 'NULL' : 'now()'}`;
      await query(`UPDATE devices SET ${sets} WHERE id = $1`, [device.id, ...keys.map((k) => body[k] ?? null)]).catch(
        (err) => {
          throw duplicateStation(err);
        },
      );
    }
    const updated = serializeDevice(await loadDevice(req), req.user);
    // can_manage depends on who is looking, so leave it out of the broadcast.
    const { can_manage, ...shared } = updated;
    realtime.broadcast({ type: 'device_updated', device: shared });
    res.json({ device: updated });
  });

  router.delete('/:id', async (req, res) => {
    const device = await loadManagedDevice(req);
    await query('DELETE FROM devices WHERE id = $1', [device.id]);
    realtime.broadcast({ type: 'device_deleted', deviceId: device.id });
    res.status(204).end();
  });

  router.post('/:id/rotate-key', async (req, res) => {
    const device = await loadManagedDevice(req);
    const apiKey = generateDeviceKey();
    await query('UPDATE devices SET api_key_hash = $2 WHERE id = $1', [device.id, hashDeviceKey(apiKey)]);
    res.json({ apiKey });
  });

  /**
   * GET /devices/:id/readings?from=ISO&to=ISO&bucket=auto|raw|1m|5m|15m|1h|6h|1d
   * Aggregated (average) time series; defaults to the last 24 h.
   */
  router.get('/:id/readings', async (req, res) => {
    const device = await loadDevice(req);
    const { fromDate, toDate, seconds } = resolveRange(req.query);
    let rows;
    if (seconds == null) {
      ({ rows } = await query(
        `SELECT recorded_at AS t, network, ${METRICS.join(', ')} FROM readings
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
    const device = await loadDevice(req);
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
    const device = await loadDevice(req);
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
