import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useLive, useNow } from '../live.jsx';
import { PageHeader } from '../components/Layout.jsx';
import MetricTile from '../components/MetricTile.jsx';
import { HistoryChart, HourlyChart } from '../components/Charts.jsx';
import Icon from '../components/Icon.jsx';
import { HealthTips, HourlyStrip, StationHero } from '../components/StationHero.jsx';
import { useUi } from '../components/ui.jsx';
import { METRICS, duration, fmtDateTime, isOnline } from '../format.js';

const RANGES = [
  { key: '1h', label: '1H', ms: 3600e3, bucket: 'raw' },
  { key: '24h', label: '24H', ms: 86400e3, bucket: 'auto' },
  { key: '7d', label: '7D', ms: 7 * 86400e3, bucket: 'auto' },
  { key: '30d', label: '30D', ms: 30 * 86400e3, bucket: 'auto' },
];

const VIEWS = [
  { key: 'pm', label: 'PM', series: [{ key: 'pm25', label: 'PM2.5', unit: 'µg/m³' }, { key: 'pm10', label: 'PM10', unit: 'µg/m³' }], threshold: 'pm25_threshold', profile: 'pm25' },
  { key: 'voc', label: 'VOC', series: [{ key: 'voc_index', label: 'VOC index' }], threshold: 'voc_threshold', digits: 0, profile: 'voc_index' },
  { key: 'nox', label: 'NOx', series: [{ key: 'nox_index', label: 'NOx index' }], threshold: 'nox_threshold', digits: 0, profile: 'nox_index' },
  { key: 'temp', label: 'Temp', series: [{ key: 'temperature', label: 'Temperature', unit: '°C' }] },
  { key: 'rh', label: 'Humidity', series: [{ key: 'humidity', label: 'Humidity', unit: '%' }], digits: 0 },
];

