#!/usr/bin/env node
// Simulates one or more Ginhawa stations (sensor nodes) so the app can be demoed without hardware.
//
//   node scripts/simulate.js                    # stream live readings every 60 s (like a real station)
//   node scripts/simulate.js --backfill 48      # first upload 48 h of history, then stream
//   node scripts/simulate.js --devices 3        # simulate 3 stations
//
// Environment: API_URL (default http://localhost:4000), ENROLL_SECRET (the same team secret
// as the server and the firmware), SIM_INTERVAL_SECONDS. Each simulated station enrolls itself
// exactly like a real sensor that is switched on for the first time.

const API_URL = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '') + '/api/v1';
const ENROLL_SECRET = process.env.ENROLL_SECRET ?? '';
const INTERVAL = Number(process.env.SIM_INTERVAL_SECONDS ?? 60) * 1000;
// Like the real firmware, particles are measured 1 minute in every 5 (every 5th upload);
// the other uploads carry VOC, NOx, temperature, humidity and battery data only.
const PM_EVERY = 5;

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const BACKFILL_HOURS = argValue('--backfill', Number(process.env.SIM_BACKFILL_HOURS ?? 0));
const DEVICE_COUNT = argValue('--devices', Number(process.env.SIM_DEVICES ?? 2));

// Placeholder stations: clearly not real places. Replace with your own via the app.
// `traffic` only scales how busy each simulated spot is.
// `chip` stands in for the ESP32's hardware ID.
const SITES = [
  { chip: 'SIM0001', name: 'Station 1 (placeholder)', landmark: 'Landmark (placeholder)', traffic: 1.2 },
  { chip: 'SIM0002', name: 'Station 2 (placeholder)', landmark: 'Landmark (placeholder)', traffic: 0.8 },
  { chip: 'SIM0003', name: 'Station 3 (placeholder)', landmark: 'Landmark (placeholder)', traffic: 0.6 },
  { chip: 'SIM0004', name: 'Station 4 (placeholder)', landmark: 'Landmark (placeholder)', traffic: 1.5, network: 'lte' },
];

async function api(path, { deviceKey, enrollSecret, body, method = body ? 'POST' : 'GET' } = {}) {
  const res = await fetch(API_URL + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(deviceKey && { 'x-device-key': deviceKey }),
      ...(enrollSecret && { 'x-enroll-secret': enrollSecret }),
    },
    body: body && JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(`${method} ${path} -> ${res.status} ${data.error ?? ''}`), { status: res.status });
  return data;
}

// Foot traffic in Manila local time: morning & evening rush, lunch bump, quiet at night.
function footTraffic(date) {
  const h = (date.getUTCHours() + 8 + date.getUTCMinutes() / 60) % 24;
  const bump = (center, width, height) => height * Math.exp(-((h - center) ** 2) / (2 * width ** 2));
  return 0.08 + bump(7.5, 1.2, 1) + bump(12.2, 1, 0.55) + bump(18, 1.5, 0.95);
}

// Resting-voltage curve of one Li-ion cell (state of charge 0..1 -> volts).
const OCV = [[0, 3.3], [0.05, 3.45], [0.15, 3.6], [0.3, 3.7], [0.4, 3.75], [0.5, 3.8], [0.6, 3.87], [0.7, 3.95], [0.8, 4.02], [0.9, 4.1], [1, 4.2]];
const ocv = (soc) => {
  for (let i = 1; i < OCV.length; i++) {
    if (soc <= OCV[i][0]) {
      const [s0, v0] = OCV[i - 1];
      const [s1, v1] = OCV[i];
      return v0 + ((soc - s0) / (s1 - s0)) * (v1 - v0);
    }
  }
  return 4.2;
};

function makeGenerator(site) {
  let spike = 0; // decaying pollution event (e.g. idling bus, cleaning spray)
  let drift = 0;
  let n = 0;
  let soc = 0.7; // battery state of charge
  let lastTime = null;
  return (date) => {
    // Battery: 6 W panel by day (Manila time), ~0.31 W load on Wi-Fi (~0.48 W on LTE),
    // 3 x 18650 in parallel (3.7 V, 9 Ah, ~33 Wh).
    const hours = lastTime ? Math.min(1, (date - lastTime) / 3600e3) : 0;
    lastTime = date;
    const hLocal = (date.getUTCHours() + 8 + date.getUTCMinutes() / 60) % 24;
    const sun = Math.max(0, Math.sin((Math.PI * (hLocal - 6)) / 12));
    const loadW = site.network === 'lte' ? 0.48 : 0.31;
    let netW = 6 * 0.75 * sun * (0.7 + 0.3 * Math.random()) - loadW;
    if (soc >= 0.999 && netW > 0) netW = 0; // charger stops at full
    soc = Math.min(1, Math.max(0.05, soc + (netW * hours) / 33.3));
    const current = netW / 3.7;
    const includePm = n++ % PM_EVERY === 0;
    const t = footTraffic(date) * site.traffic;
    if (Math.random() < 0.004) spike = 25 + Math.random() * 60;
    spike *= 0.93;
    drift = Math.max(-4, Math.min(4, drift + (Math.random() - 0.5) * 0.8));
    const noise = (s) => (Math.random() - 0.5) * s;
    const pm25 = Math.max(1, 10 + 32 * t + spike + drift + noise(3));
    const hourOfDay = (date.getUTCHours() + 8) % 24;
    return {
      recorded_at: date.toISOString(),
      ...(includePm && {
        pm1: +(pm25 * 0.68).toFixed(1),
        pm25: +pm25.toFixed(1),
        pm4: +(pm25 * 1.12).toFixed(1),
        pm10: +(pm25 * 1.35 + noise(2)).toFixed(1),
      }),
      battery_voltage: +(ocv(soc) + current * 0.05).toFixed(3),
      battery_current: +current.toFixed(3),
      network: site.network ?? 'wifi',
      voc_index: Math.round(Math.min(500, Math.max(1, 95 + 140 * t + spike * 1.5 + noise(12)))),
      nox_index: Math.round(Math.min(500, Math.max(1, 1 + 28 * t + spike * 0.6 + noise(3)))),
      temperature: +(27 + 5 * Math.sin(((hourOfDay - 9) / 24) * 2 * Math.PI) + 1.2 * t + noise(0.4)).toFixed(1),
      humidity: +(72 - 10 * Math.sin(((hourOfDay - 9) / 24) * 2 * Math.PI) + noise(2)).toFixed(1),
    };
  };
}

// Enrolls like a real station: the first time it creates the station, later it gets a fresh key.
async function setupDevice(site) {
  const { device, apiKey } = await api('/enroll', {
    enrollSecret: ENROLL_SECRET,
    body: { chip_id: site.chip, name: site.name, landmark: site.landmark },
  });
  return { device, apiKey, generate: makeGenerator(site) };
}

async function main() {
  console.log(`Simulator -> ${API_URL}`);
  if (!ENROLL_SECRET) throw new Error('Set ENROLL_SECRET (the same team secret as the server) to run the simulator.');
  const sims = [];
  for (const site of SITES.slice(0, DEVICE_COUNT)) sims.push(await setupDevice(site));

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

  console.log(`Streaming ${sims.length} station(s) every ${INTERVAL / 1000}s.`);
  const tick = async () => {
    for (const sim of sims) {
      try {
        const reading = sim.generate(new Date());
        const { status } = await api('/ingest', { deviceKey: sim.apiKey, body: reading });
        console.log(`${sim.device.name}: PM2.5 ${reading.pm25 ?? '(not measured)'} VOC ${reading.voc_index} NOx ${reading.nox_index} -> ${status.category}`);
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
