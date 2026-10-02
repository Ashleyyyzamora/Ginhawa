import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useLive } from '../live.jsx';
import Icon from './Icon.jsx';
import { useTheme } from '../theme.js';

const PULL_TRIGGER = 64;

export default function Layout() {
  const { devices, refreshAll } = useLive();
  const location = useLocation();
  const openAlerts = devices?.reduce((n, d) => n + d.open_alerts, 0) ?? 0;
  const tabs = [
    { to: '/', icon: 'home', label: 'Stations', end: true },
    { to: '/alerts', icon: 'bell', label: 'Alerts', badge: openAlerts },
    { to: '/settings', icon: 'gear', label: 'Settings' },
  ];

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

/**
 * Apple-style large title: the big title scrolls away and a compact bar with the
 * same title (plus back / action buttons) stays pinned at the top.
 */
export function PageHeader({ title, subtitle, back, action }) {
  const titleRef = useRef(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const el = titleRef.current;
    if (!el || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(([entry]) => setCompact(!entry.isIntersecting), {
      rootMargin: '-56px 0px 0px 0px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <>
      <div className={`navbar ${compact ? 'navbar-compact' : ''}`}>
        <div className="navbar-side">
          {back && (
            <NavLink to={back} className="nav-btn" aria-label="Back">
              <Icon name="back" />
            </NavLink>
          )}
        </div>
        <div className="navbar-title" aria-hidden={!compact}>{title}</div>
        <div className="navbar-side navbar-actions">{action}</div>
      </div>
      <header className="large-title" ref={titleRef}>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </header>
    </>
  );
}

/** Quick light/dark switch. Picks the opposite of what is shown now (the Account page also offers "System"). */
export function ThemeToggle() {
  const { theme, setPref } = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button className="nav-btn" onClick={() => setPref(next)} aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`}>
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={20} />
    </button>
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
