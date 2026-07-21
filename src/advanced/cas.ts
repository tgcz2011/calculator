// Advanced math (CAS) engine - pure logic, no React.
//
// Wraps mathjs 14's symbolic capabilities (derivative, simplify, rationalize,
// parse().toTex()) and fills the gaps mathjs doesn't ship (integrate, limit,
// solve, taylor, rref) with focused numeric / derivative-based methods so the
// 高等数学计算器 has real coverage. KaTeX renders results to HTML strings.
//
// What mathjs 14 actually ships (probed):
//   derivative, simplify, rationalize, parse().toTex()  -> CAS-native
//   det, inv, transpose, eigs, lusolve, lup, qr          -> matrix
//   and, or, not, xor, comparisons via evaluate          -> logic
//   NO integrate / solve / limit / taylor / rref          -> we implement below
//
// Error codes mirror engine's style so UI + e2e can branch:
//   SYNTAX / DOMAIN / DIV_ZERO / UNSUPPORTED / ENGINE

import { create, all, type MathNode } from 'mathjs';
import katex from 'katex';

// ponytail: separate math instance - no trig DEG/RAD overrides (pure mathjs),
// same pattern as src/units/engine.ts. Keeps the basic/scientific engine's
// instance untouched (locked contract).
const math = create(all);

export interface CasResult {
  ok: boolean;
  /** LaTeX for KaTeX rendering (display mode). */
  tex?: string;
  /** Plain-text / fallback result. */
  text?: string;
  error?: string;
  errorCode?: string;
  /** Soft note shown alongside a result (e.g. "符号不定积分暂不支持"). */
  note?: string;
}

function classifyError(e: unknown): { error: string; code: string } {
  const msg = String((e as Error)?.message ?? e);
  if (/Parenthesis|Unexpected end|Value expected|SyntaxError/i.test(msg)) return { error: '表达式语法错误', code: 'SYNTAX' };
  if (/Undefined function|is not a function/i.test(msg)) return { error: '函数未定义', code: 'SYNTAX' };
  if (/Undefined symbol/i.test(msg)) return { error: `未知符号: ${msg.replace(/^.*:\s*/, '')}`, code: 'SYNTAX' };
  if (/divide by zero|Division by zero/i.test(msg)) return { error: '除零错误', code: 'DIV_ZERO' };
  if (/Cannot convert|Number expected/i.test(msg)) return { error: '类型/定义域错误', code: 'DOMAIN' };
  return { error: msg, code: 'ENGINE' };
}

/** Render a LaTeX string to KaTeX HTML (display mode, no throw on error). */
export function renderKatex(tex: string, displayMode = true): string {
  try {
    return katex.renderToString(tex, { throwOnError: false, displayMode, strict: false });
  } catch {
    return '';
  }
}

/** Parse an expression and return its LaTeX. */
export function toTex(expr: string): CasResult {
  try {
    const node = math.parse(expr);
    return { ok: true, tex: nodeToTex(node), text: node.toString() };
  } catch (e) {
    const cls = classifyError(e);
    return { ok: false, error: cls.error, errorCode: cls.code };
  }
}

function nodeToTex(node: MathNode): string {
  // mathjs toTex sometimes wraps single symbols in braces like "{ x}"; cosmetic,
  // KaTeX renders fine, leave as-is.
  return node.toTex({ parenthesis: 'auto', implicit: 'hide' });
}

// --- simplify (sync) ---

/** Synchronous simplify with try/catch. Used as the worker fallback and by
 *  smoke tests. Returns the simplified LaTeX + text. */
export function simplifySync(expr: string): CasResult {
  // Guard against pathological inputs that could hang the heuristic simplifier.
  if (expr.length > 400) {
    return { ok: false, error: '表达式过长，无法化简', errorCode: 'DOMAIN' };
  }
  try {
    const simplified = math.simplify(expr);
    return { ok: true, tex: nodeToTex(simplified), text: simplified.toString() };
  } catch (e) {
    const cls = classifyError(e);
    return { ok: false, error: cls.error, errorCode: cls.code };
  }
}

// --- async simplify with 500ms timeout (Web Worker) ---
// Runs math.simplify in a module worker so a pathological input that would
// hang the heuristic simplifier can be preempted. On timeout we terminate the
// (possibly stuck) worker, recreate it next call, and fall back to the sync
// path. Environments without Worker (Node/smoke) use the sync path directly.

