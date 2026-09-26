import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useLive } from '../live.jsx';
import { PageHeader } from '../components/Layout.jsx';
import KeyReveal from '../components/KeyReveal.jsx';

export default function AddDevice() {
  const { refresh } = useLive();
  const [form, setForm] = useState({ name: '', location: '', latitude: '', longitude: '' });
  const [created, setCreated] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const useMyLocation = () =>
    navigator.geolocation?.getCurrentPosition(
      (pos) => setForm((f) => ({ ...f, latitude: pos.coords.latitude.toFixed(6), longitude: pos.coords.longitude.toFixed(6) })),
      () => setError('Could not read your location'),
    );

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = {
        name: form.name,
        location: form.location || null,
        latitude: form.latitude === '' ? null : Number(form.latitude),
        longitude: form.longitude === '' ? null : Number(form.longitude),
      };
      setCreated(await api.createDevice(body));
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
        <PageHeader title="Device added" subtitle={created.device.name} />
        <div className="card">
          <KeyReveal apiKey={created.apiKey} />
          <Link to={`/devices/${created.device.id}`} className="btn btn-primary">Open device</Link>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Add a device" subtitle="Register a sensor node to get its API key" />
      <form className="card form" onSubmit={submit}>
        <label>
          Name
          <input value={form.name} onChange={set('name')} placeholder="e.g. Library entrance" required maxLength={100} />
        </label>
        <label>
          Location <span className="muted">(optional)</span>
          <input value={form.location} onChange={set('location')} placeholder="Building / floor / landmark" maxLength={200} />
        </label>
        <div className="form-row">
          <label>
            Latitude
            <input inputMode="decimal" value={form.latitude} onChange={set('latitude')} />
          </label>
          <label>
            Longitude
            <input inputMode="decimal" value={form.longitude} onChange={set('longitude')} />
          </label>
        </div>
        <button type="button" className="btn" onClick={useMyLocation}>Use my current location</button>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Adding…' : 'Add device'}</button>
      </form>
    </>
  );
}
