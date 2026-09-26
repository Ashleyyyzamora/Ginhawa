#!/usr/bin/env node
// Simulates one or more Ginhawa sensor nodes so the app can be demoed without hardware.
//
//   node scripts/simulate.js                    # stream live readings every 5 s
//   node scripts/simulate.js --backfill 48      # first upload 48 h of history, then stream
//   node scripts/simulate.js --devices 3        # simulate 3 locations
//
// Environment: API_URL (default http://localhost:4000), SIM_EMAIL, SIM_PASSWORD,
// SIM_INTERVAL_SECONDS. The demo account is created if it does not exist.

const API_URL = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '') + '/api/v1';
const EMAIL = process.env.SIM_EMAIL ?? 'demo@ginhawa.local';
const PASSWORD = process.env.SIM_PASSWORD ?? 'ginhawa-demo';
const INTERVAL = Number(process.env.SIM_INTERVAL_SECONDS ?? 5) * 1000;

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const BACKFILL_HOURS = argValue('--backfill', Number(process.env.SIM_BACKFILL_HOURS ?? 0));
const DEVICE_COUNT = argValue('--devices', Number(process.env.SIM_DEVICES ?? 2));

const SITES = [
  { name: 'Sim · MRT Station Entrance', location: 'EDSA, Quezon City', latitude: 14.6195, longitude: 121.0512, traffic: 1.2 },
  { name: 'Sim · Campus Canteen', location: 'Main Building, Ground Floor', latitude: 14.5995, longitude: 120.9842, traffic: 0.8 },
  { name: 'Sim · Mall Atrium', location: 'Level 1 Atrium', latitude: 14.5866, longitude: 121.0566, traffic: 0.6 },
  { name: 'Sim · Jeepney Terminal', location: 'Terminal Bay 3', latitude: 14.6507, longitude: 121.0487, traffic: 1.5 },
];

async function api(path, { token, deviceKey, body, method = body ? 'POST' : 'GET' } = {}) {
  const res = await fetch(API_URL + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token && { authorization: `Bearer ${token}` }),
      ...(deviceKey && { 'x-device-key': deviceKey }),
    },
    body: body && JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(`${method} ${path} -> ${res.status} ${data.error ?? ''}`), { status: res.status });
  return data;
}

async function getToken() {
  try {
    return (await api('/auth/login', { body: { email: EMAIL, password: PASSWORD } })).token;
  } catch (err) {
    if (err.status !== 401) throw err;
    return (await api('/auth/register', { body: { email: EMAIL, name: 'Demo User', password: PASSWORD } })).token;
  }
}

// Foot traffic in Manila local time: morning & evening rush, lunch bump, quiet at night.
function footTraffic(date) {
  const h = (date.getUTCHours() + 8 + date.getUTCMinutes() / 60) % 24;
  const bump = (center, width, height) => height * Math.exp(-((h - center) ** 2) / (2 * width ** 2));
  return 0.08 + bump(7.5, 1.2, 1) + bump(12.2, 1, 0.55) + bump(18, 1.5, 0.95);
}

function makeGenerator(site) {
  let spike = 0; // decaying pollution event (e.g. idling bus, cleaning spray)
  let drift = 0;
  return (date) => {
    const t = footTraffic(date) * site.traffic;
    if (Math.random() < 0.004) spike = 25 + Math.random() * 60;
    spike *= 0.93;
    drift = Math.max(-4, Math.min(4, drift + (Math.random() - 0.5) * 0.8));
    const noise = (s) => (Math.random() - 0.5) * s;
    const pm25 = Math.max(1, 10 + 32 * t + spike + drift + noise(3));
    const hourOfDay = (date.getUTCHours() + 8) % 24;
    return {
      recorded_at: date.toISOString(),
      pm1: +(pm25 * 0.68).toFixed(1),
      pm25: +pm25.toFixed(1),
      pm4: +(pm25 * 1.12).toFixed(1),
      pm10: +(pm25 * 1.35 + noise(2)).toFixed(1),
      voc_index: Math.round(Math.min(500, Math.max(1, 95 + 140 * t + spike * 1.5 + noise(12)))),
      nox_index: Math.round(Math.min(500, Math.max(1, 1 + 28 * t + spike * 0.6 + noise(3)))),
      temperature: +(27 + 5 * Math.sin(((hourOfDay - 9) / 24) * 2 * Math.PI) + 1.2 * t + noise(0.4)).toFixed(1),
      humidity: +(72 - 10 * Math.sin(((hourOfDay - 9) / 24) * 2 * Math.PI) + noise(2)).toFixed(1),
    };
  };
}

async function setupDevice(token, site, existing) {
  let device = existing.find((d) => d.name === site.name);
  let apiKey;
  if (device) {
    ({ apiKey } = await api(`/devices/${device.id}/rotate-key`, { token, method: 'POST' }));
  } else {
    const { name, location, latitude, longitude } = site;
    ({ device, apiKey } = await api('/devices', { token, body: { name, location, latitude, longitude } }));
  }
  return { device, apiKey, generate: makeGenerator(site) };
}

async function main() {
  console.log(`Simulator -> ${API_URL} as ${EMAIL}`);
  const token = await getToken();
  const { devices } = await api('/devices', { token });
  const sims = [];
  for (const site of SITES.slice(0, DEVICE_COUNT)) sims.push(await setupDevice(token, site, devices));

  if (BACKFILL_HOURS > 0) {
    const step = 60 * 1000; // one point per minute of history
    const start = Date.now() - BACKFILL_HOURS * 3600 * 1000;
    for (const sim of sims) {
      let batch = [];
      for (let t = start; t < Date.now(); t += step) {
        batch.push(sim.generate(new Date(t)));
        if (batch.length === 500) {
          await api('/ingest', { deviceKey: sim.apiKey, body: { readings: batch } });
          batch = [];
        }
      }
      if (batch.length) await api('/ingest', { deviceKey: sim.apiKey, body: { readings: batch } });
      console.log(`backfilled ${BACKFILL_HOURS} h for "${sim.device.name}"`);
    }
  }

  console.log(`Streaming ${sims.length} device(s) every ${INTERVAL / 1000}s. Log in to the app as ${EMAIL} / ${PASSWORD}`);
  const tick = async () => {
    for (const sim of sims) {
      try {
        const reading = sim.generate(new Date());
        const { status } = await api('/ingest', { deviceKey: sim.apiKey, body: reading });
        console.log(`${sim.device.name}: PM2.5 ${reading.pm25} VOC ${reading.voc_index} NOx ${reading.nox_index} -> ${status.category}`);
      } catch (err) {
        console.error(`${sim.device.name}: ${err.message}`);
      }
    }
  };
  await tick();
  setInterval(tick, INTERVAL);
}

async function waitForApi() {
  for (let i = 0; ; i++) {
    try {
      await api('/health');
      return;
    } catch (err) {
      if (i >= 30) throw err;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

waitForApi()
  .then(main)
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
