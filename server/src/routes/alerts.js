import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { requireUser } from '../auth.js';
import { HttpError, isUuid } from '../http.js';

const router = Router();
router.use(requireUser);

const listSchema = z.object({
  status: z.enum(['open', 'all']).default('all'),
  device_id: z.string().refine(isUuid, 'must be a UUID').optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/** GET /alerts?status=open|all&device_id=&limit=  (all stations are shared) */
router.get('/', async (req, res) => {
  const q = listSchema.parse(req.query);
  const { rows } = await query(
    `SELECT a.*, d.name AS device_name FROM alerts a
     JOIN devices d ON d.id = a.device_id
     WHERE ($1::text = 'all' OR a.resolved_at IS NULL)
       AND ($2::uuid IS NULL OR a.device_id = $2)
     ORDER BY a.started_at DESC LIMIT $3`,
    [q.status, q.device_id ?? null, q.limit],
  );
  res.json({ alerts: rows });
});

router.post('/:id/ack', async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) throw new HttpError(404, 'Alert not found');
  const { rows } = await query(
    `UPDATE alerts a SET acknowledged_at = COALESCE(a.acknowledged_at, now())
     FROM devices d WHERE a.id = $1 AND d.id = a.device_id
     RETURNING a.*, d.name AS device_name`,
    [req.params.id],
  );
  if (!rows[0]) throw new HttpError(404, 'Alert not found');
  res.json({ alert: rows[0] });
});

export default router;
