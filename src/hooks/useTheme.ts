// ponytail: 2-state theme toggle (light/dark). Initial value mirrors whatever
// the index.html inline script applied, falling back to system preference if
// the user has not set an explicit pref. Persists to localStorage as
// 'theme-pref' = 'light' | 'dark'. No React context, no reducer — one hook,
// two-state machine, single attribute on <html>. System-pref tracking only
// runs when no explicit pref is stored (so a user-set theme sticks through
// the OS flipping its dark/light mode).
import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'theme-pref';

// ponytail: PWA theme-color meta tag id (set in index.html) + the two --bg token
// values from tokens.css. Keeping them here as constants so the meta tag stays in
// sync with the actual surface color the user sees.
const THEME_COLOR_META_ID = 'theme-color-meta';
const LIGHT_BG = '#f2f2f7';
const DARK_BG = '#000000';

function setThemeColorMeta(theme: Theme): void {
  const m = document.getElementById(THEME_COLOR_META_ID);
  if (m) m.setAttribute('content', theme === 'light' ? LIGHT_BG : DARK_BG);
}

function readStored(): Theme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveInitial(): Theme {
  // Matches the inline <script> in index.html. If it set data-theme, mirror it;
  // otherwise fall back to system preference.
  if (typeof document === 'undefined') return 'light';
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'light' || attr === 'dark') return attr;
  return systemTheme();
}

export interface UseThemeResult {
  theme: Theme;
  /** Toggle light <-> dark and persist. */
  toggle: () => void;
}

export function useTheme(): UseThemeResult {
  const [theme, setTheme] = useState<Theme>(resolveInitial);

  // Follow OS dark/light while user has no explicit pref.
  useEffect(() => {
    if (readStored() !== null) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const next: Theme = mq.matches ? 'dark' : 'light';
      setTheme(next);
      setThemeColorMeta(next);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  function toggle() {
    setTheme((prev) => {
      const next: Theme = prev === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      setThemeColorMeta(next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // ignore (private mode / quota)
      }
      return next;
    });
  }

  return { theme, toggle };
}