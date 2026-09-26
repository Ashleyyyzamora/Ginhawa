import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { query } from './db.js';

export function signUserToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, name: user.name }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

/** Returns { id, email, name } or throws. */
export function verifyUserToken(token) {
  const payload = jwt.verify(token, config.jwtSecret);
  return { id: payload.sub, email: payload.email, name: payload.name };
}

export function requireUser(req, res, next) {
  const header = req.get('authorization') ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return res.status(401).json({ error: 'Missing bearer token' });
  try {
    req.user = verifyUserToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
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
