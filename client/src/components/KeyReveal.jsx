import { useState } from 'react';
import { api } from '../api.js';
import Icon from './Icon.jsx';
import { useUi } from './ui.jsx';

const SAMPLE = { pm25: 18.2, pm10: 24.1, voc_index: 112, nox_index: 4, temperature: 30.1, humidity: 68, network: 'wifi' };

function CopyButton({ text, label }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };
  return (
    <button type="button" className="icon-btn" onClick={copy} aria-label={label} title={label}>
      <Icon name={copied ? 'check' : 'copy'} />
    </button>
  );
}

/**
 * Shows a freshly issued sensor key once, with what to put in the firmware and buttons to test
 * the key from this browser before touching the hardware.
 */
export default function KeyReveal({ apiKey, onSample }) {
  const { toast } = useUi();
  const [busy, setBusy] = useState(null);
  const origin = window.location.origin;
  const local = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const config = `#define WIFI_SSID      "your-wifi"
#define WIFI_PASSWORD  "your-wifi-password"
#define API_BASE_URL   "${local ? 'https://<this computer\'s Wi-Fi IP>' : origin}"
#define DEVICE_KEY     "${apiKey}"`;
  const cmd = `curl -k -X POST ${origin}/api/v1/ingest -H "Content-Type: application/json" -H "X-Device-Key: ${apiKey}" -d "{\\"pm25\\":18.2,\\"voc_index\\":112,\\"nox_index\\":4}"`;

  const run = async (kind) => {
    setBusy(kind);
    try {
      if (kind === 'ping') {
        const { device } = await api.pingSensor(apiKey);
        toast(`Key works: connected to ${device.name}`);
      } else {
        const { status } = await api.sendSampleReading(apiKey, SAMPLE);
        toast(`Sample reading received (AQI ${status.aqi})`);
        onSample?.();
      }
    } catch (err) {
      toast(err.message, { tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="key-reveal">
      <p className="warning">
        <Icon name="alert" size={16} /> Copy this key now. For security it is only shown once.
      </p>
      <div className="key-box">
        <code>{apiKey}</code>
        <CopyButton text={apiKey} label="Copy key" />
      </div>

      <div className="setup-block">
        <div className="section-head">
          <strong>Put it in the sensor's <code>config.h</code></strong>
          <CopyButton text={config} label="Copy config" />
        </div>
        <pre>{config}</pre>
        {local && (
          <p className="muted small">
            The sensor can't reach “localhost”. Use this computer's Wi-Fi IP address (run <code>ipconfig</code>) or your
            online domain, as explained in the README under “Open it on your phone”.
          </p>
        )}
      </div>

      <div className="setup-block">
        <strong>Test it before touching the hardware</strong>
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => run('ping')} disabled={!!busy}>
            <Icon name="wifi" size={18} /> {busy === 'ping' ? 'Testing…' : 'Test connection'}
          </button>
          <button type="button" className="btn" onClick={() => run('sample')} disabled={!!busy}>
            <Icon name="activity" size={18} /> {busy === 'sample' ? 'Sending…' : 'Send a sample reading'}
          </button>
        </div>
        <p className="muted small">
          “Test connection” only checks the key. “Send a sample reading” stores one reading with made-up values, so the
          station shows as live, exactly as it will when the real sensor reports.
        </p>
      </div>

      <details>
        <summary>Send a reading from a computer (Command Prompt, macOS, Linux)</summary>
        <pre>{cmd}</pre>
      </details>
    </div>
  );
}
