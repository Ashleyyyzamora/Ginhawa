import { levelInfo } from '../format.js';

/** Coloured AQI disc. The category is always spelled out next to it, never colour alone. */
export function AqiDisc({ reading, size = 'md' }) {
  const level = reading?.level;
  const value = reading?.aqi ?? '—';
  return (
    <div className={`aqi-disc aqi-${size} lvl-${level ?? 'none'}`} aria-label={`AQI ${value}, ${levelInfo(level).label}`}>
      <span className="aqi-value">{value}</span>
      <span className="aqi-unit">AQI</span>
    </div>
  );
}

export function LevelTag({ level, short }) {
  const info = levelInfo(level);
  return (
    <span className={`level-tag lvl-${level ?? 'none'}`}>
      <span className="swatch" aria-hidden="true" />
      {short ? info.short ?? info.label : info.label}
    </span>
  );
}
