import { Router } from 'express';
import { z } from 'zod';
import { requireDevice } from '../auth.js';
import { ingestReadings } from '../readings.js';

const MAX_FUTURE_MS = 5 * 60 * 1000;

const num = (min, max) => z.number().finite().min(min).max(max).nullish();
const readingSchema = z
  .object({
    // Optional: devices without a real-time clock can omit it and the server time is used.
    recorded_at: z.iso.datetime({ offset: true }).optional(),
    pm1: num(0, 1000),
    pm25: num(0, 1000),
    pm4: num(0, 1000),
    pm10: num(0, 1000),
    voc_index: num(0, 500),
    nox_index: num(0, 500),
    temperature: num(-40, 85),
    humidity: num(0, 100),
  })
  .transform((r) => {
    const now = Date.now();
    let ts = r.recorded_at ? Date.parse(r.recorded_at) : now;
    if (ts > now + MAX_FUTURE_MS) ts = now; // device clock is wrong; trust the server
    return { ...r, recorded_at: new Date(ts).toISOString() };
  });

// Accepts a single reading, or { readings: [...] } for devices that buffer while offline.
const payloadSchema = z.union([
  z.object({ readings: z.array(readingSchema).min(1).max(500) }),
  readingSchema.transform((r) => ({ readings: [r] })),
]);

export default function ingestRouter(realtime) {
  const router = Router();

  /**
   * POST /api/v1/ingest
   * Header: X-Device-Key: gnh_...
   */
  router.post('/', requireDevice, async (req, res) => {
    const { readings } = payloadSchema.parse(req.body);
    const { count, latest } = await ingestReadings(req.device, readings, realtime);
    // The compact status lets the device drive a local LED / buzzer.
    res.status(201).json({ accepted: count, status: { aqi: latest.aqi, level: latest.level, category: latest.category } });
  });

  return router;
}
