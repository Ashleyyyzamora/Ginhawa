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
  // A device that has not reported for this long is shown as offline.
  offlineAfterSeconds: Number(env.OFFLINE_AFTER_SECONDS ?? 120),
  // Used for "hour of day" foot-traffic profiles.
  timezone: env.TZ_NAME ?? 'Asia/Manila',
};

if (config.env === 'production' && config.jwtSecret === DEV_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}
