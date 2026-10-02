import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAdmin } from '../auth.jsx';
import { useUi } from '../components/ui.jsx';
import { PageHeader } from '../components/Layout.jsx';
import Icon from '../components/Icon.jsx';

// Small admin login for the Ginhawa team (shared passcode). Reached from Settings → "Admin login".
// Everyone else uses the app without logging in.
export default function AdminLogin() {
  const { isAdmin, signIn } = useAdmin();
  const { toast } = useUi();
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (isAdmin) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(passcode); // isAdmin turns true and the redirect above opens the stations
      toast('Logged in as admin');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Admin login" subtitle="For the Ginhawa team" back="/settings" />
      <form className="card form admin-login" onSubmit={submit}>
        <span className="connect-icon"><Icon name="gear" size={26} /></span>
        <label>
          Team passcode
          <input type="password" value={passcode} onChange={(e) => setPasscode(e.target.value)} autoFocus
            autoComplete="current-password" required />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Checking…' : 'Log in'}</button>
        <p className="muted small">
          Admins can rename stations, set alert thresholds, acknowledge alerts and remove stations. You don't need
          to log in to view air quality.
        </p>
      </form>
    </>
  );
}
