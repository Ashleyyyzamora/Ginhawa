// End-to-end test against a real PostgreSQL database.
// Run with: TEST_DATABASE_URL=postgres://... npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';

const dbUrl = process.env.TEST_DATABASE_URL;
// Developers can manage stations; everyone else is a viewer.
process.env.DEV_EMAILS = 'student@example.com, Batch@Example.com, dev2@example.com';
const opts = { skip: dbUrl ? false : 'set TEST_DATABASE_URL to run API tests' };

let base, wsUrl, instance, pool;

before(async () => {
  if (!dbUrl) return;
  process.env.DATABASE_URL = dbUrl;
  ({ pool } = await import('../src/db.js'));
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const { start } = await import('../src/index.js');
  instance = await start({ port: 0 });
  base = `http://127.0.0.1:${instance.port}/api/v1`;
  wsUrl = `ws://127.0.0.1:${instance.port}/ws`;
});

after(async () => {
  if (!dbUrl) return;
  await instance.stop();
  await pool.end();
});

async function api(path, { token, deviceKey, ...init } = {}) {
  const res = await fetch(base + path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token && { authorization: `Bearer ${token}` }),
      ...(deviceKey && { 'x-device-key': deviceKey }),
    },
    body: init.body && JSON.stringify(init.body),
  });
  const text = await res.text();
  let body = text;
  try {
    body = JSON.parse(text);
  } catch {}
  return { status: res.status, body };
}

