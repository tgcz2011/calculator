// ponytail: minimal i18n for zh / en. Two locales, no fallback chain — if a
// key is missing in the active locale, the zh dictionary is the canonical
// fallback (Chinese is the project's primary authoring language). Persisted in
// localStorage as 'lang-pref'; on first launch we sniff navigator.language
// (zh* → 'zh', everything else → 'en').
//
// Public API:
//   t(key, vars?)             — translate a dot-path key with optional {var} interpolation
//   tError(code, fallback?)   — translate a known engine errorCode, with engine's
//                               localized message as the fallback (or zh lookup
//                               when running in en to keep symbol names).
//
// Use the useI18n() hook from React components so they re-render when locale
// changes. The raw t() export is for non-component callers (Display, etc.)

export type Locale = 'zh' | 'en';

export const SUPPORTED_LOCALES: Locale[] = ['zh', 'en'];

const STORAGE_KEY = 'lang-pref';

export function detectLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'zh' || stored === 'en') return stored;
  } catch {
    // private mode / no localStorage
  }
  if (typeof navigator !== 'undefined') {
    const lang = (navigator.language || '').toLowerCase();
    if (lang.startsWith('zh')) return 'zh';
  }
  return 'en';
}

export function readLocale(): Locale {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'zh' || v === 'en' ? v : 'zh';
  } catch {
    return 'zh';
  }
}

export function writeLocale(loc: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, loc);
  } catch {
    // private mode — no-op
  }
}

type Vars = Record<string, string | number>;

function format(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) =>
    vars[k] !== undefined ? String(vars[k]) : `{${k}}`,
  );
}

function lookup(dict: Record<string, string>, key: string): string | undefined {
  return dict[key];
}

// Translations are simple flat dot-paths. We could split by namespace but
// for two locales + ~30 keys, one file per locale keeps diffs reviewable.
import { zh } from './zh';
import { en } from './en';

const DICTS: Record<Locale, Record<string, string>> = { zh, en };

export function translate(loc: Locale, key: string, vars?: Vars): string {
  const direct = lookup(DICTS[loc], key);
  if (direct !== undefined) return format(direct, vars);
  // Fallback: zh dictionary is the canonical source of truth.
  const fb = lookup(DICTS.zh, key);
  if (fb !== undefined) return format(fb, vars);
  // Last resort: surface the missing key so tests / devs notice.
  return key;
}

// ponytail: localized engine error messages. Engine returns a Chinese string
// for `error` (its classifyError) plus a stable errorCode. When the user's
// locale is en, we rebuild the message in English using the code as the
// anchor. UNKNOWN_SYMBOL is special: the engine message contains the
// offending identifier ("未知符号: foo"), so we parse it from the fallback to
// keep the symbol name in the en message too.
const EN_ERROR_BY_CODE: Record<string, string> = {
  UNCLOSED: 'Expression incomplete',
  PAREN: 'Mismatched parentheses',
  MISSING_OPERAND: 'Missing operand',
  UNKNOWN_SYMBOL: 'Unknown symbol: {symbol}',
  NOT_FUNCTION: 'Undefined function',
  CONVERT: 'Cannot convert',
  ENGINE: 'Calculation error',
};

export function localizeErrorMessage(
  loc: Locale,
  code: string | undefined,
  fallback: string,
): string {
  if (!code) return fallback;
  if (loc === 'zh') return fallback;
  const tmpl = EN_ERROR_BY_CODE[code];
  if (!tmpl) return fallback;
  if (code === 'UNKNOWN_SYMBOL') {
    // Engine message shape: "未知符号: <name>". The {symbol} slot is the tail
    // after the colon. If parsing fails, fall back to the engine message.
    const colonIdx = fallback.lastIndexOf(':');
    const symbol = colonIdx >= 0 ? fallback.slice(colonIdx + 1).trim() : '';
    if (!symbol) return fallback;
    return format(tmpl, { symbol });
  }
  return tmpl;
}