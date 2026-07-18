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
  // Optional stable code (UNCLOSED/PAREN/MISSING_OPERAND/UNKNOWN_SYMBOL/NOT_FUNCTION/CONVERT/ENGINE).
  // UI can branch on code for typed error display; e2e asserts on it. Absent on success.
  errorCode?: string;
}
export interface Engine {
  evaluate(expr: string, options?: EvalOptions): EvalResult;
  setAngleMode(mode: AngleMode): void;
  getAngleMode(): AngleMode;
}

const math = create(all);
const D2R = Math.PI / 180;

// Options-only angle resolution: evaluate() pushes the resolved angle onto a
// re-entrant stack; trig overrides read the top. No module-level `mode` global
// that evaluate mutates -> no cross-call race. setAngleMode/getAngleMode only
// control the default used when options.angle is absent (evaluate never writes it).
// ponytail: stack is LIFO; single-threaded JS makes push/eval/pop atomic per call.
const angleStack: AngleMode[] = [];
let defaultAngle: AngleMode = 'deg';

function currentAngle(): AngleMode {
  return angleStack.length > 0 ? angleStack[angleStack.length - 1] : defaultAngle;
}

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
    sin: (x: number) => (currentAngle() === 'deg' ? _sin(x * D2R) : _sin(x)),
    cos: (x: number) => (currentAngle() === 'deg' ? _cos(x * D2R) : _cos(x)),
    tan: (x: number) => (currentAngle() === 'deg' ? _tan(x * D2R) : _tan(x)),
    asin: (x: number) => (currentAngle() === 'deg' ? _asin(x) / D2R : _asin(x)),
    acos: (x: number) => (currentAngle() === 'deg' ? _acos(x) / D2R : _acos(x)),
    atan: (x: number) => (currentAngle() === 'deg' ? _atan(x) / D2R : _atan(x)),
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
  if (/Undefined function|is not a function/i.test(msg)) return { error: '函数未定义', code: 'NOT_FUNCTION' };
  if (/Cannot convert/i.test(msg)) return { error: '类型无法转换', code: 'CONVERT' };
  return { error: msg, code: 'ENGINE' };
}

function evaluate(expr: string, options?: EvalOptions): EvalResult {
  if (!expr || !expr.trim()) return { value: '' };
  angleStack.push(options?.angle ?? defaultAngle);
  try {
    const result = math.evaluate(normalize(expr));
    if (result === undefined || result === null) return { value: '' };
    return { value: formatResult(result) };
  } catch (e) {
    const cls = classifyError(e);
    return { value: '', error: cls.error, errorCode: cls.code };
  } finally {
    angleStack.pop();
  }
}

function setAngleMode(m: AngleMode): void {
  defaultAngle = m;
}
function getAngleMode(): AngleMode {
  return defaultAngle;
}

export const engine: Engine = { evaluate, setAngleMode, getAngleMode };
