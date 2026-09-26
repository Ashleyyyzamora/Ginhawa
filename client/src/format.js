export const OFFLINE_AFTER_MS = 120 * 1000;

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

export const METRICS = {
  pm1: { label: 'PM1.0', unit: 'µg/m³', digits: 1 },
  pm25: { label: 'PM2.5', unit: 'µg/m³', digits: 1, level: pm25Level, threshold: 'pm25_threshold' },
  pm4: { label: 'PM4.0', unit: 'µg/m³', digits: 1 },
  pm10: { label: 'PM10', unit: 'µg/m³', digits: 1 },
  voc_index: { label: 'VOC index', unit: '', digits: 0, level: vocLevel, threshold: 'voc_threshold' },
  nox_index: { label: 'NOx index', unit: '', digits: 0, level: noxLevel, threshold: 'nox_threshold' },
  temperature: { label: 'Temperature', unit: '°C', digits: 1 },
  humidity: { label: 'Humidity', unit: '%', digits: 0 },
};

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
