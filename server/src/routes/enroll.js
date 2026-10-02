import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { generateDeviceKey, hashDeviceKey, secretMatches } from '../auth.js';
import { HttpError } from '../http.js';
import { query } from '../db.js';
import { loadStation, serializeDevice, uniqueName } from '../stations.js';

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });

const enrollSchema = z.object({
  // ESP32 hardware ID (e.g. the 48-bit eFuse MAC as hex).
  chip_id: z.string().trim().regex(/^[A-Za-z0-9_-]{4,32}$/, 'letters, digits, - or _ (4-32)'),
  // Optional fixed name; otherwise the station is named from its GPS position.
  name: z.string().trim().min(1).max(100).optional(),
  landmark: z.string().trim().max(200).optional(),
});

export default function enrollRouter(realtime) {
  const router = Router();

  /**
   * POST /api/v1/enroll   Header: X-Enroll-Secret
   * A station switched on for the first time adds itself and receives its own device key.
   * Enrolling again (e.g. after reflashing) keeps the station and its history and issues a new key.
   */
  router.post('/', limiter, async (req, res) => {
    if (!config.enrollSecret) throw new HttpError(503, 'Enrollment is not set up on the server (ENROLL_SECRET)');
    if (!secretMatches(req.get('x-enroll-secret'), config.enrollSecret)) throw new HttpError(401, 'Wrong enroll secret');
    const body = enrollSchema.parse(req.body);
    const chip = body.chip_id.toUpperCase();

    const { rows: blocked } = await query('SELECT 1 FROM blocked_chips WHERE chip_id = $1', [chip]);
    if (blocked.length) throw new HttpError(403, 'This device has been blocked by the Ginhawa team');

    const apiKey = generateDeviceKey();
    let { rows: existing } = await query('SELECT id FROM devices WHERE chip_id = $1', [chip]);
    if (!existing[0] && body.name) {
      // A station added before self-enrollment existed (no hardware ID yet) with the same name and
      // landmark is taken over by this device, keeping its history instead of making a duplicate.
      ({ rows: existing } = await query(
        `UPDATE devices SET chip_id = $1 WHERE id = (
           SELECT id FROM devices WHERE chip_id IS NULL AND lower(name) = lower($2)
             AND lower(coalesce(landmark, '')) = lower(coalesce($3, '')) LIMIT 1)
         RETURNING id`,
        [chip, body.name, body.landmark || null],
      ));
    }
    let id;
    let created = false;
    if (existing[0]) {
      id = existing[0].id;
      await query('UPDATE devices SET api_key_hash = $2 WHERE id = $1', [id, hashDeviceKey(apiKey)]);
    } else {
      const landmark = body.landmark || null;
      const name = await uniqueName(body.name ?? `New station (${chip.slice(-4)})`, landmark);
      const { rows } = await query(
        `INSERT INTO devices (chip_id, name, landmark, name_from_gps, api_key_hash)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [chip, name, landmark, !body.name, hashDeviceKey(apiKey)],
      );
      id = rows[0].id;
      created = true;
      realtime.broadcast({ type: 'device_created', deviceId: id });
    }
    const device = serializeDevice(await loadStation(id));
    res.status(created ? 201 : 200).json({ device, apiKey });
  });

  return router;
}
