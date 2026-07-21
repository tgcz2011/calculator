// ponytail (TGC-22, module 2): loan calculator. Pure functions that operate on
// the four inputs (principal, monthly rate, term in months, prepayment shape)
// and emit a result struct. The component is a thin UI over these. No engine
// integration — the math is straightforward closed-form amortization +
// Newton-iteration IRR; routing through math.js would add a dependency on its
// internal numeric types without buying us anything.
//
// Money conventions: everything is in CNY (¥). The display rounds to two
// decimal places (cents) for monthly payments / interest, and to whole CNY for
// totals. We use Number, not BigNumber — amortization tables top out at 360
// rows and 100k principal is well within 2^53.

export type RepaymentMethod = 'equal-payment' | 'equal-principal';
export type PrepayStrategy = 'shorten-term' | 'reduce-payment';

export interface LoanInputs {
  principal: number;        // 贷款本金 (¥)
  annualRatePercent: number;// 年利率 (%，用户输入形式，如 4.20)
  termMonths: number;       // 期限（月）
  /** Optional one-time prepayment at month `prepayAtMonth` (>= 1, <= termMonths). */
  prepayAmount?: number;
  prepayAtMonth?: number;
  prepayStrategy?: PrepayStrategy;
}

export interface AmortizationRow {
  month: number;
  payment: number;          // 当月月供
  principalPart: number;    // 当月偿还本金
  interestPart: number;     // 当月偿还利息
  remaining: number;        // 当月剩余本金
}

export interface LoanResult {
  monthlyPayment: number;     // 首期月供（等额本金每月递减，等额本息每月相等）
  totalPayment: number;       // 还款总额 = 月供 × 期数 - 减免
  totalInterest: number;      // 总利息 = 还款总额 - 本金
  effectiveAnnualRate: number;// 实际年化（IRR × 12，等额本息/本金按月复利）
  schedule: AmortizationRow[];// 还款明细（最多 360 行；含提前还款切分）
  /** True if the user's loan terminated early due to prepayment. */
  shortened: boolean;
  /** Actual term after prepayment (months). Equals inputs.termMonths when not shortened. */
  effectiveTermMonths: number;
}

function monthlyRate(annualRatePercent: number): number {
  return annualRatePercent / 100 / 12;
}

/**
 * Equal-payment (等额本息): monthly payment is constant. Formula:
 *   payment = P * r * (1+r)^n / ((1+r)^n - 1)
 * where r = monthly rate, n = term in months.
 */
export function equalPaymentMonthly(principal: number, annualRatePercent: number, termMonths: number): number {
  const r = monthlyRate(annualRatePercent);
  if (r === 0) return principal / termMonths;
  const factor = Math.pow(1 + r, termMonths);
  return (principal * r * factor) / (factor - 1);
}

/**
 * Equal-principal (等额本金): each month pays principal/termMonths, interest
 * is computed on the remaining balance. So payment declines month over month.
 */
export function equalPrincipalMonthly(
  principal: number,
  annualRatePercent: number,
  termMonths: number,
  monthIndex: number, // 1-based
): { principalPart: number; interestPart: number; payment: number } {
  const r = monthlyRate(annualRatePercent);
  const principalPart = principal / termMonths;
  const remaining = principal - principalPart * (monthIndex - 1);
  const interestPart = remaining * r;
  return { principalPart, interestPart, payment: principalPart + interestPart };
}

/**
 * Build an amortization schedule for either method, applying an optional
 * prepayment at `prepayAtMonth` according to `prepayStrategy`.
 *
 * prepayStrategy='shorten-term'   → payment stays the same; balance drops by
 *                                   prepayAmount + scheduled principal; new
 *                                   remaining is amortized over fewer months.
 * prepayStrategy='reduce-payment' → term stays the same; payment is recomputed
 *                                   for the remaining balance.
 */
