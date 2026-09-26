import { useAuth } from '../auth.jsx';
import { ConnectionPill, PageHeader } from '../components/Layout.jsx';
import Icon from '../components/Icon.jsx';
import { useLive } from '../live.jsx';
import { useTheme } from '../theme.js';
import { API_BASE } from '../api.js';

const THEMES = [
  { key: 'system', label: 'System', icon: 'monitor' },
  { key: 'light', label: 'Light', icon: 'sun' },
  { key: 'dark', label: 'Dark', icon: 'moon' },
];

export default function Account() {
  const { user, logout } = useAuth();
  const { devices } = useLive();
  const { pref, setPref } = useTheme();
  const isDev = user.role === 'dev';

  return (
    <>
      <PageHeader title="Account" action={<ConnectionPill />} />

      <section className="group">
        <div className="profile">
          <span className="avatar" aria-hidden="true">{user.name.trim().charAt(0).toUpperCase()}</span>
          <div className="profile-text">
            <strong className="truncate">{user.name}</strong>
            <span className="muted small truncate">{user.email}</span>
          </div>
          <span className={`badge ${isDev ? 'badge-brand' : 'badge-muted'}`}>{isDev ? 'Developer' : 'Viewer'}</span>
        </div>
        <p className="group-footer">
          {isDev
            ? 'As a developer you can add stations and change or delete any station.'
            : 'You can view every station and acknowledge alerts. Only the Ginhawa team can add or change stations.'}
        </p>
      </section>

      <section className="group">
        <h2 className="group-title">Appearance</h2>
        <div className="group-body">
          <div className="theme-picker" role="radiogroup" aria-label="Theme">
            {THEMES.map((t) => (
              <button key={t.key} role="radio" aria-checked={pref === t.key} className={`theme-option theme-${t.key}`} onClick={() => setPref(t.key)}>
                <span className="theme-preview" aria-hidden="true">
                  <span /><span /><span />
                </span>
                <span className="theme-label">
                  <Icon name={t.icon} size={16} /> {t.label}
                </span>
              </button>
            ))}
          </div>
        </div>
        <p className="group-footer">“System” follows your phone's light or dark setting.</p>
      </section>

      <section className="group">
        <h2 className="group-title">Network</h2>
        <div className="group-body">
          <div className="row"><span>Stations</span><span className="muted">{devices?.length ?? '—'}</span></div>
          <div className="row"><span>Server</span><span className="muted truncate">{API_BASE || window.location.origin}</span></div>
        </div>
      </section>

      <section className="group">
        <h2 className="group-title">About the readings</h2>
        <div className="group-body">
          <p className="row-text small">
            <strong>AQI</strong> is calculated from PM2.5 using the US EPA 2024 breakpoints. <strong>VOC</strong> and{' '}
            <strong>NOx</strong> use the Sensirion index scale, where 100 (VOC) and 1 (NOx) are the normal baseline for the
            place the sensor sits. Higher means more gas than usual. A station's overall level is the worst of the three.
          </p>
        </div>
      </section>

      <section className="group">
        <div className="group-body">
          <button className="row row-button row-danger" onClick={logout}>Sign out</button>
        </div>
      </section>
    </>
  );
}
