import { METRICS, fmtMetric, levelInfo } from '../format.js';

export default function MetricTile({ metric, value, emphasis }) {
  const m = METRICS[metric];
  const level = m.level?.(value);
  return (
    <div className={`tile ${emphasis ? 'tile-emphasis' : ''}`}>
      <div className="tile-label">{m.label}</div>
      <div className="tile-value">
        {fmtMetric(metric, value)}
        {m.unit && <span className="tile-unit">{m.unit}</span>}
      </div>
      {m.level && value != null && (
        <div className={`tile-level lvl-${level}`}>
          <span className="swatch" aria-hidden="true" />
          {levelInfo(level).short ?? levelInfo(level).label}
        </div>
      )}
    </div>
  );
}
