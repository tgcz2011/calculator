// Units + currency conversion engine. math.js powers unit math via its
// built-in unit() system; currency uses a USD-based snapshot rates table.
//
// ponytail: separate math instance for unit math, no trig overrides. Keeps the
// engine-side math instance untouched (still owned by General, locked contract).
// ponytail: error codes mirror engine's classifyError() so the UI can branch on
// the same set: UNIT_PARSE / UNKNOWN_UNIT / CONVERT.

import { create, all } from 'mathjs';
import ratesData from '../data/rates.json';

const unitMath = create(all);

export type UnitCategory = 'length' | 'mass' | 'volume' | 'temperature' | 'data' | 'currency';

export interface UnitDef {
  /** symbol used in expressions, e.g. 'km', 'lb', 'celsius' */
  readonly symbol: string;
  /** display label, e.g. '千米 (km)' or 'Kilometers' */
  readonly label: string;
}

export interface CategoryDef {
  readonly id: UnitCategory;
  /** display label for sub-tab */
  readonly label: string;
  readonly units: readonly UnitDef[];
}

// ponytail (TGC-22, live-rates): the bundled `rates.json` stays the offline
// baseline (used when the network is down or the in-memory cache is empty).
// Live fetches replace the table at runtime via setLiveRates() — Units.tsx
// surfaces a "刷新" button that triggers the fetch + UI re-render.
const BASELINE_RATES: Record<string, number> = { ...ratesData.rates };
export const BASELINE_UPDATED_AT = String(ratesData.updatedAt);
export const BASELINE_BASE = String(ratesData.base);

let liveRates: Record<string, number> | null = null;
let liveRatesUpdatedAt: string = '';
let liveRatesSource: string = '';

export const CURRENCY_RATES: Record<string, number> = (() => {
  // Start from the bundled snapshot. Live fetches overwrite keys (and add new
  // codes) via setLiveRates(); the bundled table is always the offline fallback.
  const merged: Record<string, number> = { ...BASELINE_RATES };
  if (liveRates) Object.assign(merged, liveRates);
  return merged;
})();

export const CURRENCY_UPDATED_AT = liveRatesUpdatedAt || BASELINE_UPDATED_AT;
export const CURRENCY_BASE = BASELINE_BASE;
export const CURRENCY_SOURCE = liveRatesSource || 'snapshot';

export function setLiveRates(rates: Record<string, number>, updatedAt: string, source: string): void {
  liveRates = { ...rates };
  liveRatesUpdatedAt = updatedAt;
  liveRatesSource = source;
  // Overwrite the live keys on the shared table. The next convertCurrency() call
  // will pick them up via CURRENCY_RATES reference. Object.assign mutates in
  // place so any module that has captured CURRENCY_RATES sees the update.
  for (const k of Object.keys(CURRENCY_RATES)) delete CURRENCY_RATES[k];
  Object.assign(CURRENCY_RATES, BASELINE_RATES, rates);
}

export function clearLiveRates(): void {
  liveRates = null;
  liveRatesUpdatedAt = '';
  liveRatesSource = '';
  for (const k of Object.keys(CURRENCY_RATES)) delete CURRENCY_RATES[k];
  Object.assign(CURRENCY_RATES, BASELINE_RATES);
}

export function getCurrencySource(): string {
  return CURRENCY_SOURCE;
}

export const CATEGORIES: readonly CategoryDef[] = [
  {
    id: 'length',
    label: '长度',
    units: [
      { symbol: 'km', label: '千米 km' },
      { symbol: 'm', label: '米 m' },
      { symbol: 'cm', label: '厘米 cm' },
      { symbol: 'mm', label: '毫米 mm' },
      { symbol: 'mi', label: '英里 mi' },
      { symbol: 'yd', label: '码 yd' },
      { symbol: 'ft', label: '英尺 ft' },
      { symbol: 'in', label: '英寸 in' },
    ],
  },
  {
    id: 'mass',
    label: '质量',
    units: [
      { symbol: 'kg', label: '千克 kg' },
      { symbol: 'g', label: '克 g' },
      { symbol: 'mg', label: '毫克 mg' },
      { symbol: 't', label: '吨 t' },
      { symbol: 'lb', label: '磅 lb' },
      { symbol: 'oz', label: '盎司 oz' },
    ],
  },
  {
    id: 'volume',
    label: '体积',
    units: [
      { symbol: 'l', label: '升 L' },
      { symbol: 'ml', label: '毫升 mL' },
      { symbol: 'm3', label: '立方米 m³' },
      { symbol: 'gal', label: '美制加仑 gal' },
      { symbol: 'cup', label: '杯 cup' },
      { symbol: 'floz', label: '液量盎司 fl oz' },
    ],
  },
  {
    id: 'temperature',
    label: '温度',
    units: [
      { symbol: 'celsius', label: '摄氏度 °C' },
      { symbol: 'fahrenheit', label: '华氏度 °F' },
      { symbol: 'kelvin', label: '开尔文 K' },
    ],
  },
  {
    id: 'data',
    label: '数据',
    units: [
      { symbol: 'bit', label: '比特 bit' },
      { symbol: 'byte', label: '字节 B' },
      { symbol: 'kbit', label: '千比特 kbit' },
      { symbol: 'kB', label: '千字节 kB' },
      { symbol: 'KiB', label: '二进 KB KiB' },
      { symbol: 'MB', label: '兆字节 MB' },
      { symbol: 'MiB', label: '二进 MB MiB' },
      { symbol: 'GB', label: '吉字节 GB' },
      { symbol: 'GiB', label: '二进 GB GiB' },
      { symbol: 'TB', label: '太字节 TB' },
      { symbol: 'TiB', label: '二进 TB TiB' },
    ],
  },
  {
    id: 'currency',
    label: '货币',
    units: Object.keys(BASELINE_RATES).map((code) => ({
      symbol: code,
      label: code,
    })),
  },
];

