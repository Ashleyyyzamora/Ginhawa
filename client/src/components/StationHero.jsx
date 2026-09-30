import { useEffect, useRef } from 'react';
import AqiScale from './AqiScale.jsx';
import Icon from './Icon.jsx';
import { HEALTH_TIPS, METRICS, batteryPercent, fmtMetric, fmtTime, levelInfo, mainPollutant, pm25Level, pm25ToAqi, timeAgo } from '../format.js';

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
              <span className="hourly-time">{last ? 'This hr' : fmtTime(p.t).replace(':00', '')}</span>
              <span className="hourly-badge">{aqi ?? '—'}</span>
              <span className="hourly-pm">{p.pm25 == null ? '—' : p.pm25.toFixed(0)}<small> µg</small></span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Station health: battery, connection, location and when particles were last measured. */
export function StationStatus({ device, now }) {
  const r = device.latest;
  const pct = batteryPercent(r?.battery_voltage);
  const cur = r?.battery_current;
  const charging = cur != null && cur > 0.02;
  const hasFix = device.latitude != null && device.longitude != null;
  const items = [
    {
      icon: 'battery',
      label: 'Battery',
      value: pct == null ? '—' : `≈${pct}%`,
      sub: r?.battery_voltage == null ? 'No power data yet' : `${r.battery_voltage.toFixed(2)} V · ${charging ? 'charging' : 'on battery'}`,
      warn: pct != null && pct <= 20,
    },
    {
      icon: 'wifi',
      label: 'Connection',
      value: r?.network === 'lte' ? '4G LTE' : r?.network === 'wifi' ? 'Wi-Fi' : '—',
      sub: `Last upload ${timeAgo(device.last_seen_at, now)}`,
    },
    {
      icon: 'pin',
      label: 'Location',
      value: hasFix ? `${device.latitude.toFixed(4)}, ${device.longitude.toFixed(4)}` : 'No fix yet',
      sub: hasFix ? `Updated ${timeAgo(device.location_updated_at, now)}` : 'Set by the station\'s GPS',
    },
    {
      icon: 'clock',
      label: 'Particles measured',
      value: r?.pm_recorded_at ? timeAgo(r.pm_recorded_at, now) : '—',
      sub: 'Every 5 minutes',
    },
  ];
  return (
    <section className="card">
      <div className="section-head">
        <h2>Station status</h2>
      </div>
      <div className="status-grid">
        {items.map((it) => (
          <div key={it.label} className={`status-item ${it.warn ? 'status-warn' : ''}`}>
            <span className="status-icon"><Icon name={it.icon} size={18} /></span>
            <div className="status-text">
              <span className="status-label">{it.label}</span>
              <strong className="truncate">{it.value}</strong>
              <span className="status-sub">{it.sub}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
