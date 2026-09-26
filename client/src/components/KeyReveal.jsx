import { useState } from 'react';
import Icon from './Icon.jsx';

/** Shows a freshly issued device key once, with a copy button and a ready-to-run example. */
export default function KeyReveal({ apiKey }) {
  const [copied, setCopied] = useState(false);
  const origin = window.location.origin;
  const copy = async () => {
    await navigator.clipboard?.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="key-reveal">
      <p className="warning">
        <Icon name="alert" size={16} /> Copy this key now. For security it is only shown once.
      </p>
      <div className="key-box">
        <code>{apiKey}</code>
        <button type="button" className="icon-btn" onClick={copy} aria-label="Copy key">
          <Icon name={copied ? 'check' : 'copy'} />
        </button>
      </div>
      <details>
        <summary>How the device uses it</summary>
        <p className="muted small">Put the key in the firmware's <code>DEVICE_KEY</code>. Each reading is sent like this:</p>
        <pre>{`curl -X POST ${origin}/api/v1/ingest \\
  -H "Content-Type: application/json" \\
  -H "X-Device-Key: ${apiKey}" \\
  -d '{"pm25":18.2,"pm10":24.1,"voc_index":112,"nox_index":4,"temperature":30.1,"humidity":68}'`}</pre>
      </details>
    </div>
  );
}
