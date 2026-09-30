// Stations upload once a minute; after 5 minutes of silence a station is shown as offline.
export const OFFLINE_AFTER_MS = 5 * 60 * 1000;

export const LEVELS = [
  { label: 'Good', advice: 'Air quality is satisfactory. Enjoy the space.' },
  { label: 'Moderate', advice: 'Acceptable for most. Unusually sensitive people should limit long stays.' },
  {
    label: 'Unhealthy for Sensitive Groups',
    short: 'Sensitive',
    advice: 'Children, the elderly and people with asthma should wear a mask or limit time here.',
  },
  { label: 'Unhealthy', advice: 'Everyone may feel effects. Wear a mask and improve ventilation.' },
  { label: 'Very Unhealthy', advice: 'Health alert: avoid lingering here and wear an N95 mask.' },
  { label: 'Hazardous', advice: 'Emergency conditions. Avoid the area.' },
];

export const levelInfo = (level) =>
  level == null ? { label: 'No data', short: 'No data', advice: 'Waiting for the sensor to report.' } : LEVELS[level];

export const vocLevel = (v) => (v == null ? null : v <= 150 ? 0 : v <= 250 ? 1 : v <= 400 ? 3 : 4);
export const noxLevel = (v) => (v == null ? null : v <= 20 ? 0 : v <= 150 ? 1 : v <= 300 ? 3 : 4);
export const pm25Level = (v) =>
  v == null ? null : v <= 9 ? 0 : v <= 35.4 ? 1 : v <= 55.4 ? 2 : v <= 125.4 ? 3 : v <= 225.4 ? 4 : 5;

// `about` is the plain-language explanation shown when a reading is tapped.
export const METRICS = {
  pm1: {
    label: 'PM1.0', unit: 'µg/m³', digits: 1,
    about: 'Ultra-fine particles smaller than 1 micrometre, mostly from smoke and vehicle exhaust. They can reach deep into the lungs and bloodstream.',
  },
  pm25: {
    label: 'PM2.5', unit: 'µg/m³', digits: 1, level: pm25Level, threshold: 'pm25_threshold',
    about: 'Fine particles (dust, smoke, exhaust) about 30 times thinner than a hair. They are the main pollutant used for the AQI because they go deep into the lungs. In crowds they rise with vehicles, cooking and stirred-up dust.',
    scale: [[0, '0–9 Good'], [1, '9.1–35.4 Moderate'], [2, '35.5–55.4 Sensitive groups'], [3, '55.5–125.4 Unhealthy'], [4, '125.5–225.4 Very unhealthy'], [5, '225.5+ Hazardous']],
  },
  pm4: {
    label: 'PM4.0', unit: 'µg/m³', digits: 1,
    about: 'Particles up to 4 micrometres: a mix of fine and coarser dust. Useful for comparing with PM2.5 and PM10.',
  },
  pm10: {
    label: 'PM10', unit: 'µg/m³', digits: 1,
    about: 'Coarser particles like road dust, pollen and construction dust. They mostly irritate the nose, throat and eyes.',
  },
  voc_index: {
    label: 'VOC index', unit: '', digits: 0, level: vocLevel, threshold: 'voc_threshold',
    about: 'Volatile organic compounds: gases from fuel, paint, cleaning products, perfume and cooking. 100 is the normal level the sensor learned for this spot; above 100 means more than usual.',
    scale: [[0, '1–150 Normal'], [1, '151–250 Elevated'], [3, '251–400 High'], [4, '401–500 Very high']],
  },
  nox_index: {
    label: 'NOx index', unit: '', digits: 0, level: noxLevel, threshold: 'nox_threshold',
    about: 'Nitrogen oxides, mainly from vehicle engines and burning. 1 is the normal level for this spot; higher values usually mean traffic or idling vehicles nearby.',
    scale: [[0, '1–20 Normal'], [1, '21–150 Elevated'], [3, '151–300 High'], [4, '301–500 Very high']],
  },
  temperature: {
    label: 'Temperature', unit: '°C', digits: 1,
    about: 'Air temperature at the sensor. Heat plus crowding makes pollution feel worse and can affect sensitive people.',
  },
  humidity: {
    label: 'Humidity', unit: '%', digits: 0,
    about: 'Relative humidity. Very humid air can make particle readings slightly higher and feels more stuffy.',
  },
};

export const AQI_BANDS = [
  { level: 0, from: 0, to: 50 },
  { level: 1, from: 51, to: 100 },
  { level: 2, from: 101, to: 150 },
  { level: 3, from: 151, to: 200 },
  { level: 4, from: 201, to: 300 },
  { level: 5, from: 301, to: 500 },
];

