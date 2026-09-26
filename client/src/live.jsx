import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, tokenStore, wsUrl } from './api.js';
import { useUi } from './components/ui.jsx';
import { METRICS } from './format.js';

// Holds all stations (devices) and keeps them fresh from the WebSocket stream.
const LiveContext = createContext(null);

export function LiveProvider({ children }) {
  const [devices, setDevices] = useState(null);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('connecting'); // connecting | live | offline
  const listeners = useRef(new Set());
  const { toast } = useUi();

  const refresh = useCallback(async () => {
    try {
      const { devices } = await api.devices();
      setDevices(devices);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const handleEvent = useCallback((msg) => {
    if (msg.type === 'reading') {
      setDevices((list) =>
        list?.map((d) =>
          d.id === msg.deviceId ? { ...d, latest: msg.reading, last_seen_at: new Date().toISOString() } : d,
        ),
      );
    } else if (msg.type === 'alert' || msg.type === 'alert_resolved') {
      if (msg.type === 'alert') {
        toast(`${METRICS[msg.alert.metric].label} is high at ${msg.alert.device_name}`, { tone: 'danger', duration: 6000 });
      }
      const delta = msg.type === 'alert' ? 1 : -1;
      setDevices((list) =>
        list?.map((d) => (d.id === msg.alert.device_id ? { ...d, open_alerts: Math.max(0, d.open_alerts + delta) } : d)),
      );
    } else if (msg.type === 'device_updated') {
      setDevices((list) => list?.map((d) => (d.id === msg.device.id ? { ...d, ...msg.device } : d)));
    } else if (msg.type === 'device_created') {
      refresh();
    } else if (msg.type === 'device_deleted') {
      setDevices((list) => list?.filter((d) => d.id !== msg.deviceId));
    }
    for (const fn of listeners.current) fn(msg);
  }, [refresh, toast]);

  /** Pull-to-refresh: reload the station list and tell open pages to reload their data. */
  const refreshAll = useCallback(async () => {
    await refresh();
    for (const fn of listeners.current) fn({ type: 'refresh' });
  }, [refresh]);

  useEffect(() => {
    let ws;
    let retry = 0;
    let timer;
    let closed = false;

    const connect = () => {
      setStatus('connecting');
      ws = new WebSocket(wsUrl());
      ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token: tokenStore.get() }));
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === 'ready') {
          retry = 0;
          setStatus('live');
          refresh(); // catch up on anything missed while disconnected
        } else {
          handleEvent(msg);
        }
      };
      ws.onclose = () => {
        if (closed) return;
        setStatus('offline');
        timer = setTimeout(connect, Math.min(30000, 1000 * 2 ** retry++));
      };
    };
    refresh();
    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      ws?.close();
    };
  }, [refresh, handleEvent]);

  const subscribe = useCallback((fn) => {
    listeners.current.add(fn);
    return () => listeners.current.delete(fn);
  }, []);

  return (
    <LiveContext.Provider value={{ devices, error, status, refresh, refreshAll, subscribe, setDevices }}>
      {children}
    </LiveContext.Provider>
  );
}

export const useLive = () => useContext(LiveContext);

/** Re-renders every `ms` so relative times ("12s ago") and online dots stay current. */
export function useNow(ms = 5000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
