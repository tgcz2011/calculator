// Canonical engine contract. Locked by Leader: UI depends on this exact shape.
// Source of truth for Minimax-M3's UI. Swap implementation freely, never the signature.
import { create, all } from 'mathjs';

export type AngleMode = 'deg' | 'rad';
export interface EvalOptions {
  angle?: AngleMode;
}
export interface EvalResult {
  value: string;
  error?: string;
}
export interface Engine {
  evaluate(expr: string, options?: EvalOptions): EvalResult;
  setAngleMode(mode: AngleMode): void;
  getAngleMode(): AngleMode;
}

const math = create(all);
const D2R = Math.PI / 180;

// Module-level mode read by the trig overrides below. evaluate() swaps it
// temporarily when options.angle is passed, then restores in finally.
let mode: AngleMode = 'deg';

// Capture originals before overriding so DEG/RAD can layer on top of mathjs core.
// ponytail: cast to (number)=>number; mathjs returns MathType but for real inputs it's a number.
const _sin = math.sin.bind(math) as (x: number) => number;
const _cos = math.cos.bind(math) as (x: number) => number;
const _tan = math.tan.bind(math) as (x: number) => number;
const _asin = math.asin.bind(math) as (x: number) => number;
const _acos = math.acos.bind(math) as (x: number) => number;
const _atan = math.atan.bind(math) as (x: number) => number;

math.import(
  {
    // DEG mode: convert input degrees -> radians for forward trig, output radians -> degrees for inverse.
    sin: (x: number) => (mode === 'deg' ? _sin(x * D2R) : _sin(x)),
    cos: (x: number) => (mode === 'deg' ? _cos(x * D2R) : _cos(x)),
    tan: (x: number) => (mode === 'deg' ? _tan(x * D2R) : _tan(x)),
    asin: (x: number) => (mode === 'deg' ? _asin(x) / D2R : _asin(x)),
    acos: (x: number) => (mode === 'deg' ? _acos(x) / D2R : _acos(x)),
    atan: (x: number) => (mode === 'deg' ? _atan(x) / D2R : _atan(x)),
    // ln alias -> natural log (mathjs log() with one arg is already natural log).
    ln: (x: number) => math.log(x)
  },
  { override: true }
);

// ponytail: unicode normalization for keypad symbols. mathjs native: pi, e, sqrt, ^, !, factorial.
function normalize(expr: string): string {
  return expr
    .replace(/π/g, 'pi')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/√/g, 'sqrt');
}

function formatResult(v: unknown): string {
  if (typeof v === 'number') {
    if (!isFinite(v)) return v > 0 ? 'Infinity' : v < 0 ? '-Infinity' : 'NaN';
    // ponytail: precision 14 strips float noise; regex removes trailing zeros in non-scientific results.
    let s = math.format(v, { precision: 14 });
    if (s.includes('.') && !s.includes('e')) s = s.replace(/\.?0+$/, '');
    return s;
  }
  // Complex, BigNumber, fraction, unit, matrix -> let mathjs format.
  return math.format(v as any, { precision: 14 });
}

// ponytail: error code classification so tests can match on stable codes, not message text.
function classifyError(e: unknown): { error: string; code: string } {
  const msg = String((e as Error)?.message ?? e);
  if (/Unexpected end of expression/i.test(msg)) return { error: '表达式未闭合', code: 'UNCLOSED' };
  if (/Parenthesis/i.test(msg)) return { error: '括号不匹配', code: 'PAREN' };
  if (/Value expected/i.test(msg)) return { error: '缺少操作数', code: 'MISSING_OPERAND' };
  if (/Undefined symbol/i.test(msg)) return { error: `未知符号: ${msg.replace(/^.*:\s*/, '')}`, code: 'UNKNOWN_SYMBOL' };
  if (/is not a function/i.test(msg)) return { error: '函数未定义', code: 'NOT_FUNCTION' };
  if (/Cannot convert/i.test(msg)) return { error: '类型无法转换', code: 'CONVERT' };
  return { error: msg, code: 'ENGINE' };
}

function evaluate(expr: string, options?: EvalOptions): EvalResult {
  if (!expr || !expr.trim()) return { value: '' };
  const prev = mode;
  if (options?.angle) mode = options.angle;
  try {
    const result = math.evaluate(normalize(expr));
    if (result === undefined || result === null) return { value: '' };
    return { value: formatResult(result) };
  } catch (e) {
    return { value: '', error: classifyError(e).error };
  } finally {
    mode = prev;
  }
}

function setAngleMode(m: AngleMode): void {
  mode = m;
}
function getAngleMode(): AngleMode {
  return mode;
}

export const engine: Engine = { evaluate, setAngleMode, getAngleMode };
