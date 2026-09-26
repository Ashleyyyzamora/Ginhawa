import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useLive } from '../live.jsx';
import { PageHeader } from '../components/Layout.jsx';
import KeyReveal from '../components/KeyReveal.jsx';
import Icon from '../components/Icon.jsx';

const FIELDS = ['name', 'location', 'latitude', 'longitude', 'pm25_threshold', 'voc_threshold', 'nox_threshold'];
const NUMERIC = new Set(['latitude', 'longitude', 'pm25_threshold', 'voc_threshold', 'nox_threshold']);

export default function DeviceSettings() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { devices, refresh } = useLive();
  const device = devices?.find((d) => d.id === id);
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [newKey, setNewKey] = useState(null);

  useEffect(() => {
    if (device && !form) setForm(Object.fromEntries(FIELDS.map((f) => [f, device[f] ?? ''])));
  }, [device, form]);

  if (!device || !form) return <PageHeader title="Settings" back={`/devices/${id}`} />;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const run = async (fn) => {
    setError(null);
    setMessage(null);
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    }
  };

  const save = (e) => {
    e.preventDefault();
    run(async () => {
      const body = {};
      for (const f of FIELDS) {
        const v = form[f];
        if (NUMERIC.has(f)) body[f] = v === '' ? null : Number(v);
        else body[f] = v === '' && f !== 'name' ? null : v;
      }
      if (body.pm25_threshold == null) delete body.pm25_threshold;
      if (body.voc_threshold == null) delete body.voc_threshold;
      if (body.nox_threshold == null) delete body.nox_threshold;
      await api.updateDevice(id, body);
      await refresh();
      setMessage('Saved');
    });
  };

  const rotate = () =>
    run(async () => {
      if (!confirm('Generate a new key? The device will stop sending data until you update its firmware.')) return;
      setNewKey((await api.rotateKey(id)).apiKey);
    });

  const exportCsv = () =>
    run(async () => {
      const from = new Date(Date.now() - 30 * 86400e3).toISOString();
      const res = await api.exportCsv(id, { from });
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement('a'), { href: url, download: `${device.name}_readings.csv` });
      a.click();
      URL.revokeObjectURL(url);
    });

  const remove = () =>
    run(async () => {
      if (!confirm(`Delete "${device.name}" and all of its readings? This cannot be undone.`)) return;
      await api.deleteDevice(id);
      await refresh();
      navigate('/');
    });

  return (
    <>
      <PageHeader title="Device settings" subtitle={device.name} back={`/devices/${id}`} />
      <form className="card form" onSubmit={save}>
        <h2>Details</h2>
        <label>Name<input value={form.name} onChange={set('name')} required maxLength={100} /></label>
        <label>Location<input value={form.location} onChange={set('location')} maxLength={200} /></label>
        <div className="form-row">
          <label>Latitude<input inputMode="decimal" value={form.latitude} onChange={set('latitude')} /></label>
          <label>Longitude<input inputMode="decimal" value={form.longitude} onChange={set('longitude')} /></label>
        </div>
        <h2>Alert thresholds</h2>
        <p className="muted small">An alert opens when the latest reading goes above a threshold and closes when it drops back.</p>
        <label>PM2.5 (µg/m³)<input inputMode="decimal" value={form.pm25_threshold} onChange={set('pm25_threshold')} /></label>
        <div className="form-row">
          <label>VOC index<input inputMode="decimal" value={form.voc_threshold} onChange={set('voc_threshold')} /></label>
          <label>NOx index<input inputMode="decimal" value={form.nox_threshold} onChange={set('nox_threshold')} /></label>
        </div>
        {message && <p className="success" role="status">{message}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary">Save changes</button>
      </form>

      <section className="card form">
        <h2>Data</h2>
        <button type="button" className="btn" onClick={exportCsv}><Icon name="download" size={18} /> Export last 30 days (CSV)</button>
        <h2>Device key</h2>
        {newKey ? <KeyReveal apiKey={newKey} /> : <button type="button" className="btn" onClick={rotate}>Generate new key</button>}
        <h2>Danger zone</h2>
        <button type="button" className="btn btn-danger" onClick={remove}>Delete device</button>
      </section>
    </>
  );
}
