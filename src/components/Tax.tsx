// ponytail (TGC-22, module 3): IIT (individual income tax) UI. Three sub-tabs:
//   - 综合所得:    comprehensive income tax with 7 special deductions
//   - 年终奖:     annual bonus dual-track trial (separate vs combined, pick best)
//   - 反推:      given a take-home number, solve for the gross pre-tax salary
//
// State is local — the calculator reducer in useCalculator.ts doesn't model
// multi-input forms. We debounce-record into history so the user's recent
// tax scenarios show up alongside arithmetic history.

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useI18n } from '../hooks/useI18n';
import { history } from '../history/api';
import { Chip, ChipSegment } from './Chip';
import { Panel } from './Panel';
import { Key } from './Key';
import {
  ANNUAL_THRESHOLD,
  EMPTY_DEDUCTIONS,
  computeBonusTrack,
  computeComprehensive,
  formatCNY,
  formatPercent,
  recommendBonus,
  totalSpecialDeduction,
  type SpecialDeductions,
} from '../tax/engine';

type Tab = 'comprehensive' | 'bonus' | 'grossup';

const TABS: { id: Tab; labelKey: string }[] = [
  { id: 'comprehensive', labelKey: 'tax.tab.comprehensive' },
  { id: 'bonus', labelKey: 'tax.tab.bonus' },
  { id: 'grossup', labelKey: 'tax.tab.grossup' },
];

type NumericTarget = {
  value: string;
  onChange(value: string): void;
};

const NumericKeyboardContext = createContext<(target: NumericTarget) => void>(() => {});

export function Tax() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('comprehensive');
  const [activeInput, setActiveInput] = useState<NumericTarget | null>(null);

  // Comprehensive
  const [income, setIncome] = useState('300000');
  const [social, setSocial] = useState('36000');
  const [deductions, setDeductions] = useState<SpecialDeductions>({
    ...EMPTY_DEDUCTIONS,
    childEducationPerKid: 2000,
    childEducationCount: 1,
    elderlyCare: 3000,
  });

  // Bonus
  const [bonusIncome, setBonusIncome] = useState('300000');
  const [bonusSocial, setBonusSocial] = useState('36000');
  const [bonusDeductions, setBonusDeductions] = useState<SpecialDeductions>({
    ...EMPTY_DEDUCTIONS,
    childEducationPerKid: 2000,
    childEducationCount: 1,
    elderlyCare: 3000,
  });
  const [bonusAmount, setBonusAmount] = useState('50000');

  // Grossup
  const [targetNet, setTargetNet] = useState('20000');

  function num(v: string): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  const comprehensiveRes = useMemo(
    () =>
      computeComprehensive({
        comprehensiveIncome: num(income),
        socialInsurance: num(social),
        specialDeduction: totalSpecialDeduction(deductions),
      }),
    [income, social, deductions],
  );

  const bonusInputs = useMemo(
    () => ({
      bonus: num(bonusAmount),
      comprehensiveIncome: num(bonusIncome),
      socialInsurance: num(bonusSocial),
      specialDeduction: totalSpecialDeduction(bonusDeductions),
    }),
    [bonusAmount, bonusIncome, bonusSocial, bonusDeductions],
  );

  const bonusTracks = useMemo(() => computeBonusTrack(bonusInputs), [bonusInputs]);
  const bonusRecommend = useMemo(() => recommendBonus(bonusInputs), [bonusInputs]);

  // Grossup: pre-tax salary P such that P - social - 60000 - special - tax(P) ≈ targetNet.
  // Newton iteration on (P - taxBracket(P)) ≈ targetNet + social + special + 60000.
  const grossupResult = useMemo(() => {
    const socialNum = num(social);
    const special = totalSpecialDeduction(deductions);
    const target = num(targetNet) * 12; // monthly -> annual
    const fixedDeduction = socialNum + ANNUAL_THRESHOLD + special;
    const grossTarget = target + fixedDeduction;
    // Newton on f(P) = annualTax(P - fixedDeduction) + (P - fixedDeduction) - grossTarget
    let p = grossTarget + 50000;
    for (let i = 0; i < 50; i++) {
      const taxable = Math.max(0, p - fixedDeduction);
      const tax = computeComprehensive({
        comprehensiveIncome: p,
        socialInsurance: socialNum,
        specialDeduction: special,
      }).tax;
      const net = p - tax;
      const delta = net - grossTarget;
      if (Math.abs(delta) < 0.5) break;
      // d(net)/dp = 1 - marginalTaxRate at this bracket
      const marginal = marginalAnnualRate(taxable);
      p = p - delta / (1 - marginal);
    }
    const final = computeComprehensive({
      comprehensiveIncome: p,
      socialInsurance: socialNum,
      specialDeduction: special,
    });
    return { grossAnnual: p, grossMonthly: p / 12, monthlyNet: target, tax: final.tax };
  }, [targetNet, social, deductions]);

  // Debounced history record
  useEffect(() => {
    const id = setTimeout(() => {
      if (tab === 'comprehensive') {
        history.record(`个税综合 ¥${income}`, formatCNY(comprehensiveRes.tax));
      } else if (tab === 'bonus') {
        history.record(`年终奖 ¥${bonusAmount}`, formatCNY(bonusRecommend.preferred === 'separate' ? bonusTracks.separate.totalTax : bonusTracks.combined.totalTax));
      } else {
        history.record(`到手 ¥${targetNet}/月`, formatCNY(grossupResult.grossMonthly));
      }
    }, 800);
    return () => clearTimeout(id);
  }, [tab, income, comprehensiveRes.tax, bonusAmount, bonusRecommend.preferred, bonusTracks, targetNet, grossupResult]);

  return (
    <NumericKeyboardContext.Provider value={setActiveInput}>
      <div
        style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--s-3)',
        padding: 'var(--s-3) var(--s-4) 0',
        overflow: 'auto',
      }}
      data-testid="tax-mode"
    >
      <ChipSegment role="tablist" ariaLabel="Tax sub-mode" layout="fill" shape="card">
        {TABS.map((tdef) => (
          <Chip key={tdef.id} active={tab === tdef.id} onClick={() => setTab(tdef.id)} fill>
            {t(tdef.labelKey)}
          </Chip>
        ))}
      </ChipSegment>

      {tab === 'comprehensive' && (
        <ComprehensiveView
          income={income}
          social={social}
          deductions={deductions}
          onIncome={setIncome}
          onSocial={setSocial}
          onDeductions={setDeductions}
          result={comprehensiveRes}
          t={t}
        />
      )}

      {tab === 'bonus' && (
        <BonusView
          bonusAmount={bonusAmount}
          bonusIncome={bonusIncome}
          bonusSocial={bonusSocial}
          bonusDeductions={bonusDeductions}
          onBonusAmount={setBonusAmount}
          onBonusIncome={setBonusIncome}
          onBonusSocial={setBonusSocial}
          onBonusDeductions={setBonusDeductions}
          tracks={bonusTracks}
          recommend={bonusRecommend}
          t={t}
        />
      )}

      {tab === 'grossup' && (
        <GrossupView
          targetNet={targetNet}
          social={social}
          deductions={deductions}
          onTargetNet={setTargetNet}
          onSocial={setSocial}
          onDeductions={setDeductions}
          result={grossupResult}
          t={t}
        />
      )}
        {activeInput && (
          <NumericTouchKeyboard setActive={setActiveInput} t={t} />
        )}
      </div>
    </NumericKeyboardContext.Provider>
  );
}

