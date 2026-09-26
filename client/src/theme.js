import { useEffect, useState } from 'react';

// Theme preference: 'system' follows the phone; 'light' / 'dark' force a theme.
// The choice is stored per browser and applied as <html data-theme="…">.
const KEY = 'ginhawa.theme';
const THEME_COLORS = { light: '#f2f3ef', dark: '#0e100e' };
const listeners = new Set();

export function getThemePref() {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;
export const resolvedTheme = (pref = getThemePref()) => (pref === 'system' ? (systemDark() ? 'dark' : 'light') : pref);

export function applyTheme(pref = getThemePref()) {
  const root = document.documentElement;
  if (pref === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[resolvedTheme(pref)]);
  for (const fn of listeners) fn();
}

export function setThemePref(pref) {
  try {
    if (pref === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {}
  applyTheme(pref);
}

/** Current preference and the theme actually shown; re-renders when either changes. */
export function useTheme() {
  const read = () => ({ pref: getThemePref(), theme: resolvedTheme() });
  const [state, setState] = useState(read);
  useEffect(() => {
    const update = () => setState(read());
    listeners.add(update);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystem = () => {
      if (getThemePref() === 'system') applyTheme('system');
    };
    mq.addEventListener('change', onSystem);
    return () => {
      listeners.delete(update);
      mq.removeEventListener('change', onSystem);
    };
  }, []);
  return { ...state, setPref: setThemePref };
}
