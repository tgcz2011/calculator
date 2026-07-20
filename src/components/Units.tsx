// Units + currency mode. One amount input + From/To dropdowns per category.
// Category tabs across the top. Currency sub-view shows the snapshot timestamp
// prominently so users know rates aren't live.
//
// ponytail: one input + two dropdowns + display, instead of two inputs the user
// has to retype. Tap swap to flip from/to. Inputs are controlled; result
// recomputes on every change (cheap, math.js unit math is <1ms).

import { type CSSProperties, useMemo, useState } from 'react';
import {
  CATEGORIES,
  CURRENCY_UPDATED_AT,
  convertUnits,
  type CategoryDef,
  type UnitDef,
} from '../units/engine';
import { useI18n } from '../hooks/useI18n';
import { Chip, ChipSegment } from './Chip';
import { Panel, PanelLabel, Pill } from './Panel';

type CatId = CategoryDef['id'];

export function Units() {
  const { t } = useI18n();
  const [categoryId, setCategoryId] = useState<CatId>('length');
  const [amount, setAmount] = useState('1');
  const [from, setFrom] = useState<string>('km');
  const [to, setTo] = useState<string>('m');

  const category = useMemo(
    () => CATEGORIES.find((c) => c.id === categoryId) ?? CATEGORIES[0],
    [categoryId],
  );

  // When switching category, reset from/to to first two units of that category.
  function switchCategory(id: CatId) {
    setCategoryId(id);
    const cat = CATEGORIES.find((c) => c.id === id);
    if (cat && cat.units.length >= 1) {
      setFrom(cat.units[0].symbol);
      setTo(cat.units[1]?.symbol ?? cat.units[0].symbol);
    }
  }

  function swap() {
    setFrom(to);
    setTo(from);
  }

  const result = useMemo(
    () => convertUnits(amount, category, from, to),
    [amount, category, from, to],
  );

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
      data-testid="units-mode"
    >
      <ChipSegment role="tablist" ariaLabel="Unit category" layout="fill" shape="card">
        {CATEGORIES.map((c) => (
          <Chip key={c.id} active={categoryId === c.id} onClick={() => switchCategory(c.id)} fill>
            {c.label}
          </Chip>
        ))}
      </ChipSegment>

      {category.id === 'currency' && (
        <div style={stampStyle} data-testid="currency-snapshot">
          {t('units.currency.snapshot', { date: formatStamp(CURRENCY_UPDATED_AT) })}
        </div>
      )}

      <AmountField
        label={t('units.amount')}
        value={amount}
        onChange={setAmount}
        testId="units-amount"
      />

      <div style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <UnitPicker
            label={t('units.from')}
            units={category.units}
            value={from}
            onChange={setFrom}
            testId="units-from"
          />
        </div>
        <Pill
          size="md"
          onClick={swap}
          ariaLabel={t('units.swap')}
          testId="units-swap"
        >
          {'\u21C4'}
        </Pill>
        <div style={{ flex: 1 }}>
          <UnitPicker
            label={t('units.to')}
            units={category.units}
            value={to}
            onChange={setTo}
            testId="units-to"
          />
        </div>
      </div>

      <ResultCard
        value={result.value}
        symbol={result.symbol}
        error={result.error}
        errorCode={result.errorCode}
      />
    </div>
  );
}

function AmountField({
  label,
  value,
  onChange,
  testId,
}: {
  label: string;
  value: string;
  onChange(v: string): void;
  testId: string;
}) {
  return (
    <label className="ui-field">
      <span className="ui-field-label">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        step="any"
        data-testid={testId}
        className="ui-field-input"
      />
    </label>
  );
}

function UnitPicker({
  label,
  units,
  value,
  onChange,
  testId,
}: {
  label: string;
  units: readonly UnitDef[];
  value: string;
  onChange(v: string): void;
  testId: string;
}) {
  return (
    <label className="ui-field">
      <span className="ui-field-label">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
        className="ui-field-input"
        style={{ appearance: 'none', paddingRight: 'var(--s-6)' }}
      >
        {units.map((u) => (
          <option key={u.symbol} value={u.symbol}>
            {u.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ResultCard({
  value,
  symbol,
  error,
  errorCode,
}: {
  value: string;
  symbol: string;
  error?: string;
  errorCode?: string;
}) {
  const { t } = useI18n();
  if (error) {
    return (
      <Panel testId="units-result" variant="danger">
        <span className="error-glyph" data-error-code={errorCode} aria-hidden style={glyphInlineStyle} />
        {error}
      </Panel>
    );
  }
  return (
    <Panel testId="units-result">
      <PanelLabel>{t('units.result')}</PanelLabel>
      <span
        data-testid="units-result-value"
        className="ui-result-primary"
        style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--s-2)' }}
      >
        {value || '\u00a0'}
        <span style={{ fontSize: 18, color: 'var(--text-tertiary)' }}>{symbol}</span>
      </span>
    </Panel>
  );
}

function formatStamp(iso: string): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

const stampStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--text-tertiary)',
  textAlign: 'center',
  padding: 'var(--s-1) var(--s-2)',
};

const glyphInlineStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '1.6em',
  height: '1.6em',
  marginRight: '0.4em',
  borderRadius: 'var(--radius-full)',
  background: 'var(--danger)',
  color: '#fff',
  fontSize: '0.8em',
  fontWeight: 700,
  verticalAlign: 'middle',
};