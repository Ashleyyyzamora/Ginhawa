// REST client. By default the API is on the same origin (Caddy in production,
// the Vite proxy in development). Set VITE_API_URL for e.g. a Capacitor build.
export const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export function wsUrl() {
  const base = API_BASE || window.location.origin;
  return base.replace(/^http/, 'ws') + '/ws';
}

const TOKEN_KEY = 'ginhawa.token';
export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY)),
};

export class ApiError extends Error {
  constructor(status, message, issues) {
    super(message);
    this.status = status;
    this.issues = issues;
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => (onUnauthorized = fn);

export async function request(path, { method = 'GET', body, raw = false } = {}) {
  const token = tokenStore.get();
  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    method,
    headers: {
      ...(body && { 'content-type': 'application/json' }),
      ...(token && { authorization: `Bearer ${token}` }),
    },
    body: body && JSON.stringify(body),
  });
  if (res.status === 401 && token) onUnauthorized();
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail = data.issues?.map((i) => `${i.path}: ${i.message}`).join(', ');
    throw new ApiError(res.status, detail ? `${data.error} (${detail})` : data.error ?? res.statusText, data.issues);
  }
  if (raw) return res;
  return res.status === 204 ? null : res.json();
}

export const api = {
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
  register: (name, email, password) => request('/auth/register', { method: 'POST', body: { name, email, password } }),
  me: () => request('/auth/me'),

  devices: () => request('/devices'),
  device: (id) => request(`/devices/${id}`),
  createDevice: (body) => request('/devices', { method: 'POST', body }),
  updateDevice: (id, body) => request(`/devices/${id}`, { method: 'PATCH', body }),
  deleteDevice: (id) => request(`/devices/${id}`, { method: 'DELETE' }),
  rotateKey: (id) => request(`/devices/${id}/rotate-key`, { method: 'POST' }),
  readings: (id, params) => request(`/devices/${id}/readings?${new URLSearchParams(params)}`),
  hourlyProfile: (id, days = 7) => request(`/devices/${id}/hourly-profile?days=${days}`),
  exportCsv: (id, params) => request(`/devices/${id}/export.csv?${new URLSearchParams(params)}`, { raw: true }),

  alerts: (params = {}) => request(`/alerts?${new URLSearchParams(params)}`),
  ackAlert: (id) => request(`/alerts/${id}/ack`, { method: 'POST' }),

  // Sensor-side calls, authenticated with the station's key (used to test a new sensor setup).
  pingSensor: (key) => deviceRequest('/ingest/ping', key),
  sendSampleReading: (key, body) => deviceRequest('/ingest', key, { method: 'POST', body }),
};

async function deviceRequest(path, key, { method = 'GET', body } = {}) {
  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    method,
    headers: { 'x-device-key': key, ...(body && { 'content-type': 'application/json' }) },
    body: body && JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? res.statusText, data.issues);
  return data;
}
