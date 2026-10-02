import { config } from './config.js';
import { query } from './db.js';
import { loadStation, serializeDevice, uniqueName } from './stations.js';

/**
 * Reverse geocoding with OpenStreetMap Nominatim: GPS position -> barangay name and street/city.
 * Returns null when it is turned off, fails, or finds no barangay-level area.
 */
export async function placeName(lat, lon) {
  if (!config.geocodeUrl) return null;
  try {
    const url = `${config.geocodeUrl}/reverse?format=jsonv2&zoom=16&addressdetails=1&lat=${lat}&lon=${lon}`;
    const res = await fetch(url, {
      // Nominatim's usage policy asks for an identifying User-Agent and at most 1 request/second.
      headers: { 'user-agent': 'Ginhawa air quality monitor (capstone project)', 'accept-language': 'en' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const { address = {} } = await res.json();
    const area = address.quarter || address.suburb || address.village || address.neighbourhood || address.hamlet || address.city_district;
    if (!area) return null;
    const name = /^(barangay|brgy\.?)\s/i.test(area) ? area : `Barangay ${area}`;
    const landmark = [address.road, address.city || address.town || address.municipality].filter(Boolean).join(', ') || null;
    return { name: name.slice(0, 100), landmark: landmark?.slice(0, 200) ?? null };
  } catch {
    return null;
  }
}

const MOVED_METERS = 200;
function distanceMeters(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

let queue = Promise.resolve();

/**
 * Names a self-added station after the place its GPS reports (first fix, or after it moved).
 * Runs in the background, one lookup at a time, and never fails the upload.
 */
export function nameFromGps(device, fix, realtime) {
  if (!device.name_from_gps || !config.geocodeUrl) return;
  const before = device.latitude == null ? null : { lat: device.latitude, lon: device.longitude };
  const after = { lat: fix.latitude, lon: fix.longitude };
  if (before && distanceMeters(before, after) < MOVED_METERS && !/^New station \(/.test(device.name)) return;
  queue = queue
    .then(async () => {
      const place = await placeName(after.lat, after.lon);
      if (!place) return;
      const name = await uniqueName(place.name, place.landmark, device.id);
      const { rowCount } = await query(
        'UPDATE devices SET name = $2, landmark = $3 WHERE id = $1 AND name_from_gps',
        [device.id, name, place.landmark],
      );
      if (!rowCount) return;
      const row = await loadStation(device.id);
      if (!row) return;
      const { can_manage, ...shared } = serializeDevice(row); // goes to everyone
      realtime.broadcast({ type: 'device_updated', device: shared });
    })
    .catch((err) => console.error('GPS naming failed:', err.message))
    .then(() => new Promise((r) => setTimeout(r, 1100)));
}
