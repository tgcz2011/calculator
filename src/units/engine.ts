// Units + currency conversion engine. math.js powers unit math via its
// built-in unit() system; currency uses a local USD-based snapshot rates table.
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
    units: Object.keys(ratesData.rates).map((code) => ({
      symbol: code,
      label: `${code} (snapshot)`,
    })),
  },
];

export const CURRENCY_RATES: Record<string, number> = { ...ratesData.rates };
export const CURRENCY_UPDATED_AT = String(ratesData.updatedAt);
export const CURRENCY_BASE = String(ratesData.base);

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