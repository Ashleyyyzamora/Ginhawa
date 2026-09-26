import http from 'node:http';
import https from 'node:https';
import { readFileSync } from 'node:fs';
import { config } from './config.js';
import { pool } from './db.js';
import { migrate } from './migrate.js';
import { createApp } from './app.js';
import { createRealtime } from './realtime.js';

/** Starts the API + WebSocket server. Exported so tests can boot it on a random port. */
export async function start({ port = config.port } = {}) {
  await migrate();

  // `realtime` needs the HTTP server and the app needs `realtime`, so hand the app a
  // forwarding object and fill it in once the server exists.
  const hub = { publishToUser: () => {}, close: () => {} };
  const app = createApp({ publishToUser: (...a) => hub.publishToUser(...a) });

  const server =
    config.tlsKeyFile && config.tlsCertFile
      ? https.createServer({ key: readFileSync(config.tlsKeyFile), cert: readFileSync(config.tlsCertFile) }, app)
      : http.createServer(app);
  Object.assign(hub, createRealtime(server));

  await new Promise((resolve) => server.listen(port, resolve));
  const scheme = server instanceof https.Server ? 'https' : 'http';
  console.log(`Ginhawa API listening on ${scheme}://0.0.0.0:${server.address().port}`);

  return {
    server,
    port: server.address().port,
    async stop() {
      hub.close();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const instance = await start().catch((err) => {
    console.error('Failed to start:', err);
    process.exit(1);
  });
  const shutdown = async () => {
    await instance.stop();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
