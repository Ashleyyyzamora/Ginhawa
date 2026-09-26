import { useAuth } from '../auth.jsx';
import { ConnectionPill, PageHeader } from '../components/Layout.jsx';
import { useLive } from '../live.jsx';
import { API_BASE } from '../api.js';

export default function Account() {
  const { user, logout } = useAuth();
  const { devices } = useLive();
  return (
    <>
      <PageHeader title="Account" action={<ConnectionPill />} />
      <section className="card">
        <dl className="kv">
          <dt>Name</dt><dd>{user.name}</dd>
          <dt>Email</dt><dd>{user.email}</dd>
          <dt>Devices</dt><dd>{devices?.length ?? '—'}</dd>
          <dt>Server</dt><dd>{API_BASE || window.location.origin}</dd>
        </dl>
      </section>
      <section className="card">
        <h2>About the readings</h2>
        <p className="small">
          <strong>AQI</strong> is calculated from PM2.5 using the US EPA 2024 breakpoints. <strong>VOC</strong> and{' '}
          <strong>NOx</strong> use the Sensirion index scale, where 100 (VOC) and 1 (NOx) are the normal baseline
          for the place the sensor sits. Higher means more gas than usual. The overall level shown for a site is the worst of the three.
        </p>
      </section>
      <button className="btn btn-danger" onClick={logout}>Sign out</button>
    </>
  );
}
