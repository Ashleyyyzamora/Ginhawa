import { AQI_BANDS, levelInfo } from '../format.js';

/** The six AQI bands as one bar, with a marker where the current value sits. */
export default function AqiScale({ aqi }) {
  const pos = aqi == null ? null : Math.min(100, (Math.min(aqi, 500) / 500) * 100);
  return (
    <div className="aqi-scale">
      <div className="aqi-scale-bar">
        {AQI_BANDS.map((b) => (
          <span key={b.level} className={`lvl-${b.level}`} style={{ flexGrow: b.to - b.from + 1 }} title={`${b.from}–${b.to} ${levelInfo(b.level).label}`} />
        ))}
        {/* always rendered (hidden without data) so the bar's last segment keeps its rounded end */}
        <span className="aqi-scale-marker" style={{ left: `${pos ?? 0}%`, visibility: pos == null ? 'hidden' : 'visible' }} aria-hidden="true" />
      </div>
      <div className="aqi-scale-labels muted" aria-hidden="true">
        {[0, 50, 100, 150, 200, 300, 500].map((v) => (
          <span key={v} style={{ left: `${(v / 500) * 100}%` }}>{v}</span>
        ))}
      </div>
    </div>
  );
}