let workerSingleton: Worker | null = null;
let nextSimplifyId = 1;
const pendingSimplify = new Map<number, (r: CasResult) => void>();

function getSimplifyWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  if (workerSingleton) return workerSingleton;
  try {
    const w = new Worker(new URL('./simplifyWorker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent) => {
      const { id, ok, tex, text, error, errorCode } = e.data as {
        id: number; ok: boolean; tex?: string; text?: string; error?: string; errorCode?: string;
      };
      const resolve = pendingSimplify.get(id);
      if (resolve) {
        pendingSimplify.delete(id);
        resolve({ ok, tex, text, error, errorCode });
      }
    };
    w.onerror = () => {
      // Worker failed to load / errored - drop it so the next call recreates.
      workerSingleton = null;
    };
    workerSingleton = w;
    return w;
  } catch {
    return null;
  }
}

export async function simplifyAsync(expr: string, timeoutMs = 500): Promise<CasResult> {
  const worker = getSimplifyWorker();
  if (!worker) return simplifySync(expr);
  const id = nextSimplifyId++;
  return new Promise<CasResult>((resolve) => {
    const timer = setTimeout(() => {
      pendingSimplify.delete(id);
      // Terminate the possibly-hung worker; next call recreates a fresh one.
      worker.terminate();
      workerSingleton = null;
      resolve(simplifySync(expr));
    }, timeoutMs);
    pendingSimplify.set(id, (r) => {
      clearTimeout(timer);
      resolve(r);
    });
    worker.postMessage({ id, expr });
  });
}

// --- derivative (CAS) ---

/** Compute the n-th derivative as a mathjs node (no simplification). */
export function derivativeNode(expr: string, variable: string, order: number): { ok: boolean; node?: MathNode; error?: string; errorCode?: string } {
  if (order < 1) return { ok: false, error: '求导阶数须 ≥ 1', errorCode: 'DOMAIN' };
  if (order > 10) return { ok: false, error: '求导阶数过大（≤ 10）', errorCode: 'DOMAIN' };
  try {
    let deriv: MathNode = math.parse(expr);
    for (let i = 0; i < order; i++) {
      deriv = math.derivative(deriv, variable);
    }
    return { ok: true, node: deriv };
  } catch (e) {
    const cls = classifyError(e);
    return { ok: false, error: cls.error, errorCode: cls.code };
  }
}

export function derivative(expr: string, variable: string, order: number): CasResult {
  const dn = derivativeNode(expr, variable, order);
  if (!dn.ok || !dn.node) return { ok: false, error: dn.error, errorCode: dn.errorCode };
  // Best-effort sync simplify; fall back to the raw derivative on failure.
  let simplified: MathNode = dn.node;
  try {
    if (dn.node.toString().length <= 400) simplified = math.simplify(dn.node);
  } catch {
    simplified = dn.node;
  }
  return { ok: true, tex: nodeToTex(simplified), text: simplified.toString() };
}

/** Async derivative that simplifies the result via the 500ms-timeout worker
 *  path (spec: simplify 加 500ms timeout 兜底). Falls back to the raw
 *  derivative if simplify times out or fails. */
export async function derivativeAsync(expr: string, variable: string, order: number): Promise<CasResult> {
  const dn = derivativeNode(expr, variable, order);
  if (!dn.ok || !dn.node) return { ok: false, error: dn.error, errorCode: dn.errorCode };
  const raw = dn.node;
  const simplified = await simplifyAsync(raw.toString());
  if (simplified.ok) return { ok: true, tex: simplified.tex, text: simplified.text };
  return { ok: true, tex: nodeToTex(raw), text: raw.toString() };
}

// --- Taylor series (CAS via repeated derivative) ---
// T_n(x) = sum_{k=0}^{n} f^(k)(a) / k! * (x - a)^k
// Coefficients are numeric (f^(k)(a) evaluated at the point); the result is a
// polynomial in (x - a), rendered as LaTeX.

