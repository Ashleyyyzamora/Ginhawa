import { useState } from 'react';
import { api } from '../api.js';
import Icon from './Icon.jsx';
import KeyReveal from './KeyReveal.jsx';
import { useUi } from './ui.jsx';

const FIRMWARE_URL = 'https://github.com/ashleyyyzamora/ginhawa/tree/main/firmware/ginhawa_node';

/**
 * Shown on a station that has never reported: what to do next, depending on the user's role.
 * The key lives in the parent so the guide stays open (key still visible) after a sample reading arrives.
 */
export default function ConnectGuide({ device, apiKey: key, setApiKey: setKey }) {
  const { toast } = useUi();
  const connected = !!device.last_seen_at;
  const [busy, setBusy] = useState(false);

  if (!device.can_manage) {
    return (
      <section className="card connect-card">
        <span className="connect-icon"><Icon name="chip" size={28} /></span>
        <h2>Sensor not connected yet</h2>
        <p className="muted">
          This station has been set up, but its sensor hasn't sent a reading yet. Live air quality will appear here
          automatically as soon as it starts reporting.
        </p>
      </section>
    );
  }

  const issueKey = async () => {
    setBusy(true);
    try {
      setKey((await api.rotateKey(device.id)).apiKey);
    } catch (err) {
      toast(err.message, { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card connect-card">
      <span className="connect-icon"><Icon name="chip" size={28} /></span>
      <h2>{connected ? 'Station is receiving data' : 'Connect this station\'s sensor'}</h2>
      <p className="muted">
        {connected ? 'Copy the key if you haven\'t yet, then close this guide.' : 'No readings yet. Three steps and it goes live:'}
      </p>
      <ol className="steps">
        <li className={key ? 'done' : ''}>
          <div>
            <strong>Get the sensor key</strong>
            <p className="muted small">Each station has its own secret key. A new key replaces any earlier one.</p>
            {!key && (
              <button type="button" className="btn btn-primary" onClick={issueKey} disabled={busy}>
                {busy ? 'Generating…' : 'Generate sensor key'}
              </button>
            )}
          </div>
        </li>
        {key && (
          <li className="steps-wide">
            <KeyReveal apiKey={key} />
          </li>
        )}
        <li>
          <div>
            <strong>Flash the firmware</strong>
            <p className="muted small">
              Open <code>ginhawa_node.ino</code> in the Arduino IDE, fill in <code>config.h</code>, select
              <b> ESP32 Dev Module</b> and upload.{' '}
              <a className="link" href={FIRMWARE_URL} target="_blank" rel="noreferrer">Firmware on GitHub</a>
            </p>
          </div>
        </li>
        <li>
          <div>
            <strong>Power it on</strong>
            <p className="muted small">The station turns <b>Live</b> here within a minute of its first upload.</p>
          </div>
        </li>
      </ol>
      {connected && (
        <button type="button" className="btn btn-primary" onClick={() => setKey(null)}>
          <Icon name="check" size={18} /> Done
        </button>
      )}
    </section>
  );
}
