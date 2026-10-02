import { WebSocketServer } from 'ws';

const HEARTBEAT_MS = 30000;

/**
 * WebSocket hub mounted at /ws. Live data is public, so no sign-in is needed.
 *
 * Protocol (JSON messages):
 *   server -> client  { "type": "ready" }                         (right after connecting)
 *   server -> client  { "type": "reading", "deviceId", "reading", "location"? }
 *   server -> client  { "type": "alert" | "alert_resolved", "alert" }
 *   server -> client  { "type": "device_created" | "device_deleted", "deviceId" }
 *   server -> client  { "type": "device_updated", "device" }
 *   client -> server  { "type": "ping" }  ->  { "type": "pong" }
 */
export function createRealtime(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  const send = (ws, msg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg));

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => (ws.isAlive = true));
    ws.on('message', (raw) => {
      try {
        if (JSON.parse(raw.toString()).type === 'ping') send(ws, { type: 'pong' });
      } catch {
        send(ws, { type: 'error', error: 'invalid JSON' });
      }
    });
    send(ws, { type: 'ready' });
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_MS);

  return {
    broadcast(msg) {
      for (const ws of wss.clients) send(ws, msg);
    },
    close() {
      clearInterval(heartbeat);
      for (const ws of wss.clients) ws.terminate();
      wss.close();
    },
  };
}

/** No-op publisher, handy for scripts and tests that don't need live updates. */
export const nullRealtime = { broadcast() {}, close() {} };
