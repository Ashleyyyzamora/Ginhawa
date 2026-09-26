import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useLive } from '../live.jsx';
import { PageHeader } from '../components/Layout.jsx';
import KeyReveal from '../components/KeyReveal.jsx';
import { useUi } from '../components/ui.jsx';

const FIELDS = ['name', 'landmark', 'pm25_threshold', 'voc_threshold', 'nox_threshold'];
const THRESHOLDS = ['pm25_threshold', 'voc_threshold', 'nox_threshold'];

// Developers only: edit a station, change its sensor key, or delete it.
export default function DeviceSettings() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { devices, refresh } = useLive();
  const { toast, confirm } = useUi();
  const device = devices?.find((d) => d.id === id);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [newKey, setNewKey] = useState(null);

  useEffect(() => {
    if (device && !form) setForm(Object.fromEntries(FIELDS.map((f) => [f, device[f] ?? ''])));
  }, [device, form]);

  if (device && !device.can_manage) return <Navigate to={`/devices/${id}`} replace />;
  if (!device || !form) return <PageHeader title="Settings" back={`/devices/${id}`} />;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = { name: form.name, landmark: form.landmark || null };
      for (const f of THRESHOLDS) if (form[f] !== '') body[f] = Number(form[f]);
      await api.updateDevice(id, body);
      await refresh();
      toast('Station saved');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const rotate = async () => {
    const ok = await confirm({
      title: 'Generate a new sensor key?',
      message: 'The sensor at this station will stop sending data until you put the new key in its firmware.',
      confirmLabel: 'Generate key',
    });
    if (!ok) return;
    try {
      setNewKey((await api.rotateKey(id)).apiKey);
    } catch (err) {
      toast(err.message, { tone: 'danger' });
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Delete ${device.name}?`,
      message: 'This removes the station for everyone, with all of its readings and alerts. It cannot be undone.',
      confirmLabel: 'Delete station',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteDevice(id);
      await refresh();
      toast(`${device.name} deleted`);
      navigate('/');
    } catch (err) {
      toast(err.message, { tone: 'danger' });
    }
  };

  return (
    <>
      <PageHeader title="Station settings" subtitle={device.name} back={`/devices/${id}`} />
      <form className="card form" onSubmit={save}>
        <h2>Station</h2>
        <label>
          Station / location
          <input value={form.name} onChange={set('name')} placeholder="e.g. Barangay Carmen" required maxLength={100} />
        </label>
        <label>
          Landmark / spot
          <input value={form.landmark} onChange={set('landmark')} placeholder="e.g. Near the public market entrance" maxLength={200} />
        </label>
        <h2>Alert thresholds</h2>
        <p className="muted small">An alert opens when the latest reading goes above a threshold and closes when it drops back.</p>
        <label>
          PM2.5 (µg/m³)
          <input inputMode="decimal" value={form.pm25_threshold} onChange={set('pm25_threshold')} />
        </label>
        <div className="form-row">
          <label>VOC index<input inputMode="decimal" value={form.voc_threshold} onChange={set('voc_threshold')} /></label>
          <label>NOx index<input inputMode="decimal" value={form.nox_threshold} onChange={set('nox_threshold')} /></label>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
      </form>

      <section className="card form">
        <h2>Sensor key</h2>
        <p className="muted small">Replace the key if it was shared by mistake or you're moving the sensor to a new board.</p>
        {newKey ? <KeyReveal apiKey={newKey} /> : <button type="button" className="btn" onClick={rotate}>Generate new key</button>}
      </section>

      <section className="card form danger-zone">
        <h2>Danger zone</h2>
        <button type="button" className="btn btn-danger" onClick={remove}>Delete station</button>
      </section>
    </>
  );
}
