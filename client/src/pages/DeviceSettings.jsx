import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useLive } from '../live.jsx';
import { PageHeader } from '../components/Layout.jsx';
import { useUi } from '../components/ui.jsx';

const FIELDS = ['name', 'landmark', 'pm25_threshold', 'voc_threshold', 'nox_threshold'];
const THRESHOLDS = ['pm25_threshold', 'voc_threshold', 'nox_threshold'];

// Team only (admin passcode): rename a station, set its thresholds, or remove it.
export default function DeviceSettings() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { devices, refresh } = useLive();
  const { toast, confirm } = useUi();
  const device = devices?.find((d) => d.id === id);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (device && !form) setForm({ ...Object.fromEntries(FIELDS.map((f) => [f, device[f] ?? ''])), name_from_gps: device.name_from_gps });
  }, [device, form]);

  if (device && !device.can_manage) return <Navigate to={`/devices/${id}`} replace />;
  if (!device || !form) return <PageHeader title="Settings" back={`/devices/${id}`} />;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = { name: form.name, landmark: form.landmark || null, name_from_gps: form.name_from_gps };
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

  const remove = async (block) => {
    const ok = await confirm({
      title: block ? `Remove and block ${device.name}?` : `Remove ${device.name}?`,
      message: block
        ? 'Removes the station with all of its readings and alerts, and stops this device from joining again. Use this for lost or stolen hardware.'
        : 'Removes the station with all of its readings and alerts, for everyone. If its device is still switched on, it will join again as a new station.',
      confirmLabel: block ? 'Remove and block' : 'Remove station',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteDevice(id, { block });
      await refresh();
      toast(`${device.name} removed`);
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
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, name_from_gps: false })}
            placeholder="e.g. Barangay Carmen" required maxLength={100} />
        </label>
        <label>
          Landmark / spot
          <input value={form.landmark} onChange={(e) => setForm({ ...form, landmark: e.target.value, name_from_gps: false })}
            placeholder="e.g. Near the public market entrance" maxLength={200} />
        </label>
        <label className="toggle-row">
          <input type="checkbox" checked={form.name_from_gps} onChange={(e) => setForm({ ...form, name_from_gps: e.target.checked })} />
          <span>
            Name it from its GPS location
            <span className="muted small" style={{ display: 'block', fontWeight: 400 }}>
              The station is named after its barangay automatically, and renamed if it is moved. Typing a name turns this off.
            </span>
          </span>
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

      {device.chip_id && (
        <section className="card form">
          <h2>Device</h2>
          <p className="muted small">Hardware ID <code>{device.chip_id}</code>. It joined by itself on {new Date(device.created_at).toLocaleDateString()}.</p>
        </section>
      )}

      <section className="card form danger-zone">
        <h2>Danger zone</h2>
        <button type="button" className="btn btn-danger" onClick={() => remove(false)}>Remove station</button>
        <button type="button" className="btn btn-danger" onClick={() => remove(true)}>Remove and block device</button>
      </section>
    </>
  );
}
