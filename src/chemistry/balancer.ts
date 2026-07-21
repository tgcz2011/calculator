// Chemical equation balancer - pure logic module (no React, no DOM).
//
// Scheme A (pure text input). Accepts reactions like:
//   H2 + O2 -> H2O
//   Ca(OH)2 + 2 HCl = CaCl2 + 2 H2O
//   Fe2+ + Cu -> Fe + Cu2+
//   CuSO4·5H2O -> CuSO4 + 5 H2O
//
// Supports: parentheses/groups `Ca(OH)2`, hydrates `CuSO4·5H2O` (· ⋅ ∙ .),
// ion charges (`Fe2+`, `SO4^2-`, `Na+`, `Cl-`), arrows (`->` `=>` `=` `⟶` `⇌`
// `↔` `<->` `<=>`). Compound separators are ` + ` (a plus preceded by
// whitespace) so charge signs (`Fe2+`) are never mistaken for separators.
//
// Algorithm: build the element/charge conservation matrix A (reactants
// positive, products negative) and solve A·x = 0 for the smallest positive
// integer coefficient vector x. We use EXACT rational RREF (fractions of
// integers, gcd-reduced) rather than floating-point null-space + snapping -
// float rounding mis-snaps on redox reactions with larger coefficients, while
// rational arithmetic is bulletproof for the small integer counts chemistry
// produces. For a well-formed single reaction the null space is 1-dimensional;
// we set the free variable to 1, read off the pivot variables, then clear
// denominators (LCM) and divide by the GCD.
//
// Error codes (mirroring engine's classifyError style so UI can branch):
//   EMPTY       - no input
//   SYNTAX      - missing arrow / empty side / unparseable formula
//   NO_SOLUTION - elements don't balance (nullity 0) or a compound gets coeff 0
//   AMBIGUOUS   - null space > 1-dimensional (multiple independent reactions)

// --- Rational arithmetic (exact) ---
// A fraction is [num, den] with den > 0 and gcd(|num|, den) == 1. [0,0] is a
// sentinel for "undefined" (division by zero) - we never produce it from valid
// input but guard anyway.
type Frac = [number, number];

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a || 1;
}

function lcm(a: number, b: number): number {
  if (!a || !b) return 0;
  return Math.abs(a * b) / gcd(a, b);
}

function mkFrac(n: number, d: number = 1): Frac {
  if (d === 0) return [0, 0];
  if (d < 0) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d) || 1;
  return [n / g, d / g];
}

function fsub(a: Frac, b: Frac): Frac {
  return mkFrac(a[0] * b[1] - b[0] * a[1], a[1] * b[1]);
}
function fmul(a: Frac, b: Frac): Frac {
  return mkFrac(a[0] * b[0], a[1] * b[1]);
}
function fdiv(a: Frac, b: Frac): Frac {
  return mkFrac(a[0] * b[1], a[1] * b[0]);
}
function fneg(a: Frac): Frac {
  return [-a[0], a[1]];
}
function fiszero(a: Frac): boolean {
  return a[0] === 0;
}

// --- RREF over rationals ---
function rref(mat: Frac[][]): { R: Frac[][]; pivotCols: number[] } {
  const R = mat.map((row) => row.slice());
  const rows = R.length;
  const cols = R[0]?.length ?? 0;
  const pivotCols: number[] = [];
  let r = 0;
  for (let c = 0; c < cols && r < rows; c++) {
    // Find a non-zero pivot in column c at or below row r.
    let piv = -1;
    for (let i = r; i < rows; i++) {
      if (!fiszero(R[i][c])) {
        piv = i;
        break;
      }
    }
    if (piv === -1) continue;
    [R[r], R[piv]] = [R[piv], R[r]];
    const pv = R[r][c];
    if (fiszero(pv)) continue;
    for (let j = 0; j < cols; j++) R[r][j] = fdiv(R[r][j], pv);
    for (let i = 0; i < rows; i++) {
      if (i === r) continue;
      const factor = R[i][c];
      if (fiszero(factor)) continue;
      for (let j = 0; j < cols; j++) R[i][j] = fsub(R[i][j], fmul(factor, R[r][j]));
    }
    pivotCols.push(c);
    r++;
  }
  return { R, pivotCols };
}

