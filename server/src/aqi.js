// Air-quality classification helpers.
//
// PM2.5 -> AQI uses the US EPA breakpoints (revised May 2024). The Philippine
// DENR index uses similar PM2.5 bands, so this is a reasonable default.
// VOC / NOx use Sensirion's index scale (SGP40/SGP41/SEN5x sensors), where
// 100 (VOC) and 1 (NOx) are the "typical" baseline for the location.

export const LEVELS = [
  { level: 0, category: 'Good' },
  { level: 1, category: 'Moderate' },
  { level: 2, category: 'Unhealthy for Sensitive Groups' },
  { level: 3, category: 'Unhealthy' },
  { level: 4, category: 'Very Unhealthy' },
  { level: 5, category: 'Hazardous' },
];

const PM25_BREAKPOINTS = [
  // [concLow, concHigh, aqiLow, aqiHigh]
  [0.0, 9.0, 0, 50],
  [9.1, 35.4, 51, 100],
  [35.5, 55.4, 101, 150],
  [55.5, 125.4, 151, 200],
  [125.5, 225.4, 201, 300],
  [225.5, 325.4, 301, 500],
];

export function pm25ToAqi(pm25) {
  if (pm25 == null || Number.isNaN(pm25)) return null;
  const c = Math.max(0, Math.floor(pm25 * 10) / 10); // EPA: truncate to 0.1 µg/m³
  if (c > 325.4) return 500;
  for (const [cLo, cHi, iLo, iHi] of PM25_BREAKPOINTS) {
    // Treat the gap between bands (e.g. 9.0..9.1) as belonging to the upper band.
    if (c <= cHi) return Math.round(((iHi - iLo) / (cHi - cLo)) * (Math.max(c, cLo) - cLo) + iLo);
  }
  return 500;
}

export function aqiLevel(aqi) {
  if (aqi == null) return null;
  if (aqi <= 50) return 0;
  if (aqi <= 100) return 1;
  if (aqi <= 150) return 2;
  if (aqi <= 200) return 3;
  if (aqi <= 300) return 4;
  return 5;
}

// Sensirion guidance, mapped onto the same 0..5 scale so the app can use one colour key.
export function vocLevel(index) {
  if (index == null) return null;
  if (index <= 150) return 0;
  if (index <= 250) return 1;
  if (index <= 400) return 3;
  return 4;
}

export function noxLevel(index) {
  if (index == null) return null;
  if (index <= 20) return 0;
  if (index <= 150) return 1;
  if (index <= 300) return 3;
  return 4;
}

/** Overall air-quality summary for one reading: the worst of the three pollutants. */
export function summarize(reading) {
  const aqi = pm25ToAqi(reading.pm25);
  const levels = [aqiLevel(aqi), vocLevel(reading.voc_index), noxLevel(reading.nox_index)].filter(
    (l) => l != null,
  );
  const level = levels.length ? Math.max(...levels) : null;
  return {
    aqi,
    level,
    category: level == null ? 'Unknown' : LEVELS[level].category,
  };
}
