import { useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useLive } from '../live.jsx';
import Icon from './Icon.jsx';

const PULL_TRIGGER = 64;

export default function Layout() {
  const { user } = useAuth();
  const { devices, refreshAll } = useLive();
  const location = useLocation();
  const openAlerts = devices?.reduce((n, d) => n + d.open_alerts, 0) ?? 0;
  const tabs = [
    { to: '/', icon: 'home', label: 'Stations', end: true },
    { to: '/alerts', icon: 'bell', label: 'Alerts', badge: openAlerts },
    user.role === 'dev' && { to: '/devices/new', icon: 'plus', label: 'Add station' },
    { to: '/account', icon: 'user', label: 'Account' },
  ].filter(Boolean);

  // Pull-to-refresh (touch only): drag down from the top of the page.
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(null);
  const onTouchStart = (e) => {
    startY.current = window.scrollY <= 0 && !refreshing ? e.touches[0].clientY : null;
  };
  const onTouchMove = (e) => {
    if (startY.current == null) return;
    const dy = e.touches[0].clientY - startY.current;
    setPull(dy > 0 ? Math.min(dy * 0.5, 96) : 0);
  };
  const onTouchEnd = async () => {
    startY.current = null;
    if (pull >= PULL_TRIGGER) {
      setRefreshing(true);
      setPull(PULL_TRIGGER);
      await refreshAll().finally(() => setRefreshing(false));
    }
    setPull(0);
  };

  return (
    <div className="shell">
      <div
        className={`ptr ${refreshing ? 'ptr-spinning' : ''}`}
        style={{ height: pull, opacity: Math.min(1, pull / PULL_TRIGGER) }}
        aria-hidden={!refreshing}
      >
        <Icon name="refresh" size={20} style={{ transform: `rotate(${pull * 4}deg)` }} />
        <span>{refreshing ? 'Refreshing…' : pull >= PULL_TRIGGER ? 'Release to refresh' : 'Pull to refresh'}</span>
      </div>
      <main className="content" key={location.pathname} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
        <Outlet />
      </main>
      <nav className="tabbar" aria-label="Main" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className="tab">
            <span className="tab-icon">
              <Icon name={t.icon} />
              {t.badge > 0 && <span className="tab-badge" aria-label={`${t.badge} open alerts`}>{t.badge}</span>}
            </span>
            <span>{t.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function PageHeader({ title, subtitle, back, action }) {
  return (
    <header className="page-header">
      {back && (
        <NavLink to={back} className="icon-btn" aria-label="Back">
          <Icon name="back" />
        </NavLink>
      )}
      <div className="page-title">
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function ConnectionPill() {
  const { status } = useLive();
  const text = { live: 'Live', connecting: 'Connecting…', offline: 'Reconnecting…' }[status];
  return (
    <span className={`pill pill-${status}`} role="status">
      <span className="dot" /> {text}
    </span>
  );
}