// Returns the 1-dim null-space basis vector (with the free var set to 1), or
// null if nullity != 1.
function nullSpaceBasis1(R: Frac[][], pivotCols: number[], n: number): Frac[] | null {
  const pivotSet = new Set(pivotCols);
  const freeCols: number[] = [];
  for (let c = 0; c < n; c++) if (!pivotSet.has(c)) freeCols.push(c);
  if (freeCols.length !== 1) return null;
  const f = freeCols[0];
  const x: Frac[] = new Array(n);
  for (let i = 0; i < n; i++) x[i] = mkFrac(0);
  x[f] = mkFrac(1);
  // Each pivot row i owns pivot column pivotCols[i]; in RREF the pivot is 1
  // and the rest of that column is 0, so x[p] = -R[i][f] * x[f] = -R[i][f].
  for (let i = 0; i < pivotCols.length; i++) {
    const p = pivotCols[i];
    x[p] = fneg(R[i][f]);
  }
  return x;
}

// Scale a rational basis vector to the smallest positive integer vector.
// Returns null if the signs are mixed (reaction not balanceable as written)
// or any coefficient is zero (a listed compound doesn't participate).
function scaleToInts(x: Frac[]): number[] | null {
  let l = 1;
  for (const f of x) l = lcm(l, f[1]);
  if (!l) return null;
  const nums = x.map((f) => (f[0] * l) / f[1]);
  let g = 0;
  for (const v of nums) g = gcd(g, Math.abs(v));
  if (!g) g = 1;
  let ints = nums.map((v) => v / g);
  const pos = ints.filter((v) => v > 0).length;
  const neg = ints.filter((v) => v < 0).length;
  if (pos > 0 && neg > 0) return null;
  if (neg > 0) ints = ints.map((v) => -v);
  if (ints.some((v) => v === 0)) return null;
  return ints;
}

// --- Formula parsing ---

interface ParsedCompound {
  /** Core formula (no leading coefficient, no charge), e.g. "SO4". */
  formula: string;
  /** Core + charge suffix for display, e.g. "SO4^2-". */
  displayFormula: string;
  /** Element -> atom count. */
  elements: Map<string, number>;
  /** Net charge (0 for neutral). */
  charge: number;
  /** Original trimmed token. */
  raw: string;
}

function chargeStr(c: number): string {
  if (c === 0) return '';
  const sign = c > 0 ? '+' : '-';
  const m = Math.abs(c);
  // mag 1 -> bare sign ("Na+", "Cl-"); else caret form ("Fe^2+", "SO4^2-")
  // so multi-digit charges never collide with atom subscripts.
  return m === 1 ? sign : `^${m}${sign}`;
}

/**
 * Parse one compound token into its formula, element counts, and charge.
 * Leading integer coefficient (if any) is stripped - balancing recomputes
 * coefficients, so user-provided ones are ignored.
 */
function parseCompound(token: string): ParsedCompound {
  let s = token.trim();
  // Strip leading coefficient: optional digits + optional space.
  const lead = s.match(/^(\d+)\s*(.*)$/);
  if (lead) s = lead[2];
  // Strip trailing charge: ^?(\d*)(+|-)$
  let charge = 0;
  const chg = s.match(/(\^?)(\d*)([+-])$/);
  if (chg) {
    const mag = chg[2] ? parseInt(chg[2], 10) : 1;
    charge = chg[3] === '+' ? mag : -mag;
    s = s.slice(0, s.length - chg[0].length);
  }
  const core = s.trim();
  const elements = parseFormula(core);
  return {
    formula: core,
    displayFormula: core + chargeStr(charge),
    elements,
    charge,
    raw: token.trim(),
  };
}

/**
 * Parse a formula (no charge, no leading coefficient) into element counts.
 * Splits on hydrate separators first, then recurses into parentheses.
 */
