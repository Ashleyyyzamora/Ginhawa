import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { requireAdmin, secretMatches, signAdminToken } from '../auth.js';
import { HttpError } from '../http.js';

const router = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });

/** POST /admin/login { passcode } -> { token }: the team's sign-in for managing stations. */
router.post('/login', limiter, (req, res) => {
  const { passcode } = z.object({ passcode: z.string().max(200) }).parse(req.body);
  if (!config.adminPasscode) throw new HttpError(503, 'Admin passcode is not set on the server (ADMIN_PASSCODE)');
  if (!secretMatches(passcode, config.adminPasscode)) throw new HttpError(401, 'Incorrect passcode');
  res.json({ token: signAdminToken() });
});

/** GET /admin/me: checks that a saved admin token is still valid. */
router.get('/me', requireAdmin, (req, res) => res.json({ admin: true }));

export default router;