function NumericInput({
  value,
  onChange,
  testId,
}: {
  value: string;
  onChange(value: string): void;
  testId?: string;
}) {
  const select = useContext(NumericKeyboardContext);
  return (
    <input
      type="text"
      inputMode="decimal"
      className="ui-field-input"
      value={value}
      onFocus={() => select({ value, onChange })}
      onChange={(event) => {
        const next = event.target.value;
        onChange(next);
        select({ value: next, onChange });
      }}
      data-testid={testId}
    />
  );
}

function NumericTouchKeyboard({
  setActive,
  t,
}: {
  setActive: React.Dispatch<React.SetStateAction<NumericTarget | null>>;
  t(key: string): string;
}) {
  const apply = (operation: (value: string) => string) => {
    setActive((current) => {
      if (!current) return current;
      const next = operation(current.value);
      current.onChange(next);
      return { ...current, value: next };
    });
  };
  const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '.', '⌫'];
  return (
    <div className="touch-keyboard" data-testid="tax-touch-keyboard" aria-label={t('tax.keyboard')}>
      {keys.map((key) => (
        <Key
          key={key}
          label={key}
          variant={key === '⌫' ? 'fn' : 'num'}
          size="compact"
          mono
          onClick={() => apply((value) => key === '⌫' ? value.slice(0, -1) : key === '.' && value.includes('.') ? value : value + key)}
          ariaLabel={key === '⌫' ? t('key.backspace') : key}
          testId={`tax-key-${key === '⌫' ? 'backspace' : key}`}
        />
      ))}
      <Key
        label={t('common.clear')}
        variant="danger"
        size="compact"
        onClick={() => apply(() => '')}
        ariaLabel={t('common.clear')}
        testId="tax-key-clear"
        style={{ gridColumn: '1 / -1' }}
      />
    </div>
  );
}

