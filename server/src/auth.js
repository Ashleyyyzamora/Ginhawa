import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { query } from './db.js';

// There are no user accounts. Viewing is public; the team signs in with the admin passcode
// to manage stations, and devices authenticate with their own key (or the team secret to enroll).

/** Constant-time comparison of a submitted secret with the configured one. */
export function secretMatches(given, expected) {
  if (!expected || typeof given !== 'string') return false;
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

export const signAdminToken = () =>
  jwt.sign({ role: 'admin' }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });

function adminFromRequest(req) {
  const [scheme, token] = (req.get('authorization') ?? '').split(' ');
  if (scheme !== 'Bearer' || !token) return false;
  try {
    return jwt.verify(token, config.jwtSecret).role === 'admin';
  } catch {
    return false;
  }
}

/** Marks the request as coming from the team (req.admin) without requiring it. */
export function optionalAdmin(req, res, next) {
  req.admin = adminFromRequest(req);
  next();
}

export function requireAdmin(req, res, next) {
  req.admin = adminFromRequest(req);
  if (!req.admin) return res.status(401).json({ error: 'Admin sign-in required' });
  next();
}

export const generateDeviceKey = () => `gnh_${crypto.randomBytes(24).toString('base64url')}`;
export const hashDeviceKey = (key) => crypto.createHash('sha256').update(key).digest('hex');

/** Authenticates an IoT device by its `X-Device-Key` header. */
export async function requireDevice(req, res, next) {
  const key = req.get('x-device-key');
  if (!key) return res.status(401).json({ error: 'Missing X-Device-Key header' });
  try {
    const { rows } = await query('SELECT * FROM devices WHERE api_key_hash = $1', [hashDeviceKey(key)]);
    if (!rows[0]) return res.status(401).json({ error: 'Unknown device key' });
    req.device = rows[0];
    next();
  } catch (err) {
    next(err);
  }
}
