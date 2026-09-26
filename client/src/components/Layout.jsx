import { NavLink, Outlet } from 'react-router-dom';
import { useLive } from '../live.jsx';
import Icon from './Icon.jsx';

export default function Layout() {
  const { devices } = useLive();
  const openAlerts = devices?.reduce((n, d) => n + d.open_alerts, 0) ?? 0;
  const tabs = [
    { to: '/', icon: 'home', label: 'Home', end: true },
    { to: '/alerts', icon: 'bell', label: 'Alerts', badge: openAlerts },
    { to: '/devices/new', icon: 'plus', label: 'Add station' },
    { to: '/account', icon: 'user', label: 'Account' },
  ];
  return (
    <div className="shell">
      <main className="content">
        <Outlet />
      </main>
      <nav className="tabbar" aria-label="Main">
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