export interface UnitsResult {
  value: string;
  symbol: string;
  error?: string;
  errorCode?: string;
}

function classifyUnitsError(e: unknown): { error: string; code: string } {
  const msg = String((e as Error)?.message ?? e);
  if (/Undefined symbol|Undefined function/i.test(msg)) return { error: `未知单位: ${msg.replace(/^.*:\s*/, '')}`, code: 'UNKNOWN_UNIT' };
  if (/Cannot convert/i.test(msg)) return { error: '单位不兼容（需要同类单位或带 to 语法）', code: 'CONVERT' };
  if (/Parenthesis|Unexpected end/i.test(msg)) return { error: '表达式语法错误', code: 'UNIT_PARSE' };
  return { error: msg, code: 'ENGINE' };
}

/**
 * Convert `amount` from `from` to `to` within the same non-currency category.
 * Currency is handled separately via convertCurrency().
 */
export function convertUnits(
  amountText: string,
  category: CategoryDef,
  fromSymbol: string,
  toSymbol: string,
): UnitsResult {
  if (category.id === 'currency') return convertCurrency(amountText, fromSymbol, toSymbol);
  const n = Number(amountText);
  if (!Number.isFinite(n)) {
    return { value: '', symbol: toSymbol, error: '请输入有效数字', errorCode: 'UNIT_PARSE' };
  }
  try {
    const expr = `${amountText} ${fromSymbol} to ${toSymbol}`;
    const out = unitMath.evaluate(expr);
    const text = unitMath.format(out, { precision: 10 });
    return { value: stripUnitSuffix(text), symbol: toSymbol };
  } catch (e) {
    const cls = classifyUnitsError(e);
    return { value: '', symbol: toSymbol, error: cls.error, errorCode: cls.code };
  }
}

/** Currency: USD-based snapshot. `rate` = units of currency per 1 USD.
 *  So 100 USD * rate(EUR) / rate(USD) = 100 * 0.92 = 92 EUR.
 *  And 100 CNY * rate(USD) / rate(CNY) = 100 * 1 / 7.24 = 13.81 USD.
 */
export function convertCurrency(
  amountText: string,
  fromCode: string,
  toCode: string,
): UnitsResult {
  const n = Number(amountText);
  if (!Number.isFinite(n)) {
    return { value: '', symbol: toCode, error: '请输入有效数字', errorCode: 'UNIT_PARSE' };
  }
  const rateFrom = CURRENCY_RATES[fromCode];
  const rateTo = CURRENCY_RATES[toCode];
  if (!rateFrom || !rateTo) {
    return { value: '', symbol: toCode, error: `汇率表中缺少 ${fromCode} 或 ${toCode}`, errorCode: 'UNKNOWN_UNIT' };
  }
  const result = (n * rateTo) / rateFrom;
  return {
    value: result.toLocaleString('en-US', { maximumFractionDigits: 4 }),
    symbol: toCode,
  };
}

function stripUnitSuffix(s: string): string {
  // math.js format() appends " <unit>". We expose the unit via `symbol` field;
  // strip it from `value` so the UI doesn't double up.
  const m = /^\s*([-+]?[0-9.,eE\s]+)\s*[A-Za-zµμ°]+\s*$/.exec(s);
  if (m) return m[1].trim();
  return s.trim();
}

// === Live currency rates (TGC-22, module 1) ===
//
// Source priority:
//   1. Frankfurter (api.frankfurter.app) — no key, no quota, ECB EOD feed.
//   2. exchangerate.host — no key, broader coverage, used as fallback.
//   3. LocalStorage cache (rates-cache:v1) — last successful response, any
//      source. Used when both APIs fail; the user can still convert.
//   4. Bundled rates.json (BASELINE_RATES) — always available, but stale.
//
// The fetch path returns {rates, updatedAt, source}. On both API failures it
// returns the LocalStorage cache (if present) or null. The UI surfaces the
// source label so the user can see which feed the current numbers came from.

