// Units + currency mode. One amount input + From/To dropdowns per category.
// Category tabs across the top. Currency sub-view shows the snapshot timestamp
// + source prominently so users know which feed (live API / cache / bundled)
// the rates came from. A "refresh" button triggers fetchLiveRates().
//
// ponytail: one input + two dropdowns + display, instead of two inputs the user
// has to retype. Tap swap to flip from/to. Inputs are controlled; result
// recomputes on every change (cheap, math.js unit math is <1ms).

import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import {
  CATEGORIES,
  getCurrencyUpdatedAt,
  getCurrencySource,
  convertUnits,
  fetchLiveRates,
  formatStamp,
  sourceLabel,
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
  // ponytail (TGC-22, module 1): live rates. State lives here, not in the
  // engine, because the engine has no React reactivity. Bumping `ratesTick`
  // after setLiveRates() forces the UnitsResult memo to re-run against the
  // updated CURRENCY_RATES reference.
  const [ratesTick, setRatesTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshErr, setRefreshErr] = useState('');

  // ponytail: kick off a live fetch when the user opens the currency tab.
  // Silent (no spinner) if the in-memory or LocalStorage cache is fresh; only
  // shows the refresh button if a network round-trip actually happens.
  useEffect(() => {
    if (categoryId !== 'currency') return;
    let cancelled = false;
    void (async () => {
      try {
        await fetchLiveRates(false);
        if (!cancelled) setRatesTick((t) => t + 1);
      } catch {
        // network error — already falls back to cache / bundled inside the engine
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [categoryId]);

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

  // The `void ratesTick` keeps the memo dependency list honest so changing the
  // rates forces a re-eval. Without it the memo would only re-run when amount /
  // from / to change, and stale rates would stay cached on screen.
  const result = useMemo(() => {
    void ratesTick;
    return convertUnits(amount, category, from, to);
  }, [amount, category, from, to, ratesTick]);

  async function onRefresh() {
    setRefreshing(true);
    setRefreshErr('');
    try {
      const payload = await fetchLiveRates(true);
      setRatesTick((t) => t + 1);
      if (payload.source === 'cache' || payload.source === 'bundled') {
        setRefreshErr(t('units.currency.refreshOffline'));
      }
    } catch (e) {
      setRefreshErr(t('units.currency.refreshError'));
    } finally {
      setRefreshing(false);
    }
  }

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
        <div style={stampRowStyle} data-testid="currency-snapshot">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              {t('units.currency.snapshot', { date: formatStamp(getCurrencyUpdatedAt()) })}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }} data-testid="currency-source">
              {t('units.currency.source', { source: sourceLabel(getCurrencySource()) })}
            </span>
            {refreshErr && (
              <span style={{ fontSize: 11, color: 'var(--danger)' }} data-testid="currency-refresh-error">
                {refreshErr}
              </span>
            )}
          </div>
          <Pill
            size="md"
            onClick={onRefresh}
            ariaLabel={t('units.currency.refresh')}
            testId="currency-refresh"
          >
            <span aria-hidden style={{ fontSize: 14, opacity: refreshing ? 0.5 : 1 }}>
              {refreshing ? '⌛︎' : '\u21BB'}
            </span>
            <span>{t('units.currency.refresh')}</span>
          </Pill>
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

const stampRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--s-2)',
  fontSize: 12,
  color: 'var(--text-tertiary)',
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