function Field({
  label,
  testId,
  children,
}: {
  label: string;
  testId?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="ui-field" data-testid={testId}>
      <span className="ui-field-label">{label}</span>
      {children}
    </label>
  );
}

function ComprehensiveView({
  income,
  social,
  deductions,
  onIncome,
  onSocial,
  onDeductions,
  result,
  t,
}: {
  income: string;
  social: string;
  deductions: SpecialDeductions;
  onIncome(v: string): void;
  onSocial(v: string): void;
  onDeductions(d: SpecialDeductions): void;
  result: ReturnType<typeof computeComprehensive>;
  t(key: string, vars?: Record<string, string | number>): string;
}) {
  function patch<K extends keyof SpecialDeductions>(k: K, v: SpecialDeductions[K]) {
    onDeductions({ ...deductions, [k]: v });
  }
  return (
    <>
      <Field label={t('tax.field.income')} testId="tax-income">
        <NumericInput value={income} onChange={onIncome} testId="tax-income-input" />
      </Field>
      <Field label={t('tax.field.social')} testId="tax-social">
        <NumericInput value={social} onChange={onSocial} testId="tax-social-input" />
      </Field>
      <Panel testId="tax-deductions">
        <span className="ui-panel-label">{t('tax.deductions.title')}</span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-2)', marginTop: 'var(--s-2)' }}>
          <NumberField label={t('tax.deductions.childPerKid')} value={String(deductions.childEducationPerKid)}
            onChange={(v) => patch('childEducationPerKid', Number(v) || 0)} testId="tax-deduct-child-amount" />
          <NumberField label={t('tax.deductions.childCount')} value={String(deductions.childEducationCount)}
            onChange={(v) => patch('childEducationCount', Number(v) || 0)} testId="tax-deduct-child-count" />
          <NumberField label={t('tax.deductions.infantPerKid')} value={String(deductions.infantCarePerKid)}
            onChange={(v) => patch('infantCarePerKid', Number(v) || 0)} testId="tax-deduct-infant-amount" />
          <NumberField label={t('tax.deductions.infantCount')} value={String(deductions.infantCareCount)}
            onChange={(v) => patch('infantCareCount', Number(v) || 0)} testId="tax-deduct-infant-count" />
          <NumberField label={t('tax.deductions.continuing')} value={String(deductions.continuingEducation)}
            onChange={(v) => patch('continuingEducation', Number(v) || 0)} testId="tax-deduct-continuing" />
          <NumberField label={t('tax.deductions.illness')} value={String(deductions.majorIllness)}
            onChange={(v) => patch('majorIllness', Number(v) || 0)} testId="tax-deduct-illness" />
          <NumberField label={t('tax.deductions.mortgage')} value={String(deductions.mortgageInterest)}
            onChange={(v) => patch('mortgageInterest', Number(v) || 0)} testId="tax-deduct-mortgage" />
          <NumberField label={t('tax.deductions.rent')} value={String(deductions.rent)}
            onChange={(v) => patch('rent', Number(v) || 0)} testId="tax-deduct-rent" />
          <NumberField label={t('tax.deductions.elderly')} value={String(deductions.elderlyCare)}
            onChange={(v) => patch('elderlyCare', Number(v) || 0)} testId="tax-deduct-elderly" />
        </div>
      </Panel>
      <Panel testId="tax-comprehensive-result">
        <span className="ui-result-secondary">{t('tax.result.tax')}</span>
        <div className="ui-result-primary" data-testid="tax-comprehensive-tax">
          {formatCNY(result.tax)}
        </div>
        <div className="ui-result-secondary" style={{ marginTop: 'var(--s-1)' }}>
          {t('tax.result.summary', {
            taxable: formatCNY(result.taxableIncome),
            rate: formatPercent(result.effectiveRate),
            net: formatCNY(result.netIncome),
          })}
        </div>
      </Panel>
    </>
  );
}

function NumberField({
  label, value, onChange, testId,
}: {
  label: string;
  value: string;
  onChange(v: string): void;
  testId?: string;
}) {
  return (
    <Field label={label} testId={testId}>
      <NumericInput value={value} onChange={onChange} testId={testId ? `${testId}-input` : undefined} />
    </Field>
  );
}

