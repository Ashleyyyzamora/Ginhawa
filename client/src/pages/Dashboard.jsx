import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useLive, useNow } from '../live.jsx';
import { ConnectionPill, PageHeader } from '../components/Layout.jsx';
import { AqiDisc, LevelTag } from '../components/Aqi.jsx';
import Icon from '../components/Icon.jsx';
import { fmtMetric, isOnline, timeAgo } from '../format.js';

export default function Dashboard() {
  const { user } = useAuth();
  const { devices, error } = useLive();
  const now = useNow();

  return (
    <>
      <PageHeader title={`Hi, ${user.name.split(' ')[0]}`} subtitle="Air quality at every monitoring station" action={<ConnectionPill />} />
      {error && <p className="error">{error}</p>}
      {devices == null ? (
        <div className="skeleton-list">{[0, 1].map((i) => <div key={i} className="card skeleton" />)}</div>
      ) : devices.length === 0 ? (
        <div className="card empty">
          <Icon name="chip" size={40} />
          <h2>No stations yet</h2>
          <p className="muted">
            Add a station where you placed a sensor (for example, a barangay) to get its device key, or run the simulator
            to try the app with placeholder data.
          </p>
          <Link to="/devices/new" className="btn btn-primary">Add a station</Link>
        </div>
      ) : (
        <ul className="device-list">
          {devices.map((d) => {
            const online = isOnline(d, now);
            return (
              <li key={d.id}>
                <Link to={`/devices/${d.id}`} className="card device-card">
                  <AqiDisc reading={d.latest} />
                  <div className="device-main">
                    <div className="device-name">
                      {d.name}
                      {d.open_alerts > 0 && (
                        <span className="alert-chip"><Icon name="alert" size={14} /> {d.open_alerts}</span>
                      )}
                    </div>
                    {d.landmark && <div className="muted small"><Icon name="pin" size={13} /> {d.landmark}</div>}
                    <LevelTag level={d.latest?.level} short />
                    <dl className="mini-metrics">
                      <div><dt>PM2.5</dt><dd>{fmtMetric('pm25', d.latest?.pm25)}</dd></div>
                      <div><dt>VOC</dt><dd>{fmtMetric('voc_index', d.latest?.voc_index)}</dd></div>
                      <div><dt>NOx</dt><dd>{fmtMetric('nox_index', d.latest?.nox_index)}</dd></div>
                    </dl>
                    <div className="muted small">
                      <span className={`status-dot ${online ? 'on' : 'off'}`} /> {online ? 'Online' : 'Offline'} · {timeAgo(d.last_seen_at, now)}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