export default function DeviceDetail() {
  const { id } = useParams();
  const { devices, subscribe } = useLive();
  const { toast } = useUi();
  const device = devices?.find((d) => d.id === id);
  const now = useNow();
  const [reloadKey, setReloadKey] = useState(0); // bumped by pull-to-refresh

  const [range, setRange] = useState(RANGES[1]);
  const [view, setView] = useState(VIEWS[0]);
  const [points, setPoints] = useState(null);
  const [profile, setProfile] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [hourly, setHourly] = useState(null);

  useEffect(() => {
    setPoints(null);
    const from = new Date(Date.now() - range.ms).toISOString();
    api.readings(id, { from, bucket: range.bucket }).then((r) => setPoints(r.points)).catch(() => setPoints([]));
  }, [id, range, reloadKey]);

  useEffect(() => {
    api.hourlyProfile(id, 7).then((r) => setProfile(r.hours)).catch(() => setProfile([]));
    api.alerts({ device_id: id, limit: 5 }).then((r) => setAlerts(r.alerts)).catch(() => {});
  }, [id, reloadKey]);

  // Hourly strip: refreshed on load, pull-to-refresh, and at most every 5 minutes of live data.
  const hourlyAt = useRef(0);
  useEffect(() => {
    const load = () => {
      hourlyAt.current = Date.now();
      const from = new Date(Math.floor(Date.now() / 3600e3) * 3600e3 - 11 * 3600e3).toISOString();
      api.readings(id, { from, bucket: '1h' }).then((res) => setHourly(res.points)).catch(() => setHourly([]));
    };
    load();
    return subscribe((msg) => {
      if (msg.type === 'reading' && msg.deviceId === id && Date.now() - hourlyAt.current > 5 * 60e3) load();
    });
  }, [id, reloadKey, subscribe]);

  // Live: append new readings to the 1-hour chart and keep the alert list fresh.
  useEffect(
    () =>
      subscribe((msg) => {
        if (msg.type === 'refresh') setReloadKey((k) => k + 1);
        if (msg.type === 'reading' && msg.deviceId === id && range.key === '1h') {
          setPoints((p) => (p ? [...p, { ...msg.reading, t: msg.reading.recorded_at }] : p));
        }
        if ((msg.type === 'alert' || msg.type === 'alert_resolved') && msg.alert.device_id === id) {
          setAlerts((list) => [msg.alert, ...list.filter((a) => a.id !== msg.alert.id)].slice(0, 5));
        }
      }),
    [subscribe, id, range.key],
  );

  const spanMs = useMemo(() => range.ms, [range]);

  const exportCsv = async () => {
    try {
      const from = new Date(Date.now() - 30 * 86400e3).toISOString();
      const res = await api.exportCsv(id, { from });
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement('a'), { href: url, download: `${device.name}_readings.csv` });
      a.click();
      URL.revokeObjectURL(url);
      toast('CSV downloaded');
    } catch (err) {
      toast(err.message, { tone: 'danger' });
    }
  };

  if (devices && !device) {
    return (
      <>
        <PageHeader title="Station not found" back="/" />
        <p className="muted">It may have been deleted.</p>
      </>
    );
  }
  if (!device) return <PageHeader title="Loading…" back="/" />;

  const r = device.latest;
  const online = isOnline(device, now);

  return (
    <>
      <PageHeader
        title={device.name}
        subtitle={device.landmark}
        back="/"
        action={
          device.can_manage && (
            <Link to={`/devices/${id}/settings`} className="icon-btn" aria-label="Station settings">
              <Icon name="gear" />
            </Link>
          )
        }
      />

      <StationHero reading={r} online={online} lastSeen={device.last_seen_at} now={now} />

      <HealthTips level={r?.level} />

      <HourlyStrip points={hourly} />

      <h2 className="section-label">Readings</h2>
      <section className="tile-grid" aria-label="Latest readings">
        {['pm25', 'voc_index', 'nox_index', 'pm10', 'pm1', 'pm4', 'temperature', 'humidity'].map((m, i) => (
          <MetricTile key={m} metric={m} value={r?.[m]} emphasis={i < 3} />
        ))}
      </section>

      <section className="card">
        <div className="section-head">
          <h2>History</h2>
          <div className="chips" role="group" aria-label="Time range">
            {RANGES.map((x) => (
              <button key={x.key} className={`chip ${x.key === range.key ? 'active' : ''}`} onClick={() => setRange(x)}>
                {x.label}
              </button>
            ))}
          </div>
        </div>
        <div className="segmented small" role="tablist" aria-label="Metric">
          {VIEWS.map((v) => (
            <button key={v.key} role="tab" aria-selected={v.key === view.key} onClick={() => setView(v)}>{v.label}</button>
          ))}
        </div>
        {points == null ? (
          <div className="chart-empty muted">Loading…</div>
        ) : (
          <HistoryChart
            points={points}
            series={view.series}
            threshold={view.threshold ? device[view.threshold] : null}
            spanMs={spanMs}
            digits={view.digits ?? 1}
          />
        )}
        {view.threshold && view.series.length === 1 && (
          <p className="muted small"><span className="legend-dash" /> Alert threshold: {device[view.threshold]}</p>
        )}
      </section>

      {view.profile && (
        <section className="card">
          <div className="section-head">
            <h2>Busiest hours</h2>
            <span className="muted small">Avg {METRICS[view.profile].label}, last 7 days</span>
          </div>
          {profile == null ? (
            <div className="chart-empty muted">Loading…</div>
          ) : profile.length === 0 ? (
            <div className="chart-empty muted">Not enough data yet.</div>
          ) : (
            <HourlyChart hours={profile} metric={view.profile} label={METRICS[view.profile].label} digits={view.digits ?? 1} />
          )}
        </section>
      )}

      <section className="card">
        <div className="section-head">
          <h2>Recent alerts</h2>
          <Link to="/alerts" className="link small">See all</Link>
        </div>
        {alerts.length === 0 ? (
          <p className="muted small">No alerts for this station.</p>
        ) : (
          <ul className="plain-list">
            {alerts.map((a) => (
              <li key={a.id} className="alert-row">
                <span className={`status-dot ${a.resolved_at ? 'off' : 'warn'}`} />
                <div>
                  <strong>{METRICS[a.metric].label}</strong> peaked at {a.peak_value}
                  <div className="muted small">
                    {fmtDateTime(a.started_at)} · {a.resolved_at ? `lasted ${duration(a.started_at, a.resolved_at)}` : 'ongoing'}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card station-footer">
        <p className="muted small">Added by {device.created_by}</p>
        <button className="btn" onClick={exportCsv}><Icon name="download" size={18} /> Download last 30 days (CSV)</button>
      </section>
    </>
  );
}
