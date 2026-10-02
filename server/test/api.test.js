// End-to-end test against a real PostgreSQL database.
// Run with: TEST_DATABASE_URL=postgres://... npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import WebSocket from 'ws';

const dbUrl = process.env.TEST_DATABASE_URL;
// No user accounts: the team manages stations with a passcode; devices enroll with a team secret.
process.env.ADMIN_PASSCODE = 'team-passcode';
process.env.ENROLL_SECRET = 'team-enroll-secret';
const SECRET = process.env.ENROLL_SECRET;
const opts = { skip: dbUrl ? false : 'set TEST_DATABASE_URL to run API tests' };

let base, wsUrl, instance, pool, geocoder;

before(async () => {
  if (!dbUrl) return;
  // Stand-in for OpenStreetMap Nominatim's reverse geocoding.
  geocoder = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ address: { quarter: 'Carmen', road: 'Max Suniel Street', city: 'Cagayan de Oro' } }));
  });
  await new Promise((r) => geocoder.listen(0, '127.0.0.1', r));
  process.env.GEOCODE_URL = `http://127.0.0.1:${geocoder.address().port}`;
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
  geocoder.close();
});

async function api(path, { token, deviceKey, enrollSecret, ...init } = {}) {
  const res = await fetch(base + path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token && { authorization: `Bearer ${token}` }),
      ...(deviceKey && { 'x-device-key': deviceKey }),
      ...(enrollSecret && { 'x-enroll-secret': enrollSecret }),
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


const enroll = (chip_id, extra = {}, secret = SECRET) =>
  api('/enroll', { method: 'POST', enrollSecret: secret, body: { chip_id, ...extra } });

async function adminToken() {
  return (await api('/admin/login', { method: 'POST', body: { passcode: 'team-passcode' } })).body.token;
}

test('stations add themselves; viewing is public; the team manages with a passcode', opts, async () => {
  // Admin passcode
  assert.equal((await api('/admin/login', { method: 'POST', body: { passcode: 'wrong' } })).status, 401);
  const token = await adminToken();
  assert.ok(token);
  assert.equal((await api('/admin/me', { token })).status, 200);
  assert.equal((await api('/admin/me')).status, 401);

  // Enrollment needs the team secret
  assert.equal((await enroll('A1B2C3D4E5F6', {}, 'nope')).status, 401);
  assert.equal((await api('/enroll', { method: 'POST', body: { chip_id: 'A1B2C3D4E5F6' } })).status, 401);
  assert.equal((await enroll('bad id!')).status, 400);

  // Live channel needs no sign-in
  const ws = new WebSocket(wsUrl);
  const ready = nextMessage(ws, 'ready');
  await new Promise((r) => ws.on('open', r));
  await ready;

  const createdMsg = nextMessage(ws, 'device_created');
  const first = await enroll('a1b2c3d4e5f6');
  assert.equal(first.status, 201);
  const { device, apiKey } = first.body;
  assert.match(apiKey, /^gnh_/);
  assert.equal(device.name, 'New station (E5F6)');
  assert.equal(device.name_from_gps, true);
  assert.equal(device.api_key_hash, undefined);
  assert.equal(device.chip_id, undefined, 'chip ID is only shown to the team');
  assert.equal((await createdMsg).deviceId, device.id);

  // Viewers (no token) see stations and data but cannot change them
  const pub = await api('/devices');
  assert.equal(pub.status, 200);
  assert.equal(pub.body.devices.length, 1);
  assert.equal(pub.body.devices[0].can_manage, false);
  const asAdmin = await api(`/devices/${device.id}`, { token });
  assert.equal(asAdmin.body.device.can_manage, true);
  assert.equal(asAdmin.body.device.chip_id, 'A1B2C3D4E5F6');
  assert.equal((await api(`/devices/${device.id}`, { method: 'PATCH', body: { name: 'x' } })).status, 401);
  assert.equal((await api(`/devices/${device.id}`, { method: 'DELETE' })).status, 401);
  assert.equal((await api('/devices', { method: 'POST', token, body: { name: 'Manual' } })).status, 404);

  // Ingest + key checks
  assert.equal((await api('/ingest', { method: 'POST', body: { pm25: 5 } })).status, 401);
  assert.equal((await api('/ingest', { method: 'POST', deviceKey: apiKey, body: { pm25: -1 } })).status, 400);
  assert.equal((await api('/ingest/ping', { deviceKey: 'gnh_wrong' })).status, 401);
  assert.equal((await api('/ingest/ping', { deviceKey: apiKey })).body.device.id, device.id);

  // First GPS fix names the station after its barangay
  const renamed = nextMessage(ws, 'device_updated');
  const liveReading = nextMessage(ws, 'reading');
  const liveAlert = nextMessage(ws, 'alert');
  const ingest = await api('/ingest', {
    method: 'POST',
    deviceKey: apiKey,
    body: { pm1: 30, pm25: 60, pm10: 80, voc_index: 120, nox_index: 3, latitude: 8.4772, longitude: 124.6459 },
  });
  assert.equal(ingest.status, 201);
  assert.equal(ingest.body.status.aqi, 154);
  assert.equal((await liveReading).reading.pm25, 60);
  assert.equal((await liveAlert).alert.metric, 'pm25');
  const updated = await renamed;
  assert.equal(updated.device.name, 'Barangay Carmen');
  assert.equal(updated.device.landmark, 'Max Suniel Street, Cagayan de Oro');
  assert.equal(updated.device.chip_id, undefined);

  // Another high reading raises the peak instead of opening a second alert
  await api('/ingest', { method: 'POST', deviceKey: apiKey, body: { pm25: 90 } });
  let alerts = await api('/alerts?status=open');
  assert.equal(alerts.body.alerts.length, 1);
  assert.equal(alerts.body.alerts[0].peak_value, 90);
  // Only the team acknowledges alerts
  assert.equal((await api(`/alerts/${alerts.body.alerts[0].id}/ack`, { method: 'POST' })).status, 401);
  assert.equal((await api(`/alerts/${alerts.body.alerts[0].id}/ack`, { method: 'POST', token })).status, 200);

  const resolved = nextMessage(ws, 'alert_resolved');
  const t0 = Date.now();
  await api('/ingest', {
    method: 'POST',
    deviceKey: apiKey,
    body: { readings: [
      { recorded_at: new Date(t0 + 1000).toISOString(), pm25: 8, voc_index: 100, nox_index: 1 },
      { recorded_at: new Date(t0 + 2000).toISOString(), pm25: 6, voc_index: 100, nox_index: 1 },
    ] },
  });
  await resolved;
  assert.equal((await api('/alerts?status=open')).body.alerts.length, 0);

  // Public history, profile and CSV
  const raw = await api(`/devices/${device.id}/readings?bucket=raw`);
  assert.equal(raw.body.points.length, 4);
  const agg = await api(`/devices/${device.id}/readings?bucket=1h`);
  assert.equal(agg.body.points.reduce((s, p) => s + p.samples, 0), 4);
  assert.equal((await api(`/devices/${device.id}/hourly-profile`)).status, 200);
  const csv = await api(`/devices/${device.id}/export.csv`);
  assert.equal(csv.body.split('\n').length, 5);

  // A second station in the same place gets a distinct name
  const second = await enroll('0011223344AA');
  const key2 = second.body.apiKey;
  const renamed2 = nextMessage(ws, 'device_updated');
  await api('/ingest', { method: 'POST', deviceKey: key2, body: { pm25: 5, latitude: 8.4773, longitude: 124.646 } });
  assert.equal((await renamed2).device.name, 'Barangay Carmen 2');

  // The team renames a station: the typed name sticks even when GPS reports again
  const patched = await api(`/devices/${device.id}`, { method: 'PATCH', token, body: { name: 'Carmen Market', pm25_threshold: 50 } });
  assert.equal(patched.body.device.name, 'Carmen Market');
  assert.equal(patched.body.device.name_from_gps, false);
  assert.equal(patched.body.device.pm25_threshold, 50);

  // Enrolling again (e.g. after reflashing) keeps the station and issues a new key
  const again = await enroll('A1B2C3D4E5F6');
  assert.equal(again.status, 200);
  assert.equal(again.body.device.id, device.id);
  assert.equal(again.body.device.name, 'Carmen Market');
  assert.equal((await api('/ingest', { method: 'POST', deviceKey: apiKey, body: { pm25: 1 } })).status, 401);
  assert.equal((await api('/ingest', { method: 'POST', deviceKey: again.body.apiKey, body: { pm25: 1 } })).status, 201);

  // Remove: the device may join again. Remove and block: it may not.
  const second2 = second.body.device.id;
  assert.equal((await api(`/devices/${second2}`, { method: 'DELETE', token })).status, 204);
  assert.equal((await enroll('0011223344AA')).status, 201);
  const rejoined = (await api('/devices')).body.devices.find((d) => d.name.startsWith('New station'));
  assert.equal((await api(`/devices/${rejoined.id}?block=true`, { method: 'DELETE', token })).status, 204);
  assert.equal((await enroll('0011223344AA')).status, 403);
  ws.close();

  assert.equal((await api(`/devices/${device.id}`, { method: 'DELETE', token })).status, 204);
  assert.equal((await api('/devices')).body.devices.length, 0);
});

test('buffered batch opens and resolves alerts at the readings\' own times', opts, async () => {
  const { body: created } = await enroll('BATCH0001', { name: 'Buffered' });
  const t0 = Date.parse('2026-01-01T00:00:00Z');
  const at = (min, pm25) => ({ recorded_at: new Date(t0 + min * 60000).toISOString(), pm25 });
  // Sent out of order on purpose.
  await api('/ingest', {
    method: 'POST',
    deviceKey: created.apiKey,
    body: { readings: [at(3, 10), at(0, 5), at(1, 50), at(2, 80), at(4, 60)] },
  });
  const { body } = await api(`/alerts?device_id=${created.device.id}`);
  const alerts = body.alerts.sort((a, b) => a.id - b.id);
  assert.equal(alerts.length, 2);
  assert.equal(new Date(alerts[0].started_at).getTime(), t0 + 60000);
  assert.equal(new Date(alerts[0].resolved_at).getTime(), t0 + 3 * 60000);
  assert.equal(alerts[0].peak_value, 80);
  assert.equal(alerts[1].resolved_at, null);
  assert.equal(alerts[1].peak_value, 60);
});

test('duty-cycled PM is carried forward; battery, network and GPS are stored', opts, async () => {
  const token = await adminToken();
  // A fixed name, so the GPS fix below does not rename it.
  const { body: created } = await enroll('TELEMETRY1', { name: 'Telemetry' });
  const key = created.apiKey;
  const id = created.device.id;
  const t0 = Date.now() - 20 * 60e3;
  const at = (min, extra) => ({ recorded_at: new Date(t0 + min * 60e3).toISOString(), voc_index: 100, nox_index: 1, ...extra });

  // PM measured at minute 0, then gas-only readings (no PM) for the next minutes.
  await api('/ingest', {
    method: 'POST',
    deviceKey: key,
    body: {
      readings: [
        at(0, { pm1: 20, pm25: 40, pm4: 44, pm10: 50, battery_voltage: 3.31, battery_current: -0.12, network: 'wifi' }),
        at(1, { battery_voltage: 3.3, battery_current: 0.8, network: 'lte', latitude: 8.4822, longitude: 124.6472 }),
      ],
    },
  });
  let { body } = await api(`/devices/${id}`, { token });
  let latest = body.device.latest;
  assert.equal(latest.pm25, 40, 'PM carried forward from minute 0');
  assert.equal(latest.aqi, 112);
  assert.equal(new Date(latest.pm_recorded_at).getTime(), t0);
  assert.equal(latest.battery_voltage, 3.3);
  assert.equal(latest.network, 'lte');
  assert.equal(body.device.latitude, 8.4822);
  assert.equal(body.device.name, 'Telemetry');
  assert.ok(body.device.location_updated_at);
  assert.equal(body.device.online, true);

  // 12 minutes later without a PM measurement: too old to carry, so AQI is unknown.
  await api('/ingest', { method: 'POST', deviceKey: key, body: at(12, {}) });
  ({ body } = await api(`/devices/${id}`, { token }));
  latest = body.device.latest;
  assert.equal(latest.pm25, null);
  assert.equal(latest.aqi, null);
  assert.equal(latest.level, 0, 'level still reported from VOC/NOx');

  // History keeps PM gaps as gaps (averages ignore missing values).
  const raw = await api(`/devices/${id}/readings?bucket=raw&from=${new Date(t0 - 1000).toISOString()}`, { token });
  assert.deepEqual(raw.body.points.map((p) => p.pm25), [40, null, null]);
  const agg = await api(`/devices/${id}/readings?bucket=1h&from=${new Date(t0 - 3600e3).toISOString()}`, { token });
  assert.equal(agg.body.points.find((p) => p.pm25 != null).pm25, 40);

  // Manual location override by the team.
  const patched = await api(`/devices/${id}`, { method: 'PATCH', token, body: { latitude: 8.48, longitude: 124.65 } });
  assert.equal(patched.body.device.longitude, 124.65);
  assert.equal((await api(`/devices/${id}`, { method: 'PATCH', token, body: { latitude: 8.48 } })).status, 400);
});
