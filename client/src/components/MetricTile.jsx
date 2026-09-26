import { useState } from 'react';
import { GAUGE_MAX, METRICS, fmtMetric, levelInfo } from '../format.js';
import { Sheet } from './ui.jsx';
import Icon from './Icon.jsx';

/** A reading tile. Tapping it explains the measurement in plain language. */
export default function MetricTile({ metric, value, emphasis }) {
  const [open, setOpen] = useState(false);
  const m = METRICS[metric];
  const level = m.level?.(value);
  const pos = value == null ? null : Math.min(1, Math.max(0, value / GAUGE_MAX[metric]));
  return (
    <>
      <button type="button" className={`tile ${emphasis ? 'tile-emphasis' : ''}`} onClick={() => setOpen(true)} aria-label={`${m.label}: ${fmtMetric(metric, value)} ${m.unit}. What does this mean?`}>
        <div className="tile-label">
          {m.label}
          <Icon name="info" size={14} className="tile-info" />
        </div>
        <div className="tile-value">
          {fmtMetric(metric, value)}
          {m.unit && <span className="tile-unit">{m.unit}</span>}
        </div>
        <div className="tile-level">
          {m.level && value != null ? (levelInfo(level).short ?? levelInfo(level).label) : m.unit ? '\u00a0' : ''}
        </div>
        {/* small gauge: coloured by level for pollutants, neutral for weather values */}
        <div className={`gauge ${m.level ? 'gauge-aqi' : ''}`} aria-hidden="true">
          {pos != null && <span className={`gauge-dot ${m.level ? `lvl-${level}` : ''}`} style={{ left: `${pos * 100}%` }} />}
        </div>
      </button>
      {open && (
        <Sheet title={m.label} onClose={() => setOpen(false)}>
          <p className="sheet-value">
            {fmtMetric(metric, value)} <span className="muted">{m.unit}</span>
          </p>
          <p>{m.about}</p>
          {m.scale && (
            <ul className="scale-list">
              {m.scale.map(([lvl, text]) => (
                <li key={text} className={`lvl-${lvl} ${lvl === level ? 'current' : ''}`}>
                  <span className="swatch" aria-hidden="true" /> {text}
                  {lvl === level && <span className="muted small"> ← now</span>}
                </li>
              ))}
            </ul>
          )}
        </Sheet>
      )}
    </>
  );
}