export function taylorSeries(expr: string, variable: string, point: number, order: number): CasResult {
  if (order < 1) return { ok: false, error: '阶数须 ≥ 1', errorCode: 'DOMAIN' };
  if (order > 20) return { ok: false, error: '阶数过大（≤ 20）', errorCode: 'DOMAIN' };
  try {
    let deriv: MathNode = math.parse(expr);
    const scope: Record<string, number> = { [variable]: point };
    const terms: string[] = [];
    let factorial = 1;
    for (let k = 0; k <= order; k++) {
      if (k > 0) factorial *= k;
      let coeff: number;
      try {
        const v = deriv.compile().evaluate(scope);
        coeff = Number(v);
      } catch {
        return { ok: false, error: `在 x = ${point} 处第 ${k} 阶导数无法求值`, errorCode: 'DOMAIN' };
      }
      if (!Number.isFinite(coeff)) {
        return { ok: false, error: `在 x = ${point} 处不可展开（导数不存在）`, errorCode: 'DOMAIN' };
      }
      const c = coeff / factorial;
      if (Math.abs(c) < 1e-15) {
        if (k === 0) terms.push('0');
        // skip near-zero higher terms
      } else {
        const varPart = k === 0
          ? ''
          : k === 1
            ? (point === 0 ? variable : `(${variable} - ${formatNum(point)})`)
            : (point === 0 ? `${variable}^${k}` : `(${variable} - ${formatNum(point)})^${k}`);
        terms.push(varPart ? `${formatCoeff(c)} * ${varPart}` : `${formatCoeff(c)}`);
      }
      if (k < order) deriv = math.derivative(deriv, variable);
    }
    const polyStr = terms.length ? terms.join(' + ').replace(/\+ -/g, '- ') : '0';
    const node = math.parse(polyStr);
    return {
      ok: true,
      tex: nodeToTex(node),
      text: polyStr,
      note: `${order} 阶泰勒展开（在 x = ${formatNum(point)} 处）`,
    };
  } catch (e) {
    const cls = classifyError(e);
    return { ok: false, error: cls.error, errorCode: cls.code };
  }
}

function formatNum(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 1e10) / 1e10);
}

function formatCoeff(c: number): string {
  if (Number.isInteger(c)) return String(c);
  return String(Math.round(c * 1e12) / 1e12);
}

// --- numeric root finding (解方程) ---
// Split the equation on '=' (if present), form h(x) = LHS - RHS, sample the
// search range, and refine sign-change brackets by bisection. Returns real
// roots found in the range.

export function numericRoots(equation: string, variable: string, lo: number, hi: number): CasResult {
  if (lo >= hi) return { ok: false, error: '搜索范围无效（下界须小于上界）', errorCode: 'DOMAIN' };
  let hExpr: string;
  const eqIdx = equation.indexOf('=');
  if (eqIdx >= 0) {
    const lhs = equation.slice(0, eqIdx).trim();
    const rhs = equation.slice(eqIdx + 1).trim();
    hExpr = `(${lhs}) - (${rhs})`;
  } else {
    hExpr = equation.trim();
  }
  if (!hExpr) return { ok: false, error: '表达式为空', errorCode: 'SYNTAX' };

  let compiled: ReturnType<MathNode['compile']>;
  try {
    compiled = math.parse(hExpr).compile();
  } catch (e) {
    const cls = classifyError(e);
    return { ok: false, error: cls.error, errorCode: cls.code };
  }

  const evalH = (x: number): number => {
    try {
      const v = compiled.evaluate({ [variable]: x });
      const n = Number(v);
      return Number.isFinite(n) ? n : NaN;
    } catch {
      return NaN;
    }
  };

  const N = 500;
  const step = (hi - lo) / N;
  const roots: number[] = [];
  let prevX = lo;
  let prevY = evalH(prevX);

  for (let i = 1; i <= N; i++) {
    const x = lo + i * step;
    const y = evalH(x);
    if (Number.isNaN(prevY) || Number.isNaN(y)) {
      prevX = x;
      prevY = y;
      continue;
    }
    // Exact zero at sample point.
    if (Math.abs(y) < 1e-12 && !roots.some((r) => Math.abs(r - x) < 1e-6)) {
      roots.push(x);
    }
    // Sign change -> bisect.
    if (prevY !== 0 && (prevY < 0) !== (y < 0)) {
      const root = bisect(evalH, prevX, x);
      if (Number.isFinite(root) && !roots.some((r) => Math.abs(r - root) < 1e-6)) {
        roots.push(root);
      }
    }
    prevX = x;
    prevY = y;
    if (roots.length >= 50) break;
  }

  roots.sort((a, b) => a - b);
  if (roots.length === 0) {
    return {
      ok: true,
      tex: '\\text{在 } [' + formatNum(lo) + ',\\ ' + formatNum(hi) + '] \\text{ 内未找到实根}',
      text: '未找到实根',
      note: '数值求根（范围内采样 + 二分）。可能无实根，或根在范围外。',
    };
  }
  const tex = roots.map((r) => formatNum(Math.round(r * 1e10) / 1e10)).map((r) => `${variable} = ${r}`).join(',\\quad ');
  return {
    ok: true,
    tex,
    text: roots.map((r) => `${variable} = ${formatNum(Math.round(r * 1e10) / 1e10)}`).join(', '),
    note: `数值求根（${roots.length} 个，范围 [${formatNum(lo)}, ${formatNum(hi)}]）`,
  };
}

