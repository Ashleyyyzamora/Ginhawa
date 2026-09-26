import { useState } from 'react';
import { useAuth } from '../auth.jsx';

export default function Login() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') await login(form.email, form.password);
      else await register(form.name, form.email, form.password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-brand">
        <img src="/icon.svg" alt="" width="64" height="64" />
        <h1>Ginhawa</h1>
        <p className="muted">Breathe easier in busy places. Live PM2.5, VOC and NOx readings from your sensors.</p>
      </div>
      <form className="card form" onSubmit={submit}>
        <div className="segmented" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'login'} onClick={() => setMode('login')}>Sign in</button>
          <button type="button" role="tab" aria-selected={mode === 'register'} onClick={() => setMode('register')}>Create account</button>
        </div>
        {mode === 'register' && (
          <label>
            Name
            <input value={form.name} onChange={set('name')} required autoComplete="name" />
          </label>
        )}
        <label>
          Email
          <input type="email" value={form.email} onChange={set('email')} required autoComplete="email" />
        </label>
        <label>
          Password
          <input type="password" value={form.password} onChange={set('password')} required minLength={mode === 'register' ? 8 : 1}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
      </form>
    </div>
  );
}
