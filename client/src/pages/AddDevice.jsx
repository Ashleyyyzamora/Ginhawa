import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useLive } from '../live.jsx';
import { PageHeader } from '../components/Layout.jsx';
import KeyReveal from '../components/KeyReveal.jsx';

// Adding a station registers the sensor placed there (one device = one station).
export default function AddDevice() {
  const { refresh } = useLive();
  const [form, setForm] = useState({ name: '', landmark: '' });
  const [created, setCreated] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setCreated(await api.createDevice({ name: form.name, landmark: form.landmark || null }));
      refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <>
        <PageHeader title="Station added" subtitle={[created.device.name, created.device.landmark].filter(Boolean).join(' · ')} />
        <div className="card">
          <KeyReveal apiKey={created.apiKey} />
          <Link to={`/devices/${created.device.id}`} className="btn btn-primary">Open station</Link>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Add a station" subtitle="Where the sensor is placed. Everyone signed in will see it." />
      <form className="card form" onSubmit={submit}>
        <label>
          Station / location
          <input value={form.name} onChange={set('name')} placeholder="e.g. Barangay Carmen" required maxLength={100} />
        </label>
        <label>
          <span>Landmark / spot <span className="muted">(optional)</span></span>
          <input value={form.landmark} onChange={set('landmark')} placeholder="e.g. Near the public market entrance" maxLength={200} />
        </label>
        <p className="muted small">
          Use a landmark to tell apart two sensors in the same place. You'll get a key to put in the sensor's firmware.
        </p>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Adding…' : 'Add station'}</button>
      </form>
    </>
  );
}
