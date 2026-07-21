// Chemical equation balancer UI (scheme A: pure text input).
// One input + one "Balance" button. Result shows the balanced equation with
// coefficients highlighted, an atom-conservation table, and a charge-balance
// row when ions are present. Example reactions fill the input on tap.
//
// ponytail: self-contained state (no useCalculator reducer) - the chemistry
// path is its own sub-module, not routed through engine.evaluate(). Mirrors
// Programmer.tsx's self-contained pattern.

import { type CSSProperties, type ReactNode, useCallback, useState } from 'react';
import { balanceReaction, type BalanceResult } from '../chemistry/balancer';
import { useI18n } from '../hooks/useI18n';
import { Chip, ChipSegment } from './Chip';
import { Panel, PanelLabel, Pill } from './Panel';

const EXAMPLES: string[] = [
  'H2 + O2 -> H2O',
  'C3H8 + O2 -> CO2 + H2O',
  'Ca(OH)2 + HCl -> CaCl2 + H2O',
  'Fe2+ + Cu -> Fe + Cu2+',
  'CuSO4·5H2O -> CuSO4 + H2O',
  'KMnO4 + HCl -> KCl + MnCl2 + H2O + Cl2',
];

export function ChemBalancer() {
  const { t } = useI18n();
  const [input, setInput] = useState('');
  const [result, setResult] = useState<BalanceResult | null>(null);

  const run = useCallback((expr: string) => {
    setInput(expr);
    setResult(balanceReaction(expr));
  }, []);

  const onBalance = useCallback(() => setResult(balanceReaction(input)), [input]);
  const onClear = useCallback(() => {
    setInput('');
    setResult(null);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onBalance();
    }
  };

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
      data-testid="chem-mode"
    >
      <label className="ui-field">
        <span className="ui-field-label">{t('chem.input.label')}</span>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t('chem.input.placeholder')}
          data-testid="chem-input"
          className="ui-field-input"
          style={{ fontFamily: 'var(--font-mono)' }}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </label>

      <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
        <Pill onClick={onBalance} testId="chem-balance" ariaLabel={t('chem.balance')}>
          {t('chem.balance')}
        </Pill>
        <Pill onClick={onClear} testId="chem-clear" ariaLabel={t('chem.clear')}>
          {t('chem.clear')}
        </Pill>
      </div>

      <div>
        <PanelLabel>{t('chem.examples')}</PanelLabel>
        <ChipSegment ariaLabel={t('chem.examples')} layout="fill" shape="card" testId="chem-examples">
          {EXAMPLES.map((ex, i) => (
            <Chip
              key={i}
              active={false}
              onClick={() => run(ex)}
              testId={`chem-example-${i}`}
              fill
            >
              {ex}
            </Chip>
          ))}
        </ChipSegment>
      </div>

      {result && (
        <ResultView result={result} t={t} />
      )}
    </div>
  );
}

function ResultView({ result, t }: { result: BalanceResult; t: (k: string, v?: Record<string, string | number>) => string }) {
  if (!result.ok) {
    return (
      <div
        className="ui-panel"
        data-variant="danger"
        data-testid="chem-result"
        data-error-code={result.errorCode}
      >
        <span>{result.error}</span>
      </div>
    );
  }
  return (
    <>
      <Panel testId="chem-result">
        <PanelLabel>{t('chem.result.title')}</PanelLabel>
        <div
          className="ui-result-primary"
          data-testid="chem-equation"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'baseline',
            gap: 'var(--s-2)',
            fontSize: 'clamp(18px, 4.5vw, 26px)',
            lineHeight: 1.4,
          }}
        >
          {renderEquation(result)}
        </div>
      </Panel>

      <Panel testId="chem-conservation">
        <PanelLabel>{t('chem.conservation.title')}</PanelLabel>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>{t('chem.conservation.element')}</th>
              <th style={thStyle}>{t('chem.conservation.reactants')}</th>
              <th style={thStyle}>{t('chem.conservation.products')}</th>
              <th style={thStyle}>{''}</th>
            </tr>
          </thead>
          <tbody>
            {result.conservation!.map((row) => (
              <tr key={row.element} data-element={row.element}>
                <td style={tdStyle}>{row.element}</td>
                <td style={tdNumStyle}>{row.reactants}</td>
                <td style={tdNumStyle}>{row.products}</td>
                <td style={tdOkStyle} data-ok={row.balanced}>{row.balanced ? '✓' : '✗'}</td>
              </tr>
            ))}
            {result.chargeBalance && (
              <tr data-element="charge">
                <td style={tdStyle}>{t('chem.charge')}</td>
                <td style={tdNumStyle}>{formatCharge(result.chargeBalance.reactants)}</td>
                <td style={tdNumStyle}>{formatCharge(result.chargeBalance.products)}</td>
                <td style={tdOkStyle} data-ok={result.chargeBalance.balanced}>{result.chargeBalance.balanced ? '✓' : '✗'}</td>
              </tr>
            )}
          </tbody>
        </table>
      </Panel>
    </>
  );
}

