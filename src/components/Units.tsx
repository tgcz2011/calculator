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

type CatId = CategoryDef['id'];

export function Units() {
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
      <div role="tablist" aria-label="Unit category" style={subTabsStyle}>
        {CATEGORIES.map((c) => (
          <SubTab key={c.id} active={categoryId === c.id} onClick={() => switchCategory(c.id)}>
            {c.label}
          </SubTab>
        ))}
      </div>

      {category.id === 'currency' && (
        <div style={stampStyle} data-testid="currency-snapshot">
          快照汇率 · 更新于 {formatStamp(CURRENCY_UPDATED_AT)} · 离线可用
        </div>
      )}

      <AmountField
        label="数值"
        value={amount}
        onChange={setAmount}
        testId="units-amount"
      />

      <div style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <UnitPicker
            label="从"
            units={category.units}
            value={from}
            onChange={setFrom}
            testId="units-from"
          />
        </div>
        <button
          type="button"
          onClick={swap}
          aria-label="互换单位"
          data-testid="units-swap"
          style={swapBtnStyle}
        >
          {'\u21C4'}
        </button>
        <div style={{ flex: 1 }}>
          <UnitPicker
            label="到"
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
    <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-1)' }}>
      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-secondary)' }}>{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        step="any"
        data-testid={testId}
        style={inputStyle}
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
    <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-1)' }}>
      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-secondary)' }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
        style={{ ...inputStyle, appearance: 'none', paddingRight: 'var(--s-6)' }}
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
  if (error) {
    return (
      <div
        data-testid="units-result"
        data-error-code={errorCode}
        style={{
          padding: 'var(--s-4)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--danger-soft)',
          color: 'var(--danger)',
          fontSize: 16,
          fontWeight: 500,
        }}
      >
        <span className="error-glyph" data-error-code={errorCode} aria-hidden style={glyphInlineStyle} />
        {error}
      </div>
    );
  }
  return (
    <div
      data-testid="units-result"
      style={{
        padding: 'var(--s-4)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--bg-elevated)',
        boxShadow: 'var(--shadow)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--s-1)',
      }}
    >
      <span style={{ fontSize: 13, color: 'var(--fg-tertiary)', fontWeight: 500 }}>结果</span>
      <span
        data-testid="units-result-value"
        style={{
          fontSize: 32,
          fontWeight: 300,
          letterSpacing: '-0.02em',
          color: 'var(--fg)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value || '\u00a0'} <span style={{ fontSize: 18, color: 'var(--fg-tertiary)' }}>{symbol}</span>
      </span>
    </div>
  );
}

function SubTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick(): void;
  children: React.ReactNode;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: '8px 0',
        borderRadius: 'var(--radius-md)',
        fontSize: 13,
        fontWeight: 600,
        background: active ? 'var(--text)' : 'transparent',
        color: active ? 'var(--bg-elevated)' : 'var(--fg)',
        transition: 'background-color var(--dur) var(--ease-apple), color var(--dur) var(--ease-apple)',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

function formatStamp(iso: string): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

const subTabsStyle: CSSProperties = {
  display: 'flex',
  background: 'var(--key-fn-bg)',
  borderRadius: 'var(--radius-md)',
  padding: 4,
  gap: 2,
  overflowX: 'auto',
};

const stampStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--fg-tertiary)',
  textAlign: 'center',
  padding: 'var(--s-1) var(--s-2)',
};

const inputStyle: CSSProperties = {
  width: '100%',
  padding: 'var(--s-3)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--hairline)',
  color: 'var(--fg)',
  fontSize: 16,
  fontFamily: 'inherit',
};

const swapBtnStyle: CSSProperties = {
  width: 36,
  height: 36,
  alignSelf: 'flex-end',
  marginBottom: 2,
  borderRadius: 'var(--radius-full)',
  background: 'var(--key-fn-bg)',
  color: 'var(--key-fn-fg)',
  fontSize: 16,
  fontWeight: 600,
};

const glyphInlineStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '1.6em',
  height: '1.6em',
  marginRight: '0.4em',
  borderRadius: '9999px',
  background: 'var(--danger)',
  color: '#fff',
  fontSize: '0.8em',
  fontWeight: 700,
  verticalAlign: 'middle',
};