import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { query } from '../db.js';
import { requireUser, signUserToken } from '../auth.js';
import { HttpError } from '../http.js';
import { isDevEmail } from '../config.js';

const router = Router();

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 50, standardHeaders: true, legacyHeaders: false });

const registerSchema = z.object({
  email: z.email().transform((e) => e.toLowerCase()),
  name: z.string().trim().min(1).max(100),
  password: z.string().min(8).max(200),
});
const loginSchema = z.object({
  email: z.string().transform((e) => e.trim().toLowerCase()),
  password: z.string(),
});

const publicUser = (u) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: isDevEmail(u.email) ? 'dev' : 'viewer',
  created_at: u.created_at,
});

router.post('/register', limiter, async (req, res) => {
  const body = registerSchema.parse(req.body);
  const hash = await bcrypt.hash(body.password, 10);
  const { rows } = await query(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO NOTHING RETURNING *`,
    [body.email, body.name, hash],
  );
  if (!rows[0]) throw new HttpError(409, 'An account with that email already exists');
  res.status(201).json({ token: signUserToken(rows[0]), user: publicUser(rows[0]) });
});

router.post('/login', limiter, async (req, res) => {
  const body = loginSchema.parse(req.body);
  const { rows } = await query('SELECT * FROM users WHERE email = $1', [body.email]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(body.password, user.password_hash))) {
    throw new HttpError(401, 'Incorrect email or password');
  }
  res.json({ token: signUserToken(user), user: publicUser(user) });
});

router.get('/me', requireUser, async (req, res) => {
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  if (!rows[0]) throw new HttpError(401, 'Account no longer exists');
  res.json({ user: publicUser(rows[0]) });
});

export default router;