function bisect(f: (x: number) => number, a: number, b: number, iter = 100): number {
  let fa = f(a);
  let fb = f(b);
  if (Number.isNaN(fa) || Number.isNaN(fb)) return NaN;
  let lo = a;
  let hi = b;
  for (let i = 0; i < iter; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (Number.isNaN(fm)) return NaN;
    if (Math.abs(fm) < 1e-14 || (hi - lo) / 2 < 1e-14) return mid;
    if ((fa < 0) !== (fm < 0)) {
      hi = mid;
      fb = fm;
    } else {
      lo = mid;
      fa = fm;
    }
  }
  return (lo + hi) / 2;
}

// --- numeric definite integral (积分) ---
// Composite Simpson's rule. mathjs has no symbolic integrate; we mark the
// symbolic antiderivative as 暂不支持 and provide numeric definite integration.

export function numericIntegral(expr: string, variable: string, a: number, b: number): CasResult {
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return { ok: false, error: '积分上下限须为有限数', errorCode: 'DOMAIN' };
  }
  let compiled: ReturnType<MathNode['compile']>;
  try {
    compiled = math.parse(expr).compile();
  } catch (e) {
    const cls = classifyError(e);
    return { ok: false, error: cls.error, errorCode: cls.code };
  }
  const f = (x: number): number => {
    try {
      const v = compiled.evaluate({ [variable]: x });
      const n = Number(v);
      return Number.isFinite(n) ? n : NaN;
    } catch {
      return NaN;
    }
  };
  const N = 1000; // must be even
  const h = (b - a) / N;
  let sum = 0;
  let hasNaN = false;
  for (let i = 0; i <= N; i++) {
    const x = a + i * h;
    const y = f(x);
    if (Number.isNaN(y)) {
      hasNaN = true;
      break;
    }
    const w = i === 0 || i === N ? 1 : i % 2 === 0 ? 2 : 4;
    sum += w * y;
  }
  if (hasNaN) {
    return { ok: false, error: '积分区间内函数不可积（含未定义点）', errorCode: 'DOMAIN' };
  }
  const result = (h / 3) * sum;
  const valStr = formatCoeff(Math.round(result * 1e10) / 1e10);
  const tex = `\\int_{${formatNum(a)}}^{${formatNum(b)}} ${math.parse(expr).toTex()} \\, d${variable} \\approx ${valStr}`;
  return {
    ok: true,
    tex,
    text: valStr,
    note: '数值定积分（Simpson 公式，1000 区间）。符号不定积分暂不支持。',
  };
}

// --- numeric limit (极限) ---
// Approach the point from both sides with shrinking epsilon; for ±infinity use
// growing magnitudes. Returns the converged value or marks divergence.

