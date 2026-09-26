import { WebSocketServer } from 'ws';
import { verifyUserToken } from './auth.js';

const AUTH_TIMEOUT_MS = 5000;
const HEARTBEAT_MS = 30000;

/**
 * WebSocket hub mounted at /ws.
 *
 * Protocol (JSON messages):
 *   client -> server  { "type": "auth", "token": "<JWT>" }      (must be the first message)
 *   server -> client  { "type": "ready", "user": {...} }
 *   server -> client  { "type": "reading", "deviceId", "reading" }
 *   server -> client  { "type": "alert" | "alert_resolved", "alert" }
 *   server -> client  { "type": "device_updated" | "device_deleted", ... }
 *
 * Users only ever receive events for devices they own.
 */
export function createRealtime(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  const socketsByUser = new Map();

  const send = (ws, msg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg));

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => (ws.isAlive = true));

    const authTimer = setTimeout(() => ws.close(4401, 'auth timeout'), AUTH_TIMEOUT_MS);

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return send(ws, { type: 'error', error: 'invalid JSON' });
      }
      if (msg.type === 'ping') return send(ws, { type: 'pong' });
      if (msg.type !== 'auth' || ws.user) return;
      try {
        ws.user = verifyUserToken(msg.token);
      } catch {
        return ws.close(4401, 'unauthorized');
      }
      clearTimeout(authTimer);
      if (!socketsByUser.has(ws.user.id)) socketsByUser.set(ws.user.id, new Set());
      socketsByUser.get(ws.user.id).add(ws);
      send(ws, { type: 'ready', user: ws.user });
    });

    ws.on('close', () => {
      clearTimeout(authTimer);
      const set = ws.user && socketsByUser.get(ws.user.id);
      if (set) {
        set.delete(ws);
        if (set.size === 0) socketsByUser.delete(ws.user.id);
      }
    });
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
    publishToUser(userId, msg) {
      for (const ws of socketsByUser.get(userId) ?? []) send(ws, msg);
    },
    close() {
      clearInterval(heartbeat);
      for (const ws of wss.clients) ws.terminate();
      wss.close();
    },
  };
}

/** No-op publisher, handy for scripts and tests that don't need live updates. */
export const nullRealtime = { publishToUser() {}, close() {} };
