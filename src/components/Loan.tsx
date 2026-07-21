// ponytail (TGC-22, module 2): loan calculator UI. Self-contained state — the
// reducer in useCalculator.ts is for basic/scientific only, and routing loan
// state through it would couple two unrelated state machines. This matches the
// Programmer pattern: independent useState, history.record on commit.
//
// Sub-tabs:
//   equal-payment  - 等额本息: fixed monthly payment
//   equal-principal- 等额本金: declining monthly payment
//   irr            - actual APR / 砍头息 reverse-calc
//   prepay         - prepayment comparison

import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../hooks/useI18n';
import { history } from '../history/api';
import { Chip, ChipSegment } from './Chip';
import { Panel } from './Panel';
import {
  buildSchedule,
  equalPaymentMonthly,
  equalPrincipalMonthly,
  formatCNY,
  formatMonths,
  formatPercent,
  impliedRate,
  type PrepayStrategy,
} from '../loan/engine';

type Tab = 'equal-payment' | 'equal-principal' | 'irr' | 'prepay';

const TABS: { id: Tab; labelKey: string }[] = [
  { id: 'equal-payment', labelKey: 'loan.tab.equalPayment' },
  { id: 'equal-principal', labelKey: 'loan.tab.equalPrincipal' },
  { id: 'irr', labelKey: 'loan.tab.irr' },
  { id: 'prepay', labelKey: 'loan.tab.prepay' },
];