export function numericLimit(
  expr: string,
  variable: string,
  point: number | 'inf' | '-inf',
): CasResult {
  let compiled: ReturnType<MathNode['compile']>;
  try {
    compiled = math.parse(expr).compile();
  } catch (e) {
    const cls = classifyError(e);
    return { ok: false, error: cls.error, errorCode: cls.code };
  }
  const f = (x: number): number => {
    try {
      const v = compiled.evaluate({ [variable]: x });
      const n = Number(v);
      return Number.isFinite(n) ? n : NaN;
    } catch {
      return NaN;
    }
  };

  const epsilons = [1e-2, 1e-3, 1e-4, 1e-5, 1e-6, 1e-7, 1e-8];
  const samples: number[] = [];

  if (point === 'inf' || point === '-inf') {
    const sign = point === 'inf' ? 1 : -1;
    for (const m of [1e2, 1e3, 1e4, 1e5, 1e6, 1e8, 1e10]) {
      const y = f(sign * m);
      if (Number.isFinite(y)) samples.push(y);
    }
    return converge(samples, expr, variable, point);
  }

  // Finite point: two-sided.
  const left: number[] = [];
  const right: number[] = [];
  for (const eps of epsilons) {
    const yr = f(point + eps);
    const yl = f(point - eps);
    if (Number.isFinite(yr)) right.push(yr);
    if (Number.isFinite(yl)) left.push(yl);
  }
  if (right.length === 0 && left.length === 0) {
    return { ok: false, error: '无法求极限（函数在附近无定义）', errorCode: 'DOMAIN' };
  }
  const convR = convergeValues(right);
  const convL = convergeValues(left);
  if (convR === null || convL === null) {
    return { ok: false, error: '极限发散或不存在', errorCode: 'DOMAIN' };
  }
  if (Math.abs(convR - convL) > 1e-4) {
    return {
      ok: false,
      error: `左右极限不相等（左 ${formatCoeff(convL)}，右 ${formatCoeff(convR)}），极限不存在`,
      errorCode: 'DOMAIN',
    };
  }
  const val = (convR + convL) / 2;
  // Here `point` is already narrowed to `number` (the inf branch returned above).
  const pointTex = formatNum(point);
  const tex = `\\lim_{${variable} \\to ${pointTex}} ${math.parse(expr).toTex()} = ${formatCoeff(val)}`;
  return { ok: true, tex, text: formatCoeff(val), note: '数值极限（双侧逼近）' };
}

function converge(
  samples: number[],
  expr: string,
  variable: string,
  point: number | 'inf' | '-inf',
): CasResult {
  const conv = convergeValues(samples);
  if (conv === null) {
    return { ok: false, error: '极限发散或不存在', errorCode: 'DOMAIN' };
  }
  const pointTex = point === 'inf' ? '\\infty' : point === '-inf' ? '-\\infty' : formatNum(point);
  const tex = `\\lim_{${variable} \\to ${pointTex}} ${math.parse(expr).toTex()} = ${formatCoeff(conv)}`;
  return { ok: true, tex, text: formatCoeff(conv), note: '数值极限' };
}

// Returns the converged value if the last few samples agree, else null.
function convergeValues(samples: number[]): number | null {
  if (samples.length < 2) return samples[0] ?? null;
  const last = samples[samples.length - 1];
  const prev = samples[samples.length - 2];
  if (!Number.isFinite(last) || !Number.isFinite(prev)) return null;
  // Relative tolerance for convergence.
  const scale = Math.max(Math.abs(last), Math.abs(prev), 1);
  if (Math.abs(last - prev) / scale > 1e-3) {
    // Not yet converged - but if magnitude is growing without bound, divergent.
    if (Math.abs(last) > Math.abs(prev) * 10 && Math.abs(last) > 1e6) return null;
    return last; // best estimate despite not fully converged
  }
  return last;
}

// --- matrix operations (矩阵) ---

export type MatrixOp = 'det' | 'inv' | 'transpose' | 'trace' | 'eigs' | 'rref' | 'solve';

export interface MatrixResult extends CasResult {
  /** For ops returning a matrix (inv/transpose/rref/solve). */
  matrix?: number[][];
  /** For scalar ops (det/trace). */
  scalar?: number;
  /** For eigs. */
  eigenvalues?: number[];
  eigenvectors?: { value: number; vector: number[] }[];
}

/** Parse a matrix from a textarea string. Rows separated by `;` or newline,
 *  elements by whitespace or comma. e.g. `1 2; 3 4` or `1, 2\n3, 4`. */
