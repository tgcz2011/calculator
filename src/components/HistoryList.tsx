import { useMemo } from 'react';
import { history } from '../history/api';

import type { Mode } from '../state/useCalculator';

const HISTORY_SCOPE_PREFIX = '\u2063calc:';

type CalculatorMode = Exclude<Mode, 'history'>;

interface Props {
  bump: number;
  mode: CalculatorMode;
  onRecall(expression: string, result: string): void;
  onClear(): void;
  t(key: string): string;
}

export function HistoryList({ bump, mode, onRecall, onClear, t }: Props) {
  const items = useMemo(() => {
    void bump;
    return history.list().flatMap((entry) => {
      if (!entry.expression.startsWith(HISTORY_SCOPE_PREFIX)) {
        return mode === 'basic' ? [entry] : [];
      }
      const prefix = `${HISTORY_SCOPE_PREFIX}${mode}\u2063`;
      return entry.expression.startsWith(prefix)
        ? [{ ...entry, expression: entry.expression.slice(prefix.length) }]
        : [];
    });
  }, [bump, mode]);

  if (!items.length) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-tertiary)',
          padding: 'var(--s-6)',
          gap: 'var(--s-2)',
        }}
      >
        <div style={{ fontSize: 48, opacity: 0.5 }} aria-hidden>
          ⌛︎
        </div>
        <div style={{ fontSize: 15 }}>{t('history.empty.title')}</div>
        <div style={{ fontSize: 13 }}>{t('history.empty.desc')}</div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: 'var(--s-2) var(--s-4)',
        }}
      >
        <span
          data-testid="history-section-title"
          style={{ fontSize: 13, color: 'var(--text-tertiary)', fontWeight: 600, letterSpacing: '0.04em' }}
        >
          {t('mode.history').toUpperCase()}
        </span>
        <button
          type="button"
          onClick={onClear}
          style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 500 }}
        >
          {t('history.clear')}
        </button>
      </div>
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: '0 var(--s-4) var(--s-4)',
          overflow: 'auto',
          flex: 1,
        }}
      >
        {items.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => onRecall(e.expression, e.result)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                width: '100%',
                padding: 'var(--s-3) 0',
                borderBottom: '0.5px solid var(--hairline)',
                gap: 'var(--s-1)',
              }}
            >
              <span
                style={{
                  color: 'var(--text-secondary)',
                  fontSize: 17,
                  textAlign: 'right',
                  overflowWrap: 'break-word',
                  wordBreak: 'break-all',
                }}
              >
                {e.expression}
              </span>
              <span
                style={{
                  color: 'var(--text-tertiary)',
                  fontSize: 28,
                  fontWeight: 300,
                  letterSpacing: '-0.02em',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                = {e.result}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}