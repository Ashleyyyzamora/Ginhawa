import { useState } from 'react';
import { useAdmin } from '../auth.jsx';
import { useUi } from '../components/ui.jsx';
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

/** Team sign-in with the shared admin passcode (there are no personal accounts). */
function TeamAdmin() {
  const { isAdmin, signIn, signOut } = useAdmin();
  const { toast } = useUi();
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(passcode);
      setPasscode('');
      toast('Signed in as the Ginhawa team');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="group">
      <h2 className="group-title">Team admin</h2>
      {isAdmin ? (
        <>
          <div className="group-body">
            <div className="row">
              <span>Signed in as the Ginhawa team</span>
              <span className="badge badge-brand">Admin</span>
            </div>
            <button className="row row-button row-danger" onClick={signOut}>Sign out</button>
          </div>
          <p className="group-footer">
            Open a station and tap ⚙ to rename it, set its alert thresholds or remove it. To add a station, flash the
            Ginhawa firmware onto it and switch it on: it joins and names itself from its GPS location.
          </p>
        </>
      ) : (
        <>
          <form className="group-body admin-form" onSubmit={submit}>
            <input type="password" placeholder="Team passcode" value={passcode} onChange={(e) => setPasscode(e.target.value)}
              autoComplete="current-password" aria-label="Team passcode" required />
            <button className="btn btn-primary" disabled={busy}>{busy ? 'Checking…' : 'Sign in'}</button>
            {error && <p className="error" role="alert">{error}</p>}
          </form>
          <p className="group-footer">For the Ginhawa team only. Everyone else can use the app without signing in.</p>
        </>
      )}
    </section>
  );
}

export default function Settings() {
  const { devices } = useLive();
  const { pref, setPref } = useTheme();

  return (
    <>
      <PageHeader title="Settings" action={<ConnectionPill />} />

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

      <TeamAdmin />

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

    </>
  );
}