export function Loan() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('equal-payment');

  // ponytail: shared inputs across tabs (principal / rate / term). Defaults are
  // chosen so first paint shows a sensible number — ¥1,000,000 @ 4.20% / 30y.
  const [principal, setPrincipal] = useState('1000000');
  const [rate, setRate] = useState('4.20');
  const [termYears, setTermYears] = useState('30');

  // prepayment-only fields
  const [prepayAmount, setPrepayAmount] = useState('100000');
  const [prepayAtMonth, setPrepayAtMonth] = useState('12');
  const [prepayStrategy, setPrepayStrategy] = useState<PrepayStrategy>('shorten-term');

  // IRR-only field: the actual amount received (e.g. after 砍头息 fee).
  const [receivedPrincipal, setReceivedPrincipal] = useState('950000');

  function num(v: string): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  const termMonths = Math.max(1, Math.round(num(termYears) * 12));
  const principalNum = num(principal);
  const rateNum = num(rate);

  const equalPayment = useMemo(
    () => equalPaymentMonthly(principalNum, rateNum, termMonths),
    [principalNum, rateNum, termMonths],
  );

  const equalPrincipalSchedule = useMemo(() => {
    const out: { month: number; payment: number }[] = [];
    for (let m = 1; m <= Math.min(12, termMonths); m++) {
      const r = equalPrincipalMonthly(principalNum, rateNum, termMonths, m);
      out.push({ month: m, payment: r.payment });
    }
    return out;
  }, [principalNum, rateNum, termMonths]);

  const prepayInputs = useMemo(
    () => ({
      principal: principalNum,
      annualRatePercent: rateNum,
      termMonths,
      prepayAmount: num(prepayAmount),
      prepayAtMonth: Math.max(1, Math.round(num(prepayAtMonth))),
      prepayStrategy,
    }),
    [principalNum, rateNum, termMonths, prepayAmount, prepayAtMonth, prepayStrategy],
  );

  const baseSchedule = useMemo(
    () => buildSchedule('equal-payment', {
      principal: principalNum,
      annualRatePercent: rateNum,
      termMonths,
    }),
    [principalNum, rateNum, termMonths],
  );

  const prepaySchedule = useMemo(
    () => buildSchedule('equal-payment', prepayInputs),
    [prepayInputs],
  );

  const irrResult = useMemo(() => {
    const received = num(receivedPrincipal);
    return impliedRate(received, equalPayment, termMonths);
  }, [receivedPrincipal, equalPayment, termMonths]);

  // Record the most recent "primary" calc into history whenever the inputs
  // settle. Programmer.tsx uses history.record in onEquals; we approximate by
  // debouncing on inputs. Cheap because we record one entry per settled calc.
  useEffect(() => {
    const id = setTimeout(() => {
      const expr = `${principal}¥ ${rate}%/${termYears}y`;
      const result = tab === 'irr'
        ? (irrResult === null ? '—' : formatPercent(irrResult))
        : formatCNY(equalPayment);
      history.record(expr, result);
    }, 800);
    return () => clearTimeout(id);
  }, [principal, rate, termYears, equalPayment, irrResult, tab]);

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--s-3)',
        padding: 'var(--s-3) var(--s-4) 0',
        overflow: 'auto',
      }}
      data-testid="loan-mode"
    >
      <ChipSegment role="tablist" ariaLabel="Loan sub-mode" layout="fill" shape="card">
        {TABS.map((tdef) => (
          <Chip key={tdef.id} active={tab === tdef.id} onClick={() => setTab(tdef.id)} fill>
            {t(tdef.labelKey)}
          </Chip>
        ))}
      </ChipSegment>

      {tab !== 'irr' && tab !== 'prepay' && (
        <SharedFields
          principal={principal}
          rate={rate}
          termYears={termYears}
          onPrincipal={setPrincipal}
          onRate={setRate}
          onTermYears={setTermYears}
          t={t}
        />
      )}

      {tab === 'equal-payment' && (
        <EqualPaymentView
          principal={principalNum}
          rate={rateNum}
          termMonths={termMonths}
          monthly={equalPayment}
          schedule={baseSchedule}
          t={t}
        />
      )}

      {tab === 'equal-principal' && (
        <EqualPrincipalView
          principal={principalNum}
          rate={rateNum}
          termMonths={termMonths}
          preview={equalPrincipalSchedule}
          t={t}
        />
      )}

      {tab === 'irr' && (
        <IrrView
          principal={principal}
          receivedPrincipal={receivedPrincipal}
          rate={rate}
          termYears={termYears}
          monthly={equalPayment}
          implied={irrResult}
          onReceivedPrincipal={setReceivedPrincipal}
          onPrincipal={setPrincipal}
          onRate={setRate}
          onTermYears={setTermYears}
          t={t}
        />
      )}

      {tab === 'prepay' && (
        <PrepayView
          base={baseSchedule}
          prepay={prepaySchedule}
          prepayAmount={prepayAmount}
          prepayAtMonth={prepayAtMonth}
          prepayStrategy={prepayStrategy}
          onPrepayAmount={setPrepayAmount}
          onPrepayAtMonth={setPrepayAtMonth}
          onPrepayStrategy={setPrepayStrategy}
          t={t}
          shared={(
            <SharedFields
              principal={principal}
              rate={rate}
              termYears={termYears}
              onPrincipal={setPrincipal}
              onRate={setRate}
              onTermYears={setTermYears}
              t={t}
            />
          )}
        />
      )}
    </div>
  );
}