function renderEquation(result: BalanceResult): ReactNode[] {
  const nodes: ReactNode[] = [];
  let key = 0;
  const comps = result.compounds!;
  // Split reactants / products preserving order.
  const reactants = comps.filter((c) => c.isReactant);
  const products = comps.filter((c) => !c.isReactant);
  const pushCompound = (c: typeof comps[number]) => {
    if (c.coefficient !== 1) {
      nodes.push(
        <span key={key++} style={coeffStyle} data-coefficient={c.coefficient}>
          {c.coefficient}
        </span>,
      );
    }
    nodes.push(<span key={key++} style={formulaStyle}>{renderFormula(c.displayFormula)}</span>);
  };
  reactants.forEach((c, i) => {
    if (i > 0) nodes.push(<span key={key++} style={sepStyle}>{' + '}</span>);
    pushCompound(c);
  });
  nodes.push(<span key={key++} style={arrowStyle}>{` ${result.arrow} `}</span>);
  products.forEach((c, i) => {
    if (i > 0) nodes.push(<span key={key++} style={sepStyle}>{' + '}</span>);
    pushCompound(c);
  });
  return nodes;
}

/** Render a formula string with proper subscripts (atom counts) and
 *  superscripts (charges). Hydrate multipliers stay normal-size. */
function renderFormula(formula: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let i = 0;
  let key = 0;
  const push = (node: ReactNode) => nodes.push(<span key={key++}>{node}</span>);
  while (i < formula.length) {
    const ch = formula[i];
    if (/[A-Z]/.test(ch)) {
      let el = ch;
      i++;
      while (i < formula.length && /[a-z]/.test(formula[i])) {
        el += formula[i];
        i++;
      }
      let num = '';
      while (i < formula.length && /[0-9]/.test(formula[i])) {
        num += formula[i];
        i++;
      }
      push(num ? <>{el}<sub>{num}</sub></> : el);
    } else if (ch === ')' || ch === ']') {
      push(ch);
      i++;
      let num = '';
      while (i < formula.length && /[0-9]/.test(formula[i])) {
        num += formula[i];
        i++;
      }
      if (num) push(<sub>{num}</sub>);
    } else if (ch === '(' || ch === '[') {
      push(ch);
      i++;
    } else if (ch === '·' || ch === '⋅' || ch === '∙' || ch === '.') {
      push('·');
      i++;
      let num = '';
      while (i < formula.length && /[0-9]/.test(formula[i])) {
        num += formula[i];
        i++;
      }
      if (num) push(num);
    } else if (ch === '^') {
      i++;
      let num = '';
      while (i < formula.length && /[0-9]/.test(formula[i])) {
        num += formula[i];
        i++;
      }
      const sign = formula[i] === '+' || formula[i] === '-' ? formula[i] : '';
      if (sign) i++;
      const txt = (num || '1') + sign;
      push(<sup>{txt}</sup>);
    } else {
      push(ch);
      i++;
    }
  }
  return nodes;
}

function formatCharge(q: number): string {
  if (q === 0) return '0';
  const sign = q > 0 ? '+' : '-';
  const m = Math.abs(q);
  return m === 1 ? sign : `${m}${sign}`;
}

const coeffStyle: CSSProperties = {
  color: 'var(--accent)',
  fontWeight: 700,
  marginRight: 4,
  fontVariantNumeric: 'tabular-nums',
};

const formulaStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
};

const sepStyle: CSSProperties = {
  color: 'var(--text-tertiary)',
};

const arrowStyle: CSSProperties = {
  color: 'var(--accent)',
  fontWeight: 600,
};

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 14,
  fontFamily: 'var(--font-mono)',
};

const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: 'var(--s-1) var(--s-2)',
  color: 'var(--text-tertiary)',
  fontWeight: 600,
  fontSize: 12,
  borderBottom: '0.5px solid var(--hairline)',
};

const tdStyle: CSSProperties = {
  padding: 'var(--s-1) var(--s-2)',
  borderBottom: '0.5px solid var(--hairline)',
};

const tdNumStyle: CSSProperties = {
  ...tdStyle,
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
};

const tdOkStyle: CSSProperties = {
  ...tdStyle,
  textAlign: 'center',
  color: 'var(--accent)',
  fontWeight: 700,
};
