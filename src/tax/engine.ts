// ponytail (TGC-22, module 3): China IIT (individual income tax) engine.
// Computes the 综合所得 (comprehensive income) tax liability with the
// 7-item special additional deduction, and offers a dual-track trial for the
// annual bonus (单独计税 vs 并入综合所得).
//
// All amounts are CNY. 2026-07 snapshot per调研报告:
//   - 起征点: 60,000 ¥/年
//   - 综合所得年度税率表 (7 brackets, 3%..45%)
//   - 年终奖按月换算税率表 (also 7 brackets)
//   - 7 项专项附加扣除 caps
//   - 五险一金 is user-supplied (city-specific)
//
// Brackets are inclusive at the lower bound, exclusive at the upper bound,
// matching the State Tax Administration's published interpretation.

const ANNUAL_BRACKETS: ReadonlyArray<{ upper: number; rate: number; quickDeduct: number }> = [
  { upper: 36000, rate: 0.03, quickDeduct: 0 },
  { upper: 144000, rate: 0.10, quickDeduct: 2520 },
  { upper: 300000, rate: 0.20, quickDeduct: 16920 },
  { upper: 420000, rate: 0.25, quickDeduct: 31920 },
  { upper: 660000, rate: 0.30, quickDeduct: 52920 },
  { upper: 960000, rate: 0.35, quickDeduct: 85920 },
  { upper: Infinity, rate: 0.45, quickDeduct: 181920 },
];

// 月均税率表 (年终奖单独计税用). 把年度表按 12 等分，但 published 月表保留
// 独立的速算扣除数（不是简单 ÷ 12）。
const MONTHLY_BRACKETS: ReadonlyArray<{ upper: number; rate: number; quickDeduct: number }> = [
  { upper: 3000, rate: 0.03, quickDeduct: 0 },
  { upper: 12000, rate: 0.10, quickDeduct: 210 },
  { upper: 25000, rate: 0.20, quickDeduct: 1410 },
  { upper: 35000, rate: 0.25, quickDeduct: 2660 },
  { upper: 55000, rate: 0.30, quickDeduct: 4410 },
  { upper: 80000, rate: 0.35, quickDeduct: 7160 },
  { upper: Infinity, rate: 0.45, quickDeduct: 15160 },
];

export const TAX_BRACKETS_ANNUAL = ANNUAL_BRACKETS;
export const TAX_BRACKETS_MONTHLY = MONTHLY_BRACKETS;
export const ANNUAL_THRESHOLD = 60000;

export interface SpecialDeductions {
  /** 子女教育 (元/月/孩). 0..N 孩 */
  childEducationPerKid: number;
  childEducationCount: number;
  /** 3 岁以下婴幼儿照护 (元/月/孩). 0..N */
  infantCarePerKid: number;
  infantCareCount: number;
  /** 继续教育 (元/月). 学历 ≤ 48 月内 400, 证书当年 3600 (摊到月 = 300). 简化输入 0..400. */
  continuingEducation: number;
  /** 大病医疗 (元/年, >15000 据实, ≤80000 限额). 直接输入年度金额 */
  majorIllness: number;
  /** 住房贷款利息 (元/月). 首套商贷/公积金贷 1000 */
  mortgageInterest: number;
  /** 住房租金 (元/月). 1500 / 1100 / 800 三档 */
  rent: number;
  /** 赡养老人 (元/月). 独生 3000, 非独生分摊 ≤1500/人 */
  elderlyCare: number;
}

export const EMPTY_DEDUCTIONS: SpecialDeductions = {
  childEducationPerKid: 0,
  childEducationCount: 0,
  infantCarePerKid: 0,
  infantCareCount: 0,
  continuingEducation: 0,
  majorIllness: 0,
  mortgageInterest: 0,
  rent: 0,
  elderlyCare: 0,
};

/** 年度专项附加扣除合计 (元/年). 大病医疗走独立输入，其它项 ×12. */
export function totalSpecialDeduction(d: SpecialDeductions): number {
  const monthly =
    d.childEducationPerKid * d.childEducationCount +
    d.infantCarePerKid * d.infantCareCount +
    d.continuingEducation +
    d.mortgageInterest +
    d.rent +
    d.elderlyCare;
  return Math.max(0, monthly) * 12 + Math.max(0, d.majorIllness);
}

/** 按综合所得年度税率表算税 (元). taxable = max(0, income - threshold - deductions). */
export function annualTax(taxableIncome: number): number {
  if (taxableIncome <= 0) return 0;
  for (const b of ANNUAL_BRACKETS) {
    if (taxableIncome <= b.upper) {
      return Math.max(0, taxableIncome * b.rate - b.quickDeduct);
    }
  }
  return 0;
}