export function parseMatrix(input: string): { ok: boolean; matrix?: number[][]; error?: string; errorCode?: string } {
  const rows = input
    .split(/[;\n]/)
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
  if (rows.length === 0) return { ok: false, error: '矩阵为空', errorCode: 'SYNTAX' };
  const matrix: number[][] = [];
  let cols = -1;
  for (const row of rows) {
    const parts = row.split(/[\s,]+/).filter((p) => p.length > 0);
    if (cols === -1) cols = parts.length;
    else if (parts.length !== cols) {
      return { ok: false, error: '矩阵各行长度不一致', errorCode: 'SYNTAX' };
    }
    const nums = parts.map(Number);
    if (nums.some((n) => !Number.isFinite(n))) {
      return { ok: false, error: '矩阵包含非数字元素', errorCode: 'SYNTAX' };
    }
    matrix.push(nums);
  }
  return { ok: true, matrix };
}

export function matrixToTex(m: number[][]): string {
  const body = m.map((row) => row.map((v) => formatCoeff(v)).join(' & ')).join(' \\\\ ');
  return `\\begin{bmatrix} ${body} \\end{bmatrix}`;
}

export function matrixOperation(op: MatrixOp, input: string, bInput?: string): MatrixResult {
  const parsed = parseMatrix(input);
  if (!parsed.ok || !parsed.matrix) {
    return { ok: false, error: parsed.error, errorCode: parsed.errorCode };
  }
  const A = parsed.matrix;
  try {
    switch (op) {
      case 'det': {
        if (A.length !== A[0].length) return { ok: false, error: '行列式要求方阵', errorCode: 'DOMAIN' };
        const d = math.det(A);
        return { ok: true, scalar: Number(d), tex: `\\det ${matrixToTex(A)} = ${formatCoeff(Number(d))}`, text: formatCoeff(Number(d)) };
      }
      case 'inv': {
        if (A.length !== A[0].length) return { ok: false, error: '逆矩阵要求方阵', errorCode: 'DOMAIN' };
        const inv = math.inv(A) as number[][];
        const m = normalizeMatrix(inv);
        return { ok: true, matrix: m, tex: `${matrixToTex(A)}^{-1} = ${matrixToTex(m)}`, text: matrixToString(m) };
      }
      case 'transpose': {
        const t = math.transpose(A) as number[][];
        const m = normalizeMatrix(t);
        return { ok: true, matrix: m, tex: `${matrixToTex(A)}^{T} = ${matrixToTex(m)}`, text: matrixToString(m) };
      }
      case 'trace': {
        if (A.length !== A[0].length) return { ok: false, error: '迹要求方阵', errorCode: 'DOMAIN' };
        const tr = A.reduce((s, row, i) => s + row[i], 0);
        return { ok: true, scalar: tr, tex: `\\mathrm{tr}\\, ${matrixToTex(A)} = ${formatCoeff(tr)}`, text: formatCoeff(tr) };
      }
      case 'eigs': {
        if (A.length !== A[0].length) return { ok: false, error: '特征值要求方阵', errorCode: 'DOMAIN' };
        const e = math.eigs(A);
        const values = (e.values as unknown as number[]).map(Number);
        const vectors = (e.eigenvectors as { value: number; vector: number[] }[]).map((ev) => ({
          value: Number(ev.value),
          vector: ev.vector.map(Number),
        }));
        const valTex = values.map((v) => formatCoeff(v)).join(',\\ ');
        return {
          ok: true,
          eigenvalues: values,
          eigenvectors: vectors,
          tex: `\\lambda = ${valTex}`,
          text: values.map((v) => formatCoeff(v)).join(', '),
          note: '特征值与特征向量',
        };
      }
      case 'rref': {
        const r = rrefMatrix(A);
        return { ok: true, matrix: r, tex: `\\mathrm{rref}\\, ${matrixToTex(A)} = ${matrixToTex(r)}`, text: matrixToString(r) };
      }
      case 'solve': {
        // Ax = b; b from bInput (vector, one row).
        if (!bInput) return { ok: false, error: '请输入右端向量 b', errorCode: 'SYNTAX' };
        const bp = parseMatrix(bInput);
        if (!bp.ok || !bp.matrix) return { ok: false, error: '右端向量 b 格式错误', errorCode: 'SYNTAX' };
        const b = bp.matrix.map((row) => row[0]);
        if (A.length !== A[0].length) return { ok: false, error: '求解要求方阵', errorCode: 'DOMAIN' };
        const x = math.lusolve(A, b) as number[][];
        const m = normalizeMatrix(x);
        return { ok: true, matrix: m, tex: `${matrixToTex(A)} x = ${matrixToTex(bp.matrix)} \\Rightarrow x = ${matrixToTex(m)}`, text: matrixToString(m) };
      }
    }
  } catch (e) {
    const cls = classifyError(e);
    return { ok: false, error: cls.error, errorCode: cls.code };
  }
}

