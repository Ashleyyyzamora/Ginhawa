import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useLive } from '../live.jsx';
import { PageHeader } from '../components/Layout.jsx';
import { METRICS, duration, fmtDateTime } from '../format.js';

export default function Alerts() {
  const { subscribe } = useLive();
  const [status, setStatus] = useState('open');
  const [alerts, setAlerts] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    api.alerts({ status, limit: 100 }).then((r) => setAlerts(r.alerts)).catch((e) => setError(e.message));
  }, [status]);

  useEffect(load, [load]);
  useEffect(() => subscribe((msg) => (msg.type === 'alert' || msg.type === 'alert_resolved') && load()), [subscribe, load]);

  const ack = async (alert) => {
    const { alert: updated } = await api.ackAlert(alert.id);
    setAlerts((list) => list.map((a) => (a.id === updated.id ? updated : a)));
  };

  return (
    <>
      <PageHeader title="Alerts" subtitle="When pollution crosses a device's thresholds" />
      <div className="segmented" role="tablist">
        <button role="tab" aria-selected={status === 'open'} onClick={() => setStatus('open')}>Ongoing</button>
        <button role="tab" aria-selected={status === 'all'} onClick={() => setStatus('all')}>History</button>
      </div>
      {error && <p className="error">{error}</p>}
      {alerts == null ? (
        <div className="card skeleton" />
      ) : alerts.length === 0 ? (
        <div className="card empty">
          <h2>{status === 'open' ? 'All clear' : 'No alerts yet'}</h2>
          <p className="muted">{status === 'open' ? 'No device is above its thresholds right now.' : 'Alerts will appear here.'}</p>
        </div>
      ) : (
        <ul className="plain-list alert-list">
          {alerts.map((a) => {
            const m = METRICS[a.metric];
            return (
              <li key={a.id} className={`card alert-card ${a.resolved_at ? 'resolved' : 'open'}`}>
                <div className="alert-card-head">
                  <span className={`badge ${a.resolved_at ? 'badge-muted' : 'badge-warn'}`}>{a.resolved_at ? 'Resolved' : 'Ongoing'}</span>
                  <Link to={`/devices/${a.device_id}`} className="link">{a.device_name}</Link>
                </div>
                <p>
                  <strong>{m.label}</strong> reached <strong>{a.peak_value}{m.unit && ` ${m.unit}`}</strong>{' '}
                  <span className="muted">(threshold {a.threshold})</span>
                </p>
                <p className="muted small">
                  Started {fmtDateTime(a.started_at)} · {a.resolved_at ? `lasted ${duration(a.started_at, a.resolved_at)}` : `ongoing for ${duration(a.started_at)}`}
                </p>
                {a.acknowledged_at ? (
                  <p className="muted small">Acknowledged {fmtDateTime(a.acknowledged_at)}</p>
                ) : (
                  <button className="btn btn-small" onClick={() => ack(a)}>Acknowledge</button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