export const fmt = (value, digits = 1) => (value == null ? '—' : Number(value).toFixed(digits));
export const fmtMetric = (metric, value) => fmt(value, METRICS[metric]?.digits ?? 1);

export const isOnline = (device, now = Date.now()) =>
  Boolean(device.last_seen_at) && now - new Date(device.last_seen_at).getTime() < OFFLINE_AFTER_MS;

export function timeAgo(date, now = Date.now()) {
  if (!date) return 'never';
  const s = Math.max(0, Math.round((now - new Date(date).getTime()) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export function duration(from, to = Date.now()) {
  const m = Math.round((new Date(to) - new Date(from)) / 60000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h} h ${m % 60} min` : `${Math.floor(h / 24)} d`;
}

export const fmtTime = (d) => new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
export const fmtDateTime = (d) =>
  new Date(d).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

// Same EPA 2024 breakpoints the server uses; needed for the hourly AQI strip.
const PM25_BREAKPOINTS = [
  [0.0, 9.0, 0, 50],
  [9.1, 35.4, 51, 100],
  [35.5, 55.4, 101, 150],
  [55.5, 125.4, 151, 200],
  [125.5, 225.4, 201, 300],
  [225.5, 325.4, 301, 500],
];
export function pm25ToAqi(pm25) {
  if (pm25 == null || Number.isNaN(pm25)) return null;
  const c = Math.max(0, Math.floor(pm25 * 10) / 10);
  if (c > 325.4) return 500;
  for (const [cLo, cHi, iLo, iHi] of PM25_BREAKPOINTS) {
    if (c <= cHi) return Math.round(((iHi - iLo) / (cHi - cLo)) * (Math.max(c, cLo) - cLo) + iLo);
  }
  return 500;
}

/** Which pollutant is driving the overall level right now. */
export function mainPollutant(r) {
  if (!r) return null;
  const candidates = [
    ['pm25', pm25Level(r.pm25)],
    ['voc_index', vocLevel(r.voc_index)],
    ['nox_index', noxLevel(r.nox_index)],
  ].filter(([, l]) => l != null);
  if (!candidates.length) return null;
  return candidates.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
}

/** IQAir-style health recommendations for each level. */
export const HEALTH_TIPS = [
  [
    { icon: 'activity', text: 'Great time to be here or walk around' },
    { icon: 'window', text: 'Open windows to let fresh air in' },
  ],
  [
    { icon: 'activity', text: 'Sensitive people should limit long stays' },
    { icon: 'window', text: 'Ventilate during quieter hours' },
  ],
  [
    { icon: 'mask', text: 'Sensitive groups should wear a mask' },
    { icon: 'activity', text: 'Reduce strenuous activity here' },
    { icon: 'window', text: 'Close nearby windows' },
  ],
  [
    { icon: 'mask', text: 'Wear a mask (KN95/N95)' },
    { icon: 'activity', text: 'Avoid exercise and long stays' },
    { icon: 'window', text: 'Keep windows closed' },
    { icon: 'fan', text: 'Use an air purifier indoors if available' },
  ],
  [
    { icon: 'mask', text: 'Everyone should wear an N95 mask' },
    { icon: 'avoid', text: 'Avoid lingering in this area' },
    { icon: 'window', text: 'Keep windows closed' },
    { icon: 'fan', text: 'Run an air purifier indoors' },
  ],
  [
    { icon: 'avoid', text: 'Avoid the area' },
    { icon: 'mask', text: 'N95 mask if you must pass through' },
    { icon: 'home', text: 'Stay indoors with windows closed' },
  ],
];

/** Where a value sits on a metric's scale (0..1) for the small gauges on reading tiles. */
export const GAUGE_MAX = { pm1: 150, pm25: 150, pm4: 200, pm10: 250, voc_index: 500, nox_index: 500, temperature: 45, humidity: 100 };

// Approximate state of charge of a 1-cell Li-ion pack (18650 cells in parallel) from its voltage.
// Voltage reads a little high while charging and low under load, so this is a guide, not a gauge.
const LI_ION_CURVE = [[3.3, 0], [3.45, 5], [3.6, 15], [3.7, 30], [3.75, 40], [3.8, 50], [3.87, 60], [3.95, 70], [4.02, 80], [4.1, 90], [4.2, 100]];
export function batteryPercent(volts) {
  if (volts == null) return null;
  if (volts <= LI_ION_CURVE[0][0]) return 0;
  for (let i = 1; i < LI_ION_CURVE.length; i++) {
    const [v1, p1] = LI_ION_CURVE[i];
    if (volts <= v1) {
      const [v0, p0] = LI_ION_CURVE[i - 1];
      return Math.round(p0 + ((volts - v0) / (v1 - v0)) * (p1 - p0));
    }
  }
  return 100;
}