export type RatesSource = 'frankfurter' | 'exchangerate.host' | 'cache' | 'bundled' | 'none';

export interface LiveRatesPayload {
  rates: Record<string, number>;
  base: string;
  updatedAt: string;
  source: RatesSource;
}

const RATES_CACHE_KEY = 'rates-cache:v1';
const RATES_TTL_MS = 24 * 60 * 60 * 1000; // 24h; rates are EOD.

interface CachedRates {
  rates: Record<string, number>;
  base: string;
  updatedAt: string;
  source: RatesSource;
  cachedAt: number;
}

function readCache(): CachedRates | null {
  try {
    const raw = localStorage.getItem(RATES_CACHE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw) as CachedRates;
    if (!obj || typeof obj !== 'object' || !obj.rates) return null;
    return obj;
  } catch {
    return null;
  }
}

function writeCache(payload: LiveRatesPayload): void {
  try {
    const cached: CachedRates = {
      ...payload,
      cachedAt: Date.now(),
    };
    localStorage.setItem(RATES_CACHE_KEY, JSON.stringify(cached));
  } catch {
    // private mode — ignore
  }
}

// ponytail (TGC-22, module 1): both APIs speak JSON over HTTPS and ship CORS
// headers wide open. We pass AbortSignal.timeout (3s) so a hung socket doesn't
// strand the UI on a spinner.
async function fetchFrankfurter(signal: AbortSignal): Promise<LiveRatesPayload | null> {
  const res = await fetch('https://api.frankfurter.app/latest?base=USD', { signal });
  if (!res.ok) return null;
  const data = await res.json() as { base?: string; rates?: Record<string, number>; date?: string };
  if (!data.rates || typeof data.rates !== 'object') return null;
  // Frankfurter omits the base currency from the rates dict; merge it back at 1.
  const rates: Record<string, number> = { ...data.rates, [data.base ?? 'USD']: 1 };
  return {
    rates,
    base: data.base ?? 'USD',
    updatedAt: data.date ? `${data.date}T00:00:00Z` : new Date().toISOString(),
    source: 'frankfurter',
  };
}

async function fetchExchangerateHost(signal: AbortSignal): Promise<LiveRatesPayload | null> {
  const res = await fetch('https://api.exchangerate.host/latest?base=USD', { signal });
  if (!res.ok) return null;
  const data = await res.json() as { base?: string; rates?: Record<string, number>; date?: string };
  if (!data.rates || typeof data.rates !== 'object') return null;
  const rates: Record<string, number> = { ...data.rates, [data.base ?? 'USD']: 1 };
  return {
    rates,
    base: data.base ?? 'USD',
    updatedAt: data.date ? `${data.date}T00:00:00Z` : new Date().toISOString(),
    source: 'exchangerate.host',
  };
}

export async function fetchLiveRates(force = false): Promise<LiveRatesPayload> {
  // Fresh-cache fast path: return memory cache if < TTL and not forced.
  if (!force && liveRates && Date.now() - Date.parse(liveRatesUpdatedAt || '') < RATES_TTL_MS) {
    return {
      rates: { ...liveRates, [BASELINE_BASE]: 1 },
      base: BASELINE_BASE,
      updatedAt: liveRatesUpdatedAt,
      source: liveRatesSource as RatesSource,
    };
  }
  // Persistent cache fast path: same TTL.
  if (!force) {
    const cached = readCache();
    if (cached && Date.now() - cached.cachedAt < RATES_TTL_MS) {
      setLiveRates(cached.rates, cached.updatedAt, cached.source);
      return { ...cached, source: cached.source };
    }
  }
  // Try primary then fallback. Each request gets its own 3s timeout.
  const errors: unknown[] = [];
  for (const fetcher of [fetchFrankfurter, fetchExchangerateHost]) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3000);
      const payload = await fetcher(ctrl.signal);
      clearTimeout(timer);
      if (payload) {
        setLiveRates(payload.rates, payload.updatedAt, payload.source);
        writeCache(payload);
        return payload;
      }
    } catch (e) {
      errors.push(e);
    }
  }
  // All APIs down. Use whatever the cache holds, even if stale.
  const cached = readCache();
  if (cached) {
    setLiveRates(cached.rates, cached.updatedAt, 'cache');
    return { ...cached, source: 'cache' };
  }
  // Last resort: bundled snapshot, no network at all.
  return {
    rates: { ...BASELINE_RATES },
    base: BASELINE_BASE,
    updatedAt: BASELINE_UPDATED_AT,
    source: 'bundled',
  };
}

export function formatStamp(iso: string): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export function sourceLabel(src: string): string {
  switch (src) {
    case 'frankfurter': return 'Frankfurter · ECB';
    case 'exchangerate.host': return 'exchangerate.host';
    case 'cache': return '离线缓存';
    case 'bundled': return '本地快照';
    default: return src;
  }
}