export function buildSchedule(method: RepaymentMethod, i: LoanInputs): LoanResult {
  const { principal, annualRatePercent, termMonths } = i;
  const r = monthlyRate(annualRatePercent);
  const prepayAmount = i.prepayAmount ?? 0;
  const prepayAtMonth = i.prepayAtMonth ?? termMonths + 1;
  const prepayStrategy = i.prepayStrategy ?? 'shorten-term';
  const schedule: AmortizationRow[] = [];

  let remaining = principal;
  let currentPayment = equalPaymentMonthly(principal, annualRatePercent, termMonths);
  let monthlyPrincipalEqual = principal / termMonths;
  let effectiveTerm = termMonths;
  let totalPayment = 0;
  let shortened = false;

  if (method === 'equal-payment') {
    for (let m = 1; m <= termMonths && remaining > 1e-6; m++) {
      const interestPart = remaining * r;
      let principalPart = currentPayment - interestPart;
      // Guard against float drift: the last payment settles the balance.
      if (principalPart > remaining) principalPart = remaining;
      let payment = interestPart + principalPart;
      let localRemaining = remaining - principalPart;

      if (m === prepayAtMonth && prepayAmount > 0) {
        localRemaining -= prepayAmount;
        if (localRemaining <= 1e-6) {
          // Prepay clears the loan early.
          payment += Math.max(0, localRemaining);
          localRemaining = 0;
          shortened = true;
          effectiveTerm = m;
        } else if (prepayStrategy === 'shorten-term') {
          // Compute the new term that keeps payment constant.
          const newN = Math.log(currentPayment / (currentPayment - localRemaining * r)) / Math.log(1 + r);
          effectiveTerm = m + Math.max(1, Math.ceil(newN));
          shortened = true;
        } else {
          // reduce-payment: recompute payment over remaining (effectiveTerm - m) months.
          const nLeft = termMonths - m;
          currentPayment = equalPaymentMonthly(localRemaining, annualRatePercent, nLeft);
          shortened = true;
        }
      }

      totalPayment += payment;
      schedule.push({
        month: m,
        payment,
        principalPart,
        interestPart,
        remaining: Math.max(0, localRemaining),
      });
      remaining = localRemaining;
      if (shortened) break;
    }
  } else {
    // equal-principal: fixed principal/term, interest on remaining each month
    for (let m = 1; m <= termMonths && remaining > 1e-6; m++) {
      const interestPart = remaining * r;
      let principalPart = monthlyPrincipalEqual;
      if (principalPart > remaining) principalPart = remaining;
      let payment = interestPart + principalPart;
      let localRemaining = remaining - principalPart;

      if (m === prepayAtMonth && prepayAmount > 0) {
        localRemaining -= prepayAmount;
        if (localRemaining <= 1e-6) {
          payment += Math.max(0, localRemaining);
          localRemaining = 0;
          shortened = true;
          effectiveTerm = m;
        } else if (prepayStrategy === 'shorten-term') {
          // Recompute equal-principal schedule from the new balance.
          const newPrincipal = localRemaining;
          monthlyPrincipalEqual = newPrincipal / Math.max(1, termMonths - m);
          shortened = true;
        } else {
          // reduce-payment on equal-principal is the same as reducing principal:
          // the schedule already recomputes each month, so nothing to adjust
          // beyond the balance itself. Mark shortened=false (term unchanged).
        }
      }

      totalPayment += payment;
      schedule.push({
        month: m,
        payment,
        principalPart,
        interestPart,
        remaining: Math.max(0, localRemaining),
      });
      remaining = localRemaining;
      if (shortened && prepayStrategy === 'shorten-term') break;
    }
  }

  // IRR: solve for the monthly rate r such that
  //   Σ payment_m / (1+r)^m = principal
  // using Newton iteration on the NPV. We use the schedule we just built.
  const cashflows = [-principal, ...schedule.map((row) => row.payment)];
  const irrMonthly = newtonIrr(cashflows, 0.005);
  const effectiveAnnualRate = irrMonthly === null ? annualRatePercent / 100 : irrMonthly * 12;

  return {
    monthlyPayment: schedule[0]?.payment ?? 0,
    totalPayment,
    totalInterest: totalPayment - principal,
    effectiveAnnualRate,
    schedule,
    shortened,
    effectiveTermMonths: shortened ? effectiveTerm : termMonths,
  };
}

/**
 * IRR via Newton-Raphson on the NPV function. Returns the monthly rate, or
 * null if convergence fails (which would mean the cashflow stream has no
 * real IRR — e.g. all-positive after the initial outlay).
 */
export function newtonIrr(cashflows: number[], guess = 0.01, maxIter = 100, tol = 1e-7): number | null {
  let r = guess;
  for (let i = 0; i < maxIter; i++) {
    let npv = 0;
    let dnpv = 0;
    for (let t = 0; t < cashflows.length; t++) {
      const denom = Math.pow(1 + r, t);
      if (denom === 0) return null;
      npv += cashflows[t] / denom;
      if (t > 0) dnpv += (-t * cashflows[t]) / Math.pow(1 + r, t + 1);
    }
    if (Math.abs(npv) < tol) return r;
    if (dnpv === 0) return null;
    const next = r - npv / dnpv;
    if (!Number.isFinite(next)) return null;
    if (Math.abs(next - r) < tol) return next;
    r = next;
  }
  return null;
}

/**
 * Reverse-calculate the effective annual rate given the loan amount and the
 * monthly payment (and term). Useful for exposing "砍头息" — where the lender
 * disburses less than the stated principal but charges interest on the full
 * stated amount, the actual APR is higher than the nominal rate. Caller passes
 * the *received* principal (post-fee) and the monthly payment; we solve for
 * the implied monthly rate via Newton.
 */
export function impliedRate(
  receivedPrincipal: number,
  monthlyPayment: number,
  termMonths: number,
): number | null {
  if (receivedPrincipal <= 0 || monthlyPayment <= 0 || termMonths <= 0) return null;
  const cashflows = [-receivedPrincipal];
  for (let m = 0; m < termMonths; m++) cashflows.push(monthlyPayment);
  const r = newtonIrr(cashflows, monthlyPayment / receivedPrincipal / 12 / 2);
  return r === null ? null : r * 12;
}

export function formatCNY(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 2 });
}

export function formatPercent(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(2)}%`;
}

export function formatMonths(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const years = Math.floor(n / 12);
  const months = n % 12;
  if (years === 0) return `${months} 个月`;
  if (months === 0) return `${years} 年`;
  return `${years} 年 ${months} 个月`;
}