function BonusView({
  bonusAmount, bonusIncome, bonusSocial, bonusDeductions,
  onBonusAmount, onBonusIncome, onBonusSocial, onBonusDeductions,
  tracks, recommend, t,
}: {
  bonusAmount: string;
  bonusIncome: string;
  bonusSocial: string;
  bonusDeductions: SpecialDeductions;
  onBonusAmount(v: string): void;
  onBonusIncome(v: string): void;
  onBonusSocial(v: string): void;
  onBonusDeductions(d: SpecialDeductions): void;
  tracks: ReturnType<typeof computeBonusTrack>;
  recommend: ReturnType<typeof recommendBonus>;
  t(key: string, vars?: Record<string, string | number>): string;
}) {
  function patch<K extends keyof SpecialDeductions>(k: K, v: SpecialDeductions[K]) {
    onBonusDeductions({ ...bonusDeductions, [k]: v });
  }
  return (
    <>
      <Field label={t('tax.field.bonus')} testId="tax-bonus">
        <NumericInput value={bonusAmount} onChange={onBonusAmount} testId="tax-bonus-input" />
      </Field>
      <Field label={t('tax.field.income')} testId="tax-bonus-income">
        <NumericInput value={bonusIncome} onChange={onBonusIncome} testId="tax-bonus-income-input" />
      </Field>
      <Field label={t('tax.field.social')} testId="tax-bonus-social">
        <NumericInput value={bonusSocial} onChange={onBonusSocial} testId="tax-bonus-social-input" />
      </Field>
      <Panel testId="tax-bonus-deductions">
        <span className="ui-panel-label">{t('tax.deductions.title')}</span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-2)', marginTop: 'var(--s-2)' }}>
          <NumberField label={t('tax.deductions.childPerKid')} value={String(bonusDeductions.childEducationPerKid)}
            onChange={(v) => patch('childEducationPerKid', Number(v) || 0)} testId="tax-bonus-deduct-child-amount" />
          <NumberField label={t('tax.deductions.childCount')} value={String(bonusDeductions.childEducationCount)}
            onChange={(v) => patch('childEducationCount', Number(v) || 0)} testId="tax-bonus-deduct-child-count" />
          <NumberField label={t('tax.deductions.infantPerKid')} value={String(bonusDeductions.infantCarePerKid)}
            onChange={(v) => patch('infantCarePerKid', Number(v) || 0)} testId="tax-bonus-deduct-infant-amount" />
          <NumberField label={t('tax.deductions.infantCount')} value={String(bonusDeductions.infantCareCount)}
            onChange={(v) => patch('infantCareCount', Number(v) || 0)} testId="tax-bonus-deduct-infant-count" />
          <NumberField label={t('tax.deductions.continuing')} value={String(bonusDeductions.continuingEducation)}
            onChange={(v) => patch('continuingEducation', Number(v) || 0)} testId="tax-bonus-deduct-continuing" />
          <NumberField label={t('tax.deductions.illness')} value={String(bonusDeductions.majorIllness)}
            onChange={(v) => patch('majorIllness', Number(v) || 0)} testId="tax-bonus-deduct-illness" />
          <NumberField label={t('tax.deductions.mortgage')} value={String(bonusDeductions.mortgageInterest)}
            onChange={(v) => patch('mortgageInterest', Number(v) || 0)} testId="tax-bonus-deduct-mortgage" />
          <NumberField label={t('tax.deductions.rent')} value={String(bonusDeductions.rent)}
            onChange={(v) => patch('rent', Number(v) || 0)} testId="tax-bonus-deduct-rent" />
          <NumberField label={t('tax.deductions.elderly')} value={String(bonusDeductions.elderlyCare)}
            onChange={(v) => patch('elderlyCare', Number(v) || 0)} testId="tax-bonus-deduct-elderly" />
        </div>
      </Panel>
      <Panel testId="tax-bonus-result">
        <span className="ui-result-secondary">{t('tax.result.recommend')}</span>
        <div className="ui-result-primary" data-testid="tax-bonus-preferred">
          {recommend.preferred === 'separate' ? t('tax.bonus.separate') : t('tax.bonus.combined')}
        </div>
        <div className="ui-result-secondary" style={{ marginTop: 'var(--s-1)' }}>
          {t('tax.result.saving', { saving: formatCNY(recommend.saving) })}
        </div>
      </Panel>
      <Panel testId="tax-bonus-compare">
        <span className="ui-panel-label">{t('tax.compare.title')}</span>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, marginTop: 'var(--s-2)' }}>
          <tbody>
            <tr>
              <td>{t('tax.bonus.separate')}</td>
              <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }} data-testid="tax-bonus-separate-total">
                {formatCNY(tracks.separate.totalTax)}
              </td>
            </tr>
            <tr>
              <td>{t('tax.bonus.combined')}</td>
              <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }} data-testid="tax-bonus-combined-total">
                {formatCNY(tracks.combined.totalTax)}
              </td>
            </tr>
          </tbody>
        </table>
      </Panel>
    </>
  );
}