function parseFormula(s: string): Map<string, number> {
  const total = new Map<string, number>();
  const parts = s.split(/[·⋅∙.]/).map((p) => p.trim()).filter((p) => p.length > 0);
  for (const part of parts) {
    // Each hydrate part may carry its own leading multiplier (e.g. "5H2O").
    const m = part.match(/^(\d+)(.*)$/);
    const mult = m ? parseInt(m[1], 10) : 1;
    const body = m ? m[2] : part;
    const sub = parseGroup(body);
    for (const [el, c] of sub) total.set(el, (total.get(el) || 0) + c * mult);
  }
  return total;
}

/** Recursively parse element symbols, counts, and parenthesized groups. */
function parseGroup(s: string): Map<string, number> {
  const counts = new Map<string, number>();
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '(' || ch === '[') {
      const close = ch === '(' ? ')' : ']';
      let depth = 1;
      let j = i + 1;
      while (j < s.length && depth > 0) {
        if (s[j] === ch) depth++;
        else if (s[j] === close) {
          depth--;
          if (depth === 0) break;
        }
        j++;
      }
      const inner = s.slice(i + 1, j);
      let k = j + 1;
      let numStr = '';
      while (k < s.length && /[0-9]/.test(s[k])) {
        numStr += s[k];
        k++;
      }
      const mult = numStr ? parseInt(numStr, 10) : 1;
      const sub = parseGroup(inner);
      for (const [el, c] of sub) counts.set(el, (counts.get(el) || 0) + c * mult);
      i = k;
    } else if (/[A-Z]/.test(ch)) {
      let el = ch;
      let j = i + 1;
      while (j < s.length && /[a-z]/.test(s[j])) {
        el += s[j];
        j++;
      }
      let numStr = '';
      while (j < s.length && /[0-9]/.test(s[j])) {
        numStr += s[j];
        j++;
      }
      const mult = numStr ? parseInt(numStr, 10) : 1;
      counts.set(el, (counts.get(el) || 0) + mult);
      i = j;
    } else {
      // Whitespace, phase markers inside parens (s/l/g/aq), or any other
      // stray char - skip. Phase markers contribute zero atoms naturally
      // because they're lowercase-only and won't match an element symbol.
      i++;
    }
  }
  return counts;
}

// --- Reaction splitting ---

const ARROW_RE = /(?:<->|<=>|->|=>|⟶|⇌|↔|=)/;

function normalizeArrow(a: string): string {
  if (a === '=') return '=';
  return '->';
}

/** Split a side into compound tokens on `+` preceded by whitespace.
 *  This keeps charge signs (`Fe2+`, `Na+`) intact - a charge `+` is never
 *  preceded by whitespace, only compound separators are. */
