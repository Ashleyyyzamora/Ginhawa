import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useLive, useNow } from '../live.jsx';
import { ConnectionPill, PageHeader, ThemeToggle } from '../components/Layout.jsx';
import Icon from '../components/Icon.jsx';
import { fmtMetric, isOnline, levelInfo, timeAgo } from '../format.js';

const SORTS = [
  { key: 'worst', label: 'Worst air' },
  { key: 'name', label: 'A–Z' },
  { key: 'recent', label: 'Recent' },
];
const SORT_KEY = 'ginhawa.sort';

function readSort() {
  try {
    return localStorage.getItem(SORT_KEY) ?? 'worst';
  } catch {
    return 'worst';
  }
}

const sorters = {
  // Stations with no data sink to the bottom; ties broken by AQI.
  worst: (a, b) =>
    (b.latest?.level ?? -1) - (a.latest?.level ?? -1) || (b.latest?.aqi ?? -1) - (a.latest?.aqi ?? -1),
  name: (a, b) => a.name.localeCompare(b.name) || (a.landmark ?? '').localeCompare(b.landmark ?? ''),
  recent: (a, b) => new Date(b.last_seen_at ?? 0) - new Date(a.last_seen_at ?? 0),
};

function Overview({ devices, now }) {
  const online = devices.filter((d) => isOnline(d, now));
  const withData = online.filter((d) => d.latest?.level != null);
  const worst = [...withData].sort(sorters.worst)[0];
  const level = worst?.latest.level ?? null;
  const alerts = devices.reduce((n, d) => n + d.open_alerts, 0);

  return (
    <section className={`card overview lvl-${level ?? 'none'}`} aria-label="Overview">
      <div className="overview-top">
        <div>
          <p className="overview-eyebrow">{withData.length > 1 ? 'Worst air right now' : 'Air right now'}</p>
          <h2 className="overview-title">{level == null ? 'Waiting for live data' : levelInfo(level).label}</h2>
          <p className="muted small">{levelInfo(level).advice}</p>
        </div>
        <span className="overview-swatch" aria-hidden="true" />
      </div>
      <dl className="overview-stats">
        <div>
          <dt>Online</dt>
          <dd>{online.length}<span className="muted">/{devices.length}</span></dd>
        </div>
        <div>
          <dt>Active alerts</dt>
          <dd className={alerts ? 'text-danger' : ''}>{alerts}</dd>
        </div>
        <div>
          <dt>Worst station</dt>
          <dd className="overview-worst">
            {worst ? <Link to={`/devices/${worst.id}`}>{worst.name} · {worst.latest.aqi ?? '—'}</Link> : '—'}
          </dd>
        </div>
      </dl>
    </section>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { devices, error } = useLive();
  const now = useNow();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState(readSort);
  const isDev = user.role === 'dev';

  const changeSort = (key) => {
    setSort(key);
    try {
      localStorage.setItem(SORT_KEY, key);
    } catch {}
  };

  const visible = useMemo(() => {
    if (!devices) return null;
    const q = query.trim().toLowerCase();
    const match = (d) => !q || d.name.toLowerCase().includes(q) || (d.landmark ?? '').toLowerCase().includes(q);
    return devices.filter(match).sort(sorters[sort] ?? sorters.worst);
  }, [devices, query, sort]);

  return (
    <>
      <PageHeader
        title="Stations"
        subtitle={`Hi ${user.name.split(' ')[0]}, here's the air right now`}
        action={
          <>
            <ConnectionPill />
            <ThemeToggle />
          </>
        }
      />
      {error && <p className="error">{error}</p>}

      {devices == null ? (
        <div className="skeleton-list">
          <div className="card skeleton skeleton-tall" />
          {[0, 1].map((i) => <div key={i} className="card skeleton" />)}
        </div>
      ) : devices.length === 0 ? (
        <div className="card empty">
          <Icon name="chip" size={40} />
          <h2>No stations yet</h2>
          {isDev ? (
            <>
              <p className="muted">
                Add a station where you placed a sensor (for example, a barangay) to get its sensor key, or run the
                simulator to try the app with placeholder data.
              </p>
              <Link to="/devices/new" className="btn btn-primary">Add a station</Link>
            </>
          ) : (
            <p className="muted">The Ginhawa team hasn't set up any stations yet. Check back soon.</p>
          )}
        </div>
      ) : (
        <>
          <Overview devices={devices} now={now} />

          <div className="toolbar">
            <label className="search">
              <Icon name="search" size={18} />
              <input
                type="search"
                placeholder="Search barangay or landmark"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search stations"
              />
            </label>
            <div className="chips" role="group" aria-label="Sort stations">
              {SORTS.map((s) => (
                <button key={s.key} className={`chip ${sort === s.key ? 'active' : ''}`} onClick={() => changeSort(s.key)} aria-pressed={sort === s.key}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {visible.length === 0 ? (
            <div className="card empty">
              <h2>No matches</h2>
              <p className="muted">No station matches “{query}”.</p>
              <button className="btn" onClick={() => setQuery('')}>Clear search</button>
            </div>
          ) : (
            <ul className="device-list">
              {visible.map((d) => {
                const online = isOnline(d, now);
                const level = d.latest?.level;
                const info = levelInfo(level);
                return (
                  <li key={d.id}>
                    <Link to={`/devices/${d.id}`} className={`station-card lvl-${level ?? 'none'}`}>
                      <div className="station-card-top">
                        <div className="station-card-main">
                          <div className="station-card-name">
                            <span className="truncate">{d.name}</span>
                            {d.open_alerts > 0 && (
                              <span className="alert-chip" aria-label={`${d.open_alerts} active alerts`}>
                                <Icon name="alert" size={13} /> {d.open_alerts}
                              </span>
                            )}
                          </div>
                          {d.landmark && <div className="station-card-sub truncate">{d.landmark}</div>}
                          <div className="station-card-status">
                            <span className={`status-dot ${online ? 'on' : 'off'}`} /> {online ? 'Live' : 'Offline'} · {timeAgo(d.last_seen_at, now)}
                          </div>
                        </div>
                        <div className="station-card-aqi">
                          <span className="station-card-num">{d.latest?.aqi ?? '—'}</span>
                          <span className="station-card-unit">AQI</span>
                        </div>
                      </div>
                      <div className="station-card-bottom">
                        <span className="level-pill">
                          <span className="swatch" aria-hidden="true" /> {info.short ?? info.label}
                        </span>
                        <span className="station-card-metrics">
                          PM2.5 <b>{fmtMetric('pm25', d.latest?.pm25)}</b> · VOC <b>{fmtMetric('voc_index', d.latest?.voc_index)}</b> · NOx{' '}
                          <b>{fmtMetric('nox_index', d.latest?.nox_index)}</b>
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </>
  );
}