function SharedFields({
  principal,
  rate,
  termYears,
  onPrincipal,
  onRate,
  onTermYears,
  t,
}: {
  principal: string;
  rate: string;
  termYears: string;
  onPrincipal(v: string): void;
  onRate(v: string): void;
  onTermYears(v: string): void;
  t(key: string, vars?: Record<string, string | number>): string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
      <Field label={t('loan.field.principal')} testId="loan-principal">
        <input
          type="number"
          className="ui-field-input"
          value={principal}
          step="any"
          onChange={(e) => onPrincipal(e.target.value)}
          data-testid="loan-principal-input"
        />
      </Field>
      <Field label={t('loan.field.rate')} testId="loan-rate">
        <input
          type="number"
          className="ui-field-input"
          value={rate}
          step="0.01"
          onChange={(e) => onRate(e.target.value)}
          data-testid="loan-rate-input"
        />
      </Field>
      <Field label={t('loan.field.term')} testId="loan-term">
        <input
          type="number"
          className="ui-field-input"
          value={termYears}
          step="1"
          onChange={(e) => onTermYears(e.target.value)}
          data-testid="loan-term-input"
        />
      </Field>
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

function EqualPaymentView({
  principal,
  rate,
  termMonths,
  monthly,
  schedule,
  t,
}: {
  principal: number;
  rate: number;
  termMonths: number;
  monthly: number;
  schedule: ReturnType<typeof buildSchedule>;
  t(key: string, vars?: Record<string, string | number>): string;
}) {
  return (
    <>
      <Panel testId="loan-equal-result">
        <span className="ui-result-secondary">{t('loan.result.monthly')}</span>
        <div className="ui-result-primary" data-testid="loan-equal-monthly">
          {formatCNY(monthly)}
        </div>
        <div className="ui-result-secondary" style={{ marginTop: 'var(--s-1)' }}>
          {t('loan.result.summary', {
            total: formatCNY(schedule.totalPayment),
            interest: formatCNY(schedule.totalInterest),
            apr: formatPercent(schedule.effectiveAnnualRate),
          })}
        </div>
      </Panel>
      <Panel testId="loan-equal-detail">
        <span className="ui-panel-label">{t('loan.detail.title')}</span>
        <table style={tableStyle}>
          <tbody>
            <tr><td>{t('loan.field.principal')}</td><td style={tdRight}>{formatCNY(principal)}</td></tr>
            <tr><td>{t('loan.field.rate')}</td><td style={tdRight}>{rate.toFixed(2)}%</td></tr>
            <tr><td>{t('loan.field.term')}</td><td style={tdRight}>{formatMonths(termMonths)}</td></tr>
            <tr><td>{t('loan.detail.total')}</td><td style={tdRight}>{formatCNY(schedule.totalPayment)}</td></tr>
            <tr><td>{t('loan.detail.interest')}</td><td style={tdRight}>{formatCNY(schedule.totalInterest)}</td></tr>
            <tr><td>{t('loan.detail.apr')}</td><td style={tdRight}>{formatPercent(schedule.effectiveAnnualRate)}</td></tr>
          </tbody>
        </table>
      </Panel>
    </>
  );
}

function EqualPrincipalView({
  principal,
  rate,
  termMonths,
  preview,
  t,
}: {
  principal: number;
  rate: number;
  termMonths: number;
  preview: { month: number; payment: number }[];
  t(key: string, vars?: Record<string, string | number>): string;
}) {
  // ponytail: equal-principal total = principal + Σ(remaining * r). We can
  // compute the closed form: totalInterest = principal * r * (n+1) / 2.
  const r = rate / 100 / 12;
  const totalInterest = principal * r * (termMonths + 1) / 2;
  const totalPayment = principal + totalInterest;
  return (
    <>
      <Panel testId="loan-principal-result">
        <span className="ui-result-secondary">{t('loan.result.firstMonth')}</span>
        <div className="ui-result-primary" data-testid="loan-principal-first">
          {preview[0] ? formatCNY(preview[0].payment) : '—'}
        </div>
        <div className="ui-result-secondary" style={{ marginTop: 'var(--s-1)' }}>
          {t('loan.result.summary', {
            total: formatCNY(totalPayment),
            interest: formatCNY(totalInterest),
            apr: formatPercent(r * 12),
          })}
        </div>
      </Panel>
      <Panel testId="loan-principal-detail">
        <span className="ui-panel-label">{t('loan.detail.firstYear')}</span>
        <table style={tableStyle}>
          <tbody>
            {preview.map((row) => (
              <tr key={row.month}>
                <td>{t('loan.field.month', { n: row.month })}</td>
                <td style={tdRight}>{formatCNY(row.payment)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  );
}

function IrrView({
  principal,
  receivedPrincipal,
  rate,
  termYears,
  monthly,
  implied,
  onReceivedPrincipal,
  onPrincipal,
  onRate,
  onTermYears,
  t,
}: {
  principal: string;
  receivedPrincipal: string;
  rate: string;
  termYears: string;
  monthly: number;
  implied: number | null;
  onReceivedPrincipal(v: string): void;
  onPrincipal(v: string): void;
  onRate(v: string): void;
  onTermYears(v: string): void;
  t(key: string, vars?: Record<string, string | number>): string;
}) {
  const impliedDisplay = implied === null ? '—' : formatPercent(implied);
  const fee = (Number(principal) || 0) - (Number(receivedPrincipal) || 0);
  const isHaircut = fee > 0.5;
  return (
    <>
      <SharedFields
        principal={principal}
        rate={rate}
        termYears={termYears}
        onPrincipal={onPrincipal}
        onRate={onRate}
        onTermYears={onTermYears}
        t={t}
      />
      <Field label={t('loan.field.received')} testId="loan-received">
        <input
          type="number"
          className="ui-field-input"
          value={receivedPrincipal}
          step="any"
          onChange={(e) => onReceivedPrincipal(e.target.value)}
          data-testid="loan-received-input"
        />
      </Field>
      <Panel testId="loan-irr-result">
        <span className="ui-result-secondary">{t('loan.result.impliedApr')}</span>
        <div className="ui-result-primary" data-testid="loan-irr-apr">
          {impliedDisplay}
        </div>
        <div className="ui-result-secondary" style={{ marginTop: 'var(--s-1)' }}>
          {t('loan.result.irrSummary', {
            monthly: formatCNY(monthly),
            fee: formatCNY(Math.max(0, fee)),
          })}
        </div>
      </Panel>
      {isHaircut && (
        <Panel testId="loan-irr-warning" variant="danger">
          <span style={{ fontSize: 13 }}>{t('loan.warn.haircut', { fee: formatCNY(fee) })}</span>
        </Panel>
      )}
    </>
  );
}

function PrepayView({
  base,
  prepay,
  prepayAmount,
  prepayAtMonth,
  prepayStrategy,
  onPrepayAmount,
  onPrepayAtMonth,
  onPrepayStrategy,
  t,
  shared,
}: {
  base: ReturnType<typeof buildSchedule>;
  prepay: ReturnType<typeof buildSchedule>;
  prepayAmount: string;
  prepayAtMonth: string;
  prepayStrategy: PrepayStrategy;
  onPrepayAmount(v: string): void;
  onPrepayAtMonth(v: string): void;
  onPrepayStrategy(s: PrepayStrategy): void;
  t(key: string, vars?: Record<string, string | number>): string;
  shared: React.ReactNode;
}) {
  const savedInterest = base.totalInterest - prepay.totalInterest;
  const savedMonths = base.effectiveTermMonths - prepay.effectiveTermMonths;
  return (
    <>
      {shared}
      <Field label={t('loan.field.prepayAmount')} testId="loan-prepay-amount">
        <input
          type="number"
          className="ui-field-input"
          value={prepayAmount}
          step="any"
          onChange={(e) => onPrepayAmount(e.target.value)}
          data-testid="loan-prepay-amount-input"
        />
      </Field>
      <Field label={t('loan.field.prepayMonth')} testId="loan-prepay-month">
        <input
          type="number"
          className="ui-field-input"
          value={prepayAtMonth}
          step="1"
          onChange={(e) => onPrepayAtMonth(e.target.value)}
          data-testid="loan-prepay-month-input"
        />
      </Field>
      <ChipSegment role="radiogroup" ariaLabel="Prepay strategy" layout="fill" shape="card">
        <Chip
          active={prepayStrategy === 'shorten-term'}
          onClick={() => onPrepayStrategy('shorten-term')}
          role="radio"
          fill
        >
          {t('loan.prepay.shorten')}
        </Chip>
        <Chip
          active={prepayStrategy === 'reduce-payment'}
          onClick={() => onPrepayStrategy('reduce-payment')}
          role="radio"
          fill
        >
          {t('loan.prepay.reduce')}
        </Chip>
      </ChipSegment>
      <Panel testId="loan-prepay-result">
        <span className="ui-result-secondary">{t('loan.result.prepaySave')}</span>
        <div className="ui-result-primary" data-testid="loan-prepay-saved">
          {formatCNY(Math.max(0, savedInterest))}
        </div>
        <div className="ui-result-secondary" style={{ marginTop: 'var(--s-1)' }}>
          {t('loan.result.prepayTermDelta', {
            delta: formatMonths(Math.max(0, savedMonths)),
            newTerm: formatMonths(prepay.effectiveTermMonths),
          })}
        </div>
      </Panel>
    </>
  );
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 14,
  marginTop: 'var(--s-1)',
};

const tdRight: React.CSSProperties = {
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
  fontWeight: 500,
};