function GrossupView({
  targetNet, social, deductions,
  onTargetNet, onSocial, onDeductions,
  result, t,
}: {
  targetNet: string;
  social: string;
  deductions: SpecialDeductions;
  onTargetNet(v: string): void;
  onSocial(v: string): void;
  onDeductions(d: SpecialDeductions): void;
  result: { grossAnnual: number; grossMonthly: number; monthlyNet: number; tax: number };
  t(key: string, vars?: Record<string, string | number>): string;
}) {
  function patch<K extends keyof SpecialDeductions>(k: K, v: SpecialDeductions[K]) {
    onDeductions({ ...deductions, [k]: v });
  }
  return (
    <>
      <Field label={t('tax.field.netMonthly')} testId="tax-target-net">
        <NumericInput value={targetNet} onChange={onTargetNet} testId="tax-target-net-input" />
      </Field>
      <Field label={t('tax.field.social')} testId="tax-grossup-social">
        <NumericInput value={social} onChange={onSocial} testId="tax-grossup-social-input" />
      </Field>
      <Panel testId="tax-grossup-deductions">
        <span className="ui-panel-label">{t('tax.deductions.title')}</span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-2)', marginTop: 'var(--s-2)' }}>
          <NumberField label={t('tax.deductions.childPerKid')} value={String(deductions.childEducationPerKid)}
            onChange={(v) => patch('childEducationPerKid', Number(v) || 0)} testId="tax-grossup-deduct-child-amount" />
          <NumberField label={t('tax.deductions.childCount')} value={String(deductions.childEducationCount)}
            onChange={(v) => patch('childEducationCount', Number(v) || 0)} testId="tax-grossup-deduct-child-count" />
          <NumberField label={t('tax.deductions.infantPerKid')} value={String(deductions.infantCarePerKid)}
            onChange={(v) => patch('infantCarePerKid', Number(v) || 0)} testId="tax-grossup-deduct-infant-amount" />
          <NumberField label={t('tax.deductions.infantCount')} value={String(deductions.infantCareCount)}
            onChange={(v) => patch('infantCareCount', Number(v) || 0)} testId="tax-grossup-deduct-infant-count" />
          <NumberField label={t('tax.deductions.continuing')} value={String(deductions.continuingEducation)}
            onChange={(v) => patch('continuingEducation', Number(v) || 0)} testId="tax-grossup-deduct-continuing" />
          <NumberField label={t('tax.deductions.illness')} value={String(deductions.majorIllness)}
            onChange={(v) => patch('majorIllness', Number(v) || 0)} testId="tax-grossup-deduct-illness" />
          <NumberField label={t('tax.deductions.mortgage')} value={String(deductions.mortgageInterest)}
            onChange={(v) => patch('mortgageInterest', Number(v) || 0)} testId="tax-grossup-deduct-mortgage" />
          <NumberField label={t('tax.deductions.rent')} value={String(deductions.rent)}
            onChange={(v) => patch('rent', Number(v) || 0)} testId="tax-grossup-deduct-rent" />
          <NumberField label={t('tax.deductions.elderly')} value={String(deductions.elderlyCare)}
            onChange={(v) => patch('elderlyCare', Number(v) || 0)} testId="tax-grossup-deduct-elderly" />
        </div>
      </Panel>
      <Panel testId="tax-grossup-result">
        <span className="ui-result-secondary">{t('tax.result.grossMonthly')}</span>
        <div className="ui-result-primary" data-testid="tax-gross-monthly">
          {formatCNY(result.grossMonthly)}
        </div>
        <div className="ui-result-secondary" style={{ marginTop: 'var(--s-1)' }}>
          {t('tax.result.grossSummary', {
            annual: formatCNY(result.grossAnnual),
            tax: formatCNY(result.tax),
          })}
        </div>
      </Panel>
    </>
  );
}

function marginalAnnualRate(taxable: number): number {
  if (taxable <= 0) return 0;
  if (taxable <= 36000) return 0.03;
  if (taxable <= 144000) return 0.10;
  if (taxable <= 300000) return 0.20;
  if (taxable <= 420000) return 0.25;
  if (taxable <= 660000) return 0.30;
  if (taxable <= 960000) return 0.35;
  return 0.45;
}