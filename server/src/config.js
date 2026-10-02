const env = process.env;

const DEV_SECRET = 'dev-only-insecure-secret-change-me';

export const config = {
  env: env.NODE_ENV ?? 'development',
  port: Number(env.PORT ?? 4000),
  databaseUrl: env.DATABASE_URL ?? 'postgres://ginhawa:ginhawa@localhost:5432/ginhawa',
  jwtSecret: env.JWT_SECRET ?? DEV_SECRET,
  jwtExpiresIn: env.JWT_EXPIRES_IN ?? '7d',
  corsOrigin: env.CORS_ORIGIN ?? '*',
  // Optional: serve HTTPS directly from Node (when not running behind the Caddy proxy).
  tlsKeyFile: env.TLS_KEY_FILE,
  tlsCertFile: env.TLS_CERT_FILE,
  // A station that has not reported for this long is shown as offline.
  // Stations upload once a minute, so this allows a few missed uploads.
  offlineAfterSeconds: Number(env.OFFLINE_AFTER_SECONDS ?? 300),
  // Used for "hour of day" foot-traffic profiles.
  timezone: env.TZ_NAME ?? 'Asia/Manila',
  // Team passcode for managing stations in the app (rename, thresholds, remove). No user accounts.
  adminPasscode: env.ADMIN_PASSCODE ?? '',
  // Shared secret built into the team's firmware: a device that knows it can add itself as a station.
  enrollSecret: env.ENROLL_SECRET ?? '',
  // Reverse geocoding (OpenStreetMap Nominatim) names new stations after their barangay.
  // Set GEOCODE_URL to an empty string to turn it off.
  geocodeUrl: env.GEOCODE_URL ?? 'https://nominatim.openstreetmap.org',
};

if (config.env === 'production' && config.jwtSecret === DEV_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}
if (config.env === 'production' && (!config.adminPasscode || !config.enrollSecret)) {
  throw new Error('ADMIN_PASSCODE and ENROLL_SECRET must be set in production (see .env.example)');
}
