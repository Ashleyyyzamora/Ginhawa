import { useEffect, useRef } from 'react';
import AqiScale from './AqiScale.jsx';
import Icon from './Icon.jsx';
import { HEALTH_TIPS, METRICS, fmtMetric, fmtTime, levelInfo, mainPollutant, pm25Level, pm25ToAqi, timeAgo } from '../format.js';

/** IQAir-style hero: the whole card takes the colour of the current air-quality level. */
export function StationHero({ reading, online, lastSeen, now }) {
  const level = reading?.level;
  const info = levelInfo(level);
  const main = mainPollutant(reading);
  return (
    <section className={`aqi-hero lvl-${level ?? 'none'}`} aria-label="Current air quality">
      <div className="aqi-hero-top">
        <div className="aqi-hero-reading">
          <span className="aqi-hero-num">{reading?.aqi ?? '—'}</span>
          <span className="aqi-hero-unit">US AQI</span>
        </div>
        <div className="aqi-hero-cat">{info.label}</div>
      </div>
      <div className="aqi-hero-details">
        {main && (
          <span>
            Main pollutant: <b>{METRICS[main].label}</b> {fmtMetric(main, reading[main])} {METRICS[main].unit}
          </span>
        )}
        <span className="aqi-hero-weather">
          <span><Icon name="thermo" size={15} /> {fmtMetric('temperature', reading?.temperature)}°C</span>
          <span><Icon name="drop" size={15} /> {fmtMetric('humidity', reading?.humidity)}%</span>
          <span>
            <span className={`status-dot ${online ? 'on' : 'off'}`} /> {online ? 'Live' : 'Offline'} · {timeAgo(lastSeen, now)}
          </span>
        </span>
      </div>
      <AqiScale aqi={reading?.aqi} />
    </section>
  );
}

export function HealthTips({ level }) {
  if (level == null) return null;
  return (
    <section className="card">
      <div className="section-head">
        <h2>Health recommendations</h2>
      </div>
      <p className="muted small">{levelInfo(level).advice}</p>
      <ul className="tips">
        {HEALTH_TIPS[level].map((t) => (
          <li key={t.text} className={`lvl-${level}`}>
            <span className="tip-icon"><Icon name={t.icon} size={20} /></span>
            <span>{t.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Scrollable strip of hourly PM2.5 AQI, newest on the right (like a weather app's hourly forecast). */
export function HourlyStrip({ points }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollLeft = ref.current.scrollWidth;
  }, [points]);
  if (!points?.length) return null;
  return (
    <section className="card">
      <div className="section-head">
        <h2>Last 12 hours</h2>
        <span className="muted small">Hourly PM2.5 AQI</span>
      </div>
      <ol className="hourly" ref={ref}>
        {points.map((p, i) => {
          const aqi = pm25ToAqi(p.pm25);
          const last = i === points.length - 1;
          return (
            <li key={p.t} className={`lvl-${pm25Level(p.pm25) ?? 'none'}`}>
              <span className="hourly-time">{last ? 'Now' : fmtTime(p.t).replace(':00', '')}</span>
              <span className="hourly-badge">{aqi ?? '—'}</span>
              <span className="hourly-pm">{p.pm25 == null ? '—' : p.pm25.toFixed(0)}<small> µg</small></span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