function normalizeMatrix(m: unknown): number[][] {
  // mathjs may return a Matrix object or nested array; coerce to number[][].
  const arr = (m as { toArray?: () => unknown[] }).toArray ? (m as { toArray: () => unknown[] }).toArray() : m;
  return (arr as unknown[]).map((row) => {
    const r = (row as { toArray?: () => unknown[] }).toArray ? (row as { toArray: () => unknown[] }).toArray() : row;
    return (r as unknown[]).map(Number);
  });
}

function matrixToString(m: number[][]): string {
  return m.map((row) => row.map((v) => formatCoeff(v)).join(' ')).join('; ');
}

// Rational Gaussian elimination to RREF (exact for rational inputs would need
// fractions; float is fine for display purposes here).
function rrefMatrix(A: number[][]): number[][] {
  const R = A.map((row) => row.slice());
  const rows = R.length;
  const cols = R[0].length;
  let r = 0;
  for (let c = 0; c < cols && r < rows; c++) {
    let piv = -1;
    for (let i = r; i < rows; i++) {
      if (Math.abs(R[i][c]) > 1e-12) {
        piv = i;
        break;
      }
    }
    if (piv === -1) continue;
    [R[r], R[piv]] = [R[piv], R[r]];
    const pv = R[r][c];
    for (let j = 0; j < cols; j++) R[r][j] /= pv;
    for (let i = 0; i < rows; i++) {
      if (i === r) continue;
      const f = R[i][c];
      if (Math.abs(f) < 1e-15) continue;
      for (let j = 0; j < cols; j++) R[i][j] -= f * R[r][j];
    }
    r++;
  }
  // Snap tiny floats to 0 for clean display.
  return R.map((row) => row.map((v) => (Math.abs(v) < 1e-10 ? 0 : Math.round(v * 1e10) / 1e10)));
}

// --- boolean logic (逻辑) ---

export interface TruthTable {
  ok: boolean;
  variables: string[];
  rows: { assignment: Record<string, boolean>; result: boolean }[];
  error?: string;
  errorCode?: string;
  /** LaTeX rendering of the expression. */
  tex?: string;
}

const LOGIC_KEYWORDS = new Set(['true', 'false', 'and', 'or', 'not', 'xor', 'True', 'False']);

/** Extract variable names (free symbols) from a boolean expression. */
export function extractVariables(expr: string): string[] {
  const node = math.parse(expr);
  const found = new Set<string>();
  node.traverse((n: MathNode) => {
    if (n.type === 'SymbolNode') {
      const name = (n as unknown as { name: string }).name;
      if (!LOGIC_KEYWORDS.has(name)) found.add(name);
    }
  });
  return Array.from(found).sort();
}

export function truthTable(expr: string): TruthTable {
  let node: MathNode;
  try {
    node = math.parse(expr);
  } catch (e) {
    const cls = classifyError(e);
    return { ok: false, variables: [], rows: [], error: cls.error, errorCode: cls.code };
  }
  const variables = extractVariables(expr);
  if (variables.length > 8) {
    return { ok: false, variables: [], rows: [], error: '变量过多（≤ 8）', errorCode: 'DOMAIN' };
  }
  const compiled = node.compile();
  const rows: TruthTable['rows'] = [];
  const n = variables.length;
  const combos = 1 << n;
  for (let mask = 0; mask < combos; mask++) {
    const assignment: Record<string, boolean> = {};
    for (let i = 0; i < n; i++) {
      assignment[variables[i]] = Boolean((mask >> (n - 1 - i)) & 1);
    }
    let result: boolean;
    try {
      const v = compiled.evaluate(assignment);
      result = Boolean(v);
    } catch (e) {
      const cls = classifyError(e);
      return { ok: false, variables, rows: [], error: cls.error, errorCode: cls.code };
    }
    rows.push({ assignment, result });
  }
  return { ok: true, variables, rows, tex: nodeToTex(node) };
}
