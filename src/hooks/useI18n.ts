// ponytail: locale hook. Detects on first render via detectLocale(), then
// exposes `t(key, vars?)` + a setter that persists + re-renders subscribers.
// No React context — components that want translations call useI18n()
// directly. Cheap because the consumer list is small and selector equality
// keeps unrelated renders off.
import { useCallback, useEffect, useState } from 'react';
import { detectLocale, translate, writeLocale, type Locale } from '../i18n';

export interface I18nApi {
  locale: Locale;
  setLocale(next: Locale): void;
  toggleLocale(): void;
  t(key: string, vars?: Record<string, string | number>): string;
}

export function useI18n(): I18nApi {
  const [locale, setLocaleState] = useState<Locale>(() => detectLocale());

  // Storage write + DOM lang attribute (a11y + screen-reader language hint).
  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    writeLocale(next);
    try {
      document.documentElement.setAttribute('lang', next === 'zh' ? 'zh-CN' : 'en');
    } catch {
      // SSR / non-browser — no-op
    }
  }, []);

  const toggleLocale = useCallback(() => {
    setLocale(locale === 'zh' ? 'en' : 'zh');
  }, [locale, setLocale]);

  // Mirror initial detection onto <html lang> on first mount (the inline
  // theme script doesn't touch lang; we want it set before first paint).
  useEffect(() => {
    try {
      document.documentElement.setAttribute('lang', locale === 'zh' ? 'zh-CN' : 'en');
    } catch {
      // no-op
    }
  }, [locale]);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale],
  );

  return { locale, setLocale, toggleLocale, t };
}