/** 月均税率表算税 (年终奖单独计税用). taxable = bonus / 12. */
export function bonusSeparateTax(bonus: number): number {
  if (bonus <= 0) return 0;
  const monthly = bonus / 12;
  for (const b of MONTHLY_BRACKETS) {
    if (monthly <= b.upper) {
      return Math.max(0, bonus * b.rate - b.quickDeduct);
    }
  }
  return 0;
}

export interface ComprehensiveIncomeInputs {
  /** 综合所得 (工资薪金 + 劳务报酬 + 稿酬 + 特许权使用费), 年度总额 */
  comprehensiveIncome: number;
  /** 五险一金个人部分 (元/年). 公积金 + 养老 + 医疗 + 失业 + 工伤 + 生育(部分自费) */
  socialInsurance: number;
  /** 专项附加扣除 (元/年). 见 totalSpecialDeduction */
  specialDeduction: number;
}

export interface ComprehensiveIncomeResult {
  taxableIncome: number;
  tax: number;
  effectiveRate: number;
  netIncome: number;
  afterDeduction: number;
}

export function computeComprehensive(inputs: ComprehensiveIncomeInputs): ComprehensiveIncomeResult {
  const { comprehensiveIncome, socialInsurance, specialDeduction } = inputs;
  const afterDeduction = Math.max(0, comprehensiveIncome - socialInsurance);
  const taxableIncome = Math.max(0, afterDeduction - ANNUAL_THRESHOLD - specialDeduction);
  const tax = annualTax(taxableIncome);
  return {
    taxableIncome,
    tax,
    effectiveRate: taxableIncome > 0 ? tax / taxableIncome : 0,
    netIncome: afterDeduction - tax,
    afterDeduction,
  };
}

export interface BonusInputs {
  /** 全年一次性奖金 (元). 政策延续至 2027-12-31 */
  bonus: number;
  /** 综合所得 (元/年), 不含年终奖. 用于方式 B "并入综合所得" */
  comprehensiveIncome: number;
  socialInsurance: number;
  specialDeduction: number;
}

export interface BonusTrack {
  name: 'separate' | 'combined';
  bonusTax: number;       // 年终奖部分的应纳税额
  comprehensiveTax: number;// 综合所得部分的应纳税额
  totalTax: number;
}

/**
 * 单独计税 (方式 A): bonus/12 -> 月均税率 - 速算扣除; 剩余综合所得另算。
 * 并入综合所得 (方式 B): 综合所得 + bonus 一起走年度税率表。
 */
export function computeBonusTrack(i: BonusInputs): { separate: BonusTrack; combined: BonusTrack } {
  const comprehensiveOnly = computeComprehensive({
    comprehensiveIncome: i.comprehensiveIncome,
    socialInsurance: i.socialInsurance,
    specialDeduction: i.specialDeduction,
  });

  // separate (方式 A)
  const bonusTax = bonusSeparateTax(i.bonus);
  const separate: BonusTrack = {
    name: 'separate',
    bonusTax,
    comprehensiveTax: comprehensiveOnly.tax,
    totalTax: bonusTax + comprehensiveOnly.tax,
  };

  // combined (方式 B): 把 bonus 并入综合所得，走年度税率表
  const merged = computeComprehensive({
    comprehensiveIncome: i.comprehensiveIncome + i.bonus,
    socialInsurance: i.socialInsurance,
    specialDeduction: i.specialDeduction,
  });
  const combined: BonusTrack = {
    name: 'combined',
    bonusTax: merged.tax - comprehensiveOnly.tax, // informational: bonus share
    comprehensiveTax: comprehensiveOnly.tax,        // unchanged: this is the no-bonus slice
    totalTax: merged.tax,
  };

  return { separate, combined };
}

export interface Recommendation {
  preferred: 'separate' | 'combined';
  saving: number;
  separateTotal: number;
  combinedTotal: number;
}

export function recommendBonus(i: BonusInputs): Recommendation {
  const { separate, combined } = computeBonusTrack(i);
  const preferred: 'separate' | 'combined' =
    separate.totalTax < combined.totalTax ? 'separate' : 'combined';
  return {
    preferred,
    saving: Math.abs(separate.totalTax - combined.totalTax),
    separateTotal: separate.totalTax,
    combinedTotal: combined.totalTax,
  };
}

export function formatCNY(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 2 });
}

export function formatPercent(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(2)}%`;
}