function nextMessage(ws, type) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${type}`)), 3000);
    ws.on('message', function handler(raw) {
      const msg = JSON.parse(raw);
      if (msg.type === type) {
        clearTimeout(timer);
        ws.off('message', handler);
        resolve(msg);
      }
    });
  });
}

test('full flow: register, add device, ingest, live updates, alerts, history', opts, async () => {
  const reg = await api('/auth/register', {
    method: 'POST',
    body: { email: 'Student@Example.com', name: 'Student', password: 'password123' },
  });
  assert.equal(reg.status, 201);
  assert.equal(reg.body.user.role, 'dev');
  const token = reg.body.token;

  const dup = await api('/auth/register', {
    method: 'POST',
    body: { email: 'student@example.com', name: 'X', password: 'password123' },
  });
  assert.equal(dup.status, 409);

  const login = await api('/auth/login', { method: 'POST', body: { email: 'student@example.com', password: 'password123' } });
  assert.equal(login.status, 200);
  const badLogin = await api('/auth/login', { method: 'POST', body: { email: 'student@example.com', password: 'nope' } });
  assert.equal(badLogin.status, 401);

  const created = await api('/devices', {
    method: 'POST',
    token,
    body: { name: 'Barangay Test', landmark: 'Near the market' },
  });
  assert.equal(created.status, 201);
  const { device, apiKey } = created.body;
  assert.match(apiKey, /^gnh_/);
  assert.equal(device.api_key_hash, undefined);
  assert.equal(device.landmark, 'Near the market');
  assert.equal(device.created_by, 'Student');
  assert.equal(device.can_manage, true);

  // Same name + landmark is a duplicate station (case-insensitive); another landmark is fine.
  const dupStation = await api('/devices', { method: 'POST', token, body: { name: 'barangay test', landmark: 'near the MARKET' } });
  assert.equal(dupStation.status, 409);
  const second = await api('/devices', { method: 'POST', token, body: { name: 'Barangay Test', landmark: 'Plaza' } });
  assert.equal(second.status, 201);
  assert.equal((await api(`/devices/${second.body.device.id}`, { method: 'DELETE', token })).status, 204);

  // Live channel
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.on('open', r));
  const ready = nextMessage(ws, 'ready');
  ws.send(JSON.stringify({ type: 'auth', token }));
  await ready;

  assert.equal((await api('/ingest', { method: 'POST', body: { pm25: 5 } })).status, 401);
  assert.equal((await api('/ingest', { method: 'POST', deviceKey: apiKey, body: { pm25: -1 } })).status, 400);

  const liveReading = nextMessage(ws, 'reading');
  const liveAlert = nextMessage(ws, 'alert');
  const ingest = await api('/ingest', {
    method: 'POST',
    deviceKey: apiKey,
    body: { pm1: 30, pm25: 60, pm10: 80, voc_index: 120, nox_index: 3, temperature: 31, humidity: 70 },
  });
  assert.equal(ingest.status, 201);
  assert.equal(ingest.body.accepted, 1);
  assert.equal(ingest.body.status.aqi, 154);
  const msg = await liveReading;
  assert.equal(msg.deviceId, device.id);
  assert.equal(msg.reading.pm25, 60);
  const alertMsg = await liveAlert;
  assert.equal(alertMsg.alert.metric, 'pm25');

  // Another high reading must not open a second alert, just raise the peak.
  await api('/ingest', { method: 'POST', deviceKey: apiKey, body: { pm25: 90 } });
  let alerts = await api('/alerts?status=open', { token });
  assert.equal(alerts.body.alerts.length, 1);
  assert.equal(alerts.body.alerts[0].peak_value, 90);

  // Clean air resolves it.
  const resolved = nextMessage(ws, 'alert_resolved');
  const t0 = Date.now();
  await api('/ingest', {
    method: 'POST',
    deviceKey: apiKey,
    body: {
      readings: [
        { recorded_at: new Date(t0 + 1000).toISOString(), pm25: 8, voc_index: 100, nox_index: 1 },
        { recorded_at: new Date(t0 + 2000).toISOString(), pm25: 6, voc_index: 100, nox_index: 1 },
      ],
    },
  });
  await resolved;
  alerts = await api('/alerts?status=open', { token });
  assert.equal(alerts.body.alerts.length, 0);
  ws.close();

  const list = await api('/devices', { token });
  assert.equal(list.body.devices.length, 1);
  assert.equal(list.body.devices[0].online, true);
  assert.equal(list.body.devices[0].latest.pm25, 6);

  const raw = await api(`/devices/${device.id}/readings?bucket=raw`, { token });
  assert.equal(raw.body.points.length, 4);
  const agg = await api(`/devices/${device.id}/readings?bucket=1h`, { token });
  assert.ok(agg.body.points.length >= 1);
  assert.equal(agg.body.points.reduce((s, p) => s + p.samples, 0), 4);

  const profile = await api(`/devices/${device.id}/hourly-profile`, { token });
  assert.equal(profile.status, 200);
  assert.ok(profile.body.hours.length >= 1);

  const csv = await api(`/devices/${device.id}/export.csv`, { token });
  assert.equal(csv.status, 200);
  assert.equal(csv.body.split('\n').length, 5);

  const patched = await api(`/devices/${device.id}`, { method: 'PATCH', token, body: { pm25_threshold: 50 } });
  assert.equal(patched.body.device.pm25_threshold, 50);

  // Stations are shared: viewers can see them and their data, but not add or change them.
  const other = await api('/auth/register', { method: 'POST', body: { email: 'o@x.com', name: 'O', password: 'password123' } });
  assert.equal(other.body.user.role, 'viewer');
  const otherToken = other.body.token;
  assert.equal((await api('/devices', { method: 'POST', token: otherToken, body: { name: 'Nope' } })).status, 403);
  const seen = await api(`/devices/${device.id}`, { token: otherToken });
  assert.equal(seen.status, 200);
  assert.equal(seen.body.device.can_manage, false);
  assert.equal((await api('/devices', { token: otherToken })).body.devices.length, 1);
  assert.equal((await api(`/devices/${device.id}/readings?bucket=raw`, { token: otherToken })).body.points.length, 4);
  assert.equal((await api('/alerts', { token: otherToken })).body.alerts.length, 1);
  assert.equal((await api(`/devices/${device.id}`, { method: 'PATCH', token: otherToken, body: { name: 'x' } })).status, 403);
  assert.equal((await api(`/devices/${device.id}/rotate-key`, { method: 'POST', token: otherToken })).status, 403);
  assert.equal((await api(`/devices/${device.id}`, { method: 'DELETE', token: otherToken })).status, 403);
  // Viewers may acknowledge alerts.
  const [firstAlert] = (await api('/alerts', { token: otherToken })).body.alerts;
  assert.equal((await api(`/alerts/${firstAlert.id}/ack`, { method: 'POST', token: otherToken })).status, 200);

  // Any developer can manage any station, not just the one who added it.
  const dev2 = await api('/auth/register', { method: 'POST', body: { email: 'dev2@example.com', name: 'Dev Two', password: 'password123' } });
  const dev2Station = await api(`/devices/${device.id}`, { token: dev2.body.token });
  assert.equal(dev2Station.body.device.can_manage, true);
  const renamed = await api(`/devices/${device.id}`, { method: 'PATCH', token: dev2.body.token, body: { landmark: 'Plaza' } });
  assert.equal(renamed.body.device.landmark, 'Plaza');

  // Rotating the key invalidates the old one.
  const rotated = await api(`/devices/${device.id}/rotate-key`, { method: 'POST', token });
  assert.equal((await api('/ingest', { method: 'POST', deviceKey: apiKey, body: { pm25: 1 } })).status, 401);
  assert.equal((await api('/ingest', { method: 'POST', deviceKey: rotated.body.apiKey, body: { pm25: 1 } })).status, 201);

  assert.equal((await api(`/devices/${device.id}`, { method: 'DELETE', token })).status, 204);
  assert.equal((await api('/devices', { token })).body.devices.length, 0);
});

test('buffered batch opens and resolves alerts at the readings\' own times', opts, async () => {
  const { body: session } = await api('/auth/register', {
    method: 'POST',
    body: { email: 'batch@example.com', name: 'Batch', password: 'password123' },
  });
  const { body: created } = await api('/devices', { method: 'POST', token: session.token, body: { name: 'Buffered' } });
  const t0 = Date.parse('2026-01-01T00:00:00Z');
  const at = (min, pm25) => ({ recorded_at: new Date(t0 + min * 60000).toISOString(), pm25 });
  // Sent out of order on purpose.
  await api('/ingest', {
    method: 'POST',
    deviceKey: created.apiKey,
    body: { readings: [at(3, 10), at(0, 5), at(1, 50), at(2, 80), at(4, 60)] },
  });
  const { body } = await api(`/alerts?device_id=${created.device.id}`, { token: session.token });
  const alerts = body.alerts.sort((a, b) => a.id - b.id);
  assert.equal(alerts.length, 2);
  assert.equal(new Date(alerts[0].started_at).getTime(), t0 + 60000);
  assert.equal(new Date(alerts[0].resolved_at).getTime(), t0 + 3 * 60000);
  assert.equal(alerts[0].peak_value, 80);
  assert.equal(alerts[1].resolved_at, null);
  assert.equal(alerts[1].peak_value, 60);
});