function splitCompounds(side: string): string[] {
  return side
    .split(/\s+\+\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// --- Public API ---

export interface BalancedCompound {
  coefficient: number;
  displayFormula: string;
  isReactant: boolean;
  elements: Record<string, number>;
  charge: number;
}

export interface ConservationRow {
  element: string;
  reactants: number;
  products: number;
  balanced: boolean;
}

export interface BalanceResult {
  ok: boolean;
  error?: string;
  errorCode?: string;
  compounds?: BalancedCompound[];
  equation?: string;
  arrow?: string;
  conservation?: ConservationRow[];
  chargeBalance?: { reactants: number; products: number; balanced: boolean } | null;
}

function coeffPrefix(n: number): string {
  return n === 1 ? '' : `${n} `;
}

export function balanceReaction(input: string): BalanceResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: '请输入化学方程式', errorCode: 'EMPTY' };

  const m = trimmed.match(ARROW_RE);
  if (!m || m.index === undefined) {
    return { ok: false, error: '缺少反应箭头（使用 -> 、 => 或 =）', errorCode: 'SYNTAX' };
  }
  const left = trimmed.slice(0, m.index).trim();
  const right = trimmed.slice(m.index + m[0].length).trim();
  if (!left || !right) {
    return { ok: false, error: '反应式左右两边不能为空', errorCode: 'SYNTAX' };
  }

  const reactantTokens = splitCompounds(left);
  const productTokens = splitCompounds(right);
  if (reactantTokens.length === 0 || productTokens.length === 0) {
    return { ok: false, error: '反应式左右两边不能为空', errorCode: 'SYNTAX' };
  }

  let reactants: ParsedCompound[];
  let products: ParsedCompound[];
  try {
    reactants = reactantTokens.map(parseCompound);
    products = productTokens.map(parseCompound);
  } catch {
    return { ok: false, error: '化学式解析失败，请检查拼写', errorCode: 'SYNTAX' };
  }

  // Reject compounds that parsed to no elements (e.g. a bare "+" or "()").
  const allCompounds = [...reactants, ...products];
  if (allCompounds.some((c) => c.elements.size === 0 && c.charge === 0)) {
    return { ok: false, error: '存在无法识别的化学式', errorCode: 'SYNTAX' };
  }

  // Collect element symbols (sorted for stable table order) and decide whether
  // a charge-balance row is needed.
  const elemSet = new Set<string>();
  for (const c of allCompounds) for (const el of c.elements.keys()) elemSet.add(el);
  const elements = Array.from(elemSet).sort();
  const hasCharge = allCompounds.some((c) => c.charge !== 0);

  const rowLabels: string[] = [...elements];
  if (hasCharge) rowLabels.push('__charge__');
  const n = allCompounds.length;

  // Build A: reactants positive, products negative.
  const A: Frac[][] = rowLabels.map((label) =>
    allCompounds.map((c, j) => {
      let v: number;
      if (label === '__charge__') v = c.charge;
      else v = c.elements.get(label) || 0;
      if (j >= reactants.length) v = -v;
      return mkFrac(v);
    }),
  );

  const { R, pivotCols } = rref(A);
  const basis = nullSpaceBasis1(R, pivotCols, n);

  if (!basis) {
    const nullity = n - pivotCols.length;
    if (nullity === 0) {
      return {
        ok: false,
        error: '无法配平：元素不守恒，请检查化学式',
        errorCode: 'NO_SOLUTION',
      };
    }
    return {
      ok: false,
      error: '该反应无法唯一配平（可能混入了多个独立反应，请拆分）',
      errorCode: 'AMBIGUOUS',
    };
  }

  const ints = scaleToInts(basis);
  if (!ints) {
    return {
      ok: false,
      error: '无法配平为正整数系数（请检查是否有未参与反应的物质）',
      errorCode: 'NO_SOLUTION',
    };
  }

  const resultCompounds: BalancedCompound[] = allCompounds.map((c, j) => ({
    coefficient: ints[j],
    displayFormula: c.displayFormula,
    isReactant: j < reactants.length,
    elements: Object.fromEntries(c.elements) as Record<string, number>,
    charge: c.charge,
  }));

  const arrow = normalizeArrow(m[0]);
  const leftStr = reactants
    .map((_, j) => `${coeffPrefix(ints[j])}${allCompounds[j].displayFormula}`)
    .join(' + ');
  const rightStr = products
    .map((_, k) => {
      const j = reactants.length + k;
      return `${coeffPrefix(ints[j])}${allCompounds[j].displayFormula}`;
    })
    .join(' + ');
  const equation = `${leftStr} ${arrow} ${rightStr}`;

  const conservation: ConservationRow[] = elements.map((el) => {
    let rSum = 0;
    let pSum = 0;
    ints.forEach((co, j) => {
      const cnt = allCompounds[j].elements.get(el) || 0;
      if (j < reactants.length) rSum += co * cnt;
      else pSum += co * cnt;
    });
    return { element: el, reactants: rSum, products: pSum, balanced: rSum === pSum };
  });

  let chargeBalance: BalanceResult['chargeBalance'] = null;
  if (hasCharge) {
    let rQ = 0;
    let pQ = 0;
    ints.forEach((co, j) => {
      if (j < reactants.length) rQ += co * allCompounds[j].charge;
      else pQ += co * allCompounds[j].charge;
    });
    chargeBalance = { reactants: rQ, products: pQ, balanced: rQ === pQ };
  }

  return {
    ok: true,
    compounds: resultCompounds,
    equation,
    arrow,
    conservation,
    chargeBalance,
  };
}
