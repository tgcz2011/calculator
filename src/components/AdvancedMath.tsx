// Advanced mathematics calculator (高等数学计算器).
// Seven sub-tabs: 解方程 / 求导 / 积分 / 极限 / 级数 / 矩阵 / 逻辑.
// Symbolic work uses mathjs CAS (derivative, simplify via 500ms-timeout
// worker, parse().toTex()); integrate / limit / solve / taylor / rref are not
// in mathjs 14 and are filled with focused numeric / derivative-based methods.
// Results render with KaTeX. Unsupported cases are marked "暂不支持".
//
// ponytail: self-contained state per tab (mirrors Programmer.tsx) - the
// advanced path is its own sub-module, not routed through engine.evaluate().

import { type CSSProperties, type ReactNode, useCallback, useState } from 'react';
import {
  derivativeAsync, matrixOperation, numericIntegral, numericLimit, numericRoots,
  renderKatex, simplifyAsync, taylorSeries, truthTable,
  type CasResult, type MatrixOp, type MatrixResult, type TruthTable,
} from '../advanced/cas';
import { useI18n } from '../hooks/useI18n';
import { Chip, ChipSegment } from './Chip';
import { Panel, PanelLabel, Pill } from './Panel';
import 'katex/dist/katex.min.css';

type TabId = 'solve' | 'deriv' | 'integral' | 'limit' | 'series' | 'matrix' | 'logic';

const TABS: { id: TabId; labelKey: string }[] = [
  { id: 'solve', labelKey: 'adv.tab.solve' },
  { id: 'deriv', labelKey: 'adv.tab.deriv' },
  { id: 'integral', labelKey: 'adv.tab.integral' },
  { id: 'limit', labelKey: 'adv.tab.limit' },
  { id: 'series', labelKey: 'adv.tab.series' },
  { id: 'matrix', labelKey: 'adv.tab.matrix' },
  { id: 'logic', labelKey: 'adv.tab.logic' },
];

export function AdvancedMath() {
  const { t } = useI18n();
  const [tab, setTab] = useState<TabId>('deriv');

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
      data-testid="adv-mode"
    >
      <ChipSegment role="tablist" ariaLabel="Advanced math sub-mode" layout="fill" shape="card" testId="adv-tabs">
        {TABS.map((tb) => (
          <Chip key={tb.id} active={tab === tb.id} onClick={() => setTab(tb.id)} testId={`adv-tab-${tb.id}`} fill>
            {t(tb.labelKey)}
          </Chip>
        ))}
      </ChipSegment>

      {tab === 'solve' && <SolveTab t={t} />}
      {tab === 'deriv' && <DerivTab t={t} />}
      {tab === 'integral' && <IntegralTab t={t} />}
      {tab === 'limit' && <LimitTab t={t} />}
      {tab === 'series' && <SeriesTab t={t} />}
      {tab === 'matrix' && <MatrixTab t={t} />}
      {tab === 'logic' && <LogicTab t={t} />}
    </div>
  );
}

type T = (k: string, v?: Record<string, string | number>) => string;

// --- shared bits ---

function Field({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return (
    <label className="ui-field" data-testid={testId}>
      <span className="ui-field-label">{label}</span>
      {children}
    </label>
  );
}

function TextInput(props: { value: string; onChange: (v: string) => void; onEnter?: () => void; placeholder?: string; testId: string; mono?: boolean }) {
  const { value, onChange, onEnter, placeholder, testId, mono } = props;
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter' && onEnter) { e.preventDefault(); onEnter(); } }}
      placeholder={placeholder}
      data-testid={testId}
      className="ui-field-input"
      style={mono ? { fontFamily: 'var(--font-mono)' } : undefined}
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
    />
  );
}

function Katex({ tex, testId }: { tex: string; testId?: string }) {
  const html = renderKatex(tex, true);
  return <div data-testid={testId} dangerouslySetInnerHTML={{ __html: html }} />;
}

function ResultPanel({ result, t, testId = 'adv-result' }: { result: CasResult | null; t: T; testId?: string }) {
  if (!result) return null;
  if (!result.ok) {
    return (
      <div
        className="ui-panel"
        data-variant="danger"
        data-testid={testId}
        data-error-code={result.errorCode}
      >
        <span>{result.error}</span>
      </div>
    );
  }
  return (
    <Panel testId={testId}>
      <PanelLabel>{t('adv.result')}</PanelLabel>
      {/* data-text mirrors the plain-text result so e2e can assert on it
          without parsing KaTeX's rendered HTML (math minus signs etc.). */}
      <div data-testid="adv-result-text" data-text={result.text ?? ''}>
        {result.tex && <Katex tex={result.tex} />}
      </div>
      {result.note && <div style={noteStyle}>{result.note}</div>}
    </Panel>
  );
}

const noteStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--text-tertiary)',
  marginTop: 'var(--s-1)',
};

function ActionRow({ onCompute, onClear, t }: { onCompute: () => void; onClear: () => void; t: T }) {
  return (
    <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
      <Pill onClick={onCompute} testId="adv-compute" ariaLabel={t('adv.compute')}>{t('adv.compute')}</Pill>
      <Pill onClick={onClear} testId="adv-clear" ariaLabel={t('adv.clear')}>{t('adv.clear')}</Pill>
    </div>
  );
}

// --- 解方程 (numeric root finding) ---

function SolveTab({ t }: { t: T }) {
  const [expr, setExpr] = useState('x^2 - 4 = 0');
  const [variable, setVariable] = useState('x');
  const [lo, setLo] = useState('-100');
  const [hi, setHi] = useState('100');
  const [result, setResult] = useState<CasResult | null>(null);

  const compute = useCallback(() => {
    setResult(numericRoots(expr, variable || 'x', Number(lo), Number(hi)));
  }, [expr, variable, lo, hi]);

  const clear = useCallback(() => { setExpr(''); setResult(null); }, []);

  return (
    <>
      <Field label={t('adv.expr')} testId="adv-expr-field">
        <TextInput value={expr} onChange={setExpr} onEnter={compute} placeholder="x^2 - 4 = 0" testId="adv-expr" mono />
      </Field>
      <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
        <div style={{ flex: 1 }}>
          <Field label={t('adv.variable')}>
            <TextInput value={variable} onChange={setVariable} testId="adv-var" />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label={t('adv.lower')}>
            <TextInput value={lo} onChange={setLo} testId="adv-lo" />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label={t('adv.upper')}>
            <TextInput value={hi} onChange={setHi} testId="adv-hi" />
          </Field>
        </div>
      </div>
      <ActionRow onCompute={compute} onClear={clear} t={t} />
      <ResultPanel result={result} t={t} />
    </>
  );
}

// --- 求导 (derivative, async simplify with timeout) ---

function DerivTab({ t }: { t: T }) {
  const [expr, setExpr] = useState('x^3');
  const [variable, setVariable] = useState('x');
  const [order, setOrder] = useState('1');
  const [result, setResult] = useState<CasResult | null>(null);
  const [busy, setBusy] = useState(false);

  const compute = useCallback(async () => {
    setBusy(true);
    const r = await derivativeAsync(expr, variable || 'x', Math.max(1, Math.floor(Number(order) || 1)));
    setResult(r);
    setBusy(false);
  }, [expr, variable, order]);

  const clear = useCallback(() => { setExpr(''); setResult(null); }, []);

  return (
    <>
      <Field label={t('adv.expr')} testId="adv-expr-field">
        <TextInput value={expr} onChange={setExpr} onEnter={() => void compute()} placeholder="sin(x^2)" testId="adv-expr" mono />
      </Field>
      <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
        <div style={{ flex: 1 }}>
          <Field label={t('adv.variable')}>
            <TextInput value={variable} onChange={setVariable} testId="adv-var" />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label={t('adv.order')}>
            <TextInput value={order} onChange={setOrder} testId="adv-order" />
          </Field>
        </div>
      </div>
      <ActionRow onCompute={() => void compute()} onClear={clear} t={t} />
      {busy && <div style={noteStyle}>{t('adv.computing')}</div>}
      <ResultPanel result={result} t={t} />
    </>
  );
}

// --- 积分 (numeric definite integral) ---

function IntegralTab({ t }: { t: T }) {
  const [expr, setExpr] = useState('x^2');
  const [variable, setVariable] = useState('x');
  const [a, setA] = useState('0');
  const [b, setB] = useState('1');
  const [result, setResult] = useState<CasResult | null>(null);

  const compute = useCallback(() => {
    setResult(numericIntegral(expr, variable || 'x', Number(a), Number(b)));
  }, [expr, variable, a, b]);

  const clear = useCallback(() => { setExpr(''); setResult(null); }, []);

  return (
    <>
      <Field label={t('adv.expr')} testId="adv-expr-field">
        <TextInput value={expr} onChange={setExpr} onEnter={compute} placeholder="x^2" testId="adv-expr" mono />
      </Field>
      <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
        <div style={{ flex: 1 }}>
          <Field label={t('adv.variable')}>
            <TextInput value={variable} onChange={setVariable} testId="adv-var" />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label={t('adv.lower')}>
            <TextInput value={a} onChange={setA} testId="adv-a" />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label={t('adv.upper')}>
            <TextInput value={b} onChange={setB} testId="adv-b" />
          </Field>
        </div>
      </div>
      <ActionRow onCompute={compute} onClear={clear} t={t} />
      <ResultPanel result={result} t={t} />
    </>
  );
}

// --- 极限 (numeric limit) ---

function LimitTab({ t }: { t: T }) {
  const [expr, setExpr] = useState('sin(x)/x');
  const [variable, setVariable] = useState('x');
  const [point, setPoint] = useState('0');
  const [result, setResult] = useState<CasResult | null>(null);

  const compute = useCallback(() => {
    const p = point.trim();
    const pt: number | 'inf' | '-inf' = p === 'inf' || p === '∞' || p === 'infty' ? 'inf' : p === '-inf' || p === '-∞' ? '-inf' : Number(p);
    setResult(numericLimit(expr, variable || 'x', pt));
  }, [expr, variable, point]);

  const clear = useCallback(() => { setExpr(''); setResult(null); }, []);

  return (
    <>
      <Field label={t('adv.expr')} testId="adv-expr-field">
        <TextInput value={expr} onChange={setExpr} onEnter={compute} placeholder="sin(x)/x" testId="adv-expr" mono />
      </Field>
      <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
        <div style={{ flex: 1 }}>
          <Field label={t('adv.variable')}>
            <TextInput value={variable} onChange={setVariable} testId="adv-var" />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label={t('adv.point')}>
            <TextInput value={point} onChange={setPoint} testId="adv-point" placeholder="0 / inf / -inf" />
          </Field>
        </div>
      </div>
      <ActionRow onCompute={compute} onClear={clear} t={t} />
      <ResultPanel result={result} t={t} />
    </>
  );
}

// --- 级数 (Taylor series) ---

function SeriesTab({ t }: { t: T }) {
  const [expr, setExpr] = useState('e^x');
  const [variable, setVariable] = useState('x');
  const [point, setPoint] = useState('0');
  const [order, setOrder] = useState('5');
  const [result, setResult] = useState<CasResult | null>(null);

  const compute = useCallback(() => {
    setResult(taylorSeries(expr, variable || 'x', Number(point), Math.max(1, Math.floor(Number(order) || 5))));
  }, [expr, variable, point, order]);

  const clear = useCallback(() => { setExpr(''); setResult(null); }, []);

  return (
    <>
      <Field label={t('adv.expr')} testId="adv-expr-field">
        <TextInput value={expr} onChange={setExpr} onEnter={compute} placeholder="e^x" testId="adv-expr" mono />
      </Field>
      <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
        <div style={{ flex: 1 }}>
          <Field label={t('adv.variable')}>
            <TextInput value={variable} onChange={setVariable} testId="adv-var" />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label={t('adv.point')}>
            <TextInput value={point} onChange={setPoint} testId="adv-point" />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label={t('adv.order')}>
            <TextInput value={order} onChange={setOrder} testId="adv-order" />
          </Field>
        </div>
      </div>
      <ActionRow onCompute={compute} onClear={clear} t={t} />
      <ResultPanel result={result} t={t} />
    </>
  );
}

// --- 矩阵 (matrix operations) ---

const MATRIX_OPS: { id: MatrixOp; labelKey: string }[] = [
  { id: 'det', labelKey: 'adv.matrix.op.det' },
  { id: 'inv', labelKey: 'adv.matrix.op.inv' },
  { id: 'transpose', labelKey: 'adv.matrix.op.transpose' },
  { id: 'trace', labelKey: 'adv.matrix.op.trace' },
  { id: 'eigs', labelKey: 'adv.matrix.op.eigs' },
  { id: 'rref', labelKey: 'adv.matrix.op.rref' },
  { id: 'solve', labelKey: 'adv.matrix.op.solve' },
];

function MatrixTab({ t }: { t: T }) {
  const [matrix, setMatrix] = useState('1 2; 3 4');
  const [op, setOp] = useState<MatrixOp>('det');
  const [b, setB] = useState('5\n6');
  const [result, setResult] = useState<MatrixResult | null>(null);

  const compute = useCallback(() => {
    setResult(matrixOperation(op, matrix, op === 'solve' ? b : undefined));
  }, [op, matrix, b]);

  const clear = useCallback(() => { setMatrix(''); setResult(null); }, []);

  return (
    <>
      <Field label={t('adv.matrix')} testId="adv-expr-field">
        <textarea
          value={matrix}
          onChange={(e) => setMatrix(e.target.value)}
          placeholder={'1 2; 3 4'}
          data-testid="adv-matrix"
          className="ui-field-input"
          style={{ fontFamily: 'var(--font-mono)', minHeight: 64, resize: 'vertical' }}
        />
      </Field>
      <div>
        <PanelLabel>{t('adv.matrix.op')}</PanelLabel>
        <ChipSegment ariaLabel={t('adv.matrix.op')} layout="fill" shape="card" testId="adv-matrix-ops">
          {MATRIX_OPS.map((m) => (
            <Chip key={m.id} active={op === m.id} onClick={() => setOp(m.id)} testId={`adv-matrix-op-${m.id}`} fill>
              {t(m.labelKey)}
            </Chip>
          ))}
        </ChipSegment>
      </div>
      {op === 'solve' && (
        <Field label={t('adv.matrix.b')}>
          <textarea
            value={b}
            onChange={(e) => setB(e.target.value)}
            placeholder={'5\n6'}
            data-testid="adv-matrix-b"
            className="ui-field-input"
            style={{ fontFamily: 'var(--font-mono)', minHeight: 48, resize: 'vertical' }}
          />
        </Field>
      )}
      <ActionRow onCompute={compute} onClear={clear} t={t} />
      <ResultPanel result={result} t={t} />
      {result?.ok && result.eigenvectors && result.eigenvectors.length > 0 && (
        <Panel testId="adv-eigvec">
          <PanelLabel>{t('adv.matrix.eigvec')}</PanelLabel>
          {result.eigenvectors.map((ev, i) => (
            <div key={i} style={{ fontSize: 13, fontFamily: 'var(--font-mono)' }}>
              λ={ev.value} → [{ev.vector.map((v) => Math.round(v * 1e8) / 1e8).join(', ')}]
            </div>
          ))}
        </Panel>
      )}
    </>
  );
}

// --- 逻辑 (boolean truth table) ---

function LogicTab({ t }: { t: T }) {
  const [expr, setExpr] = useState('A and B');
  const [result, setResult] = useState<TruthTable | null>(null);

  const compute = useCallback(() => {
    setResult(truthTable(expr));
  }, [expr]);

  const clear = useCallback(() => { setExpr(''); setResult(null); }, []);

  return (
    <>
      <Field label={t('adv.expr')} testId="adv-expr-field">
        <TextInput value={expr} onChange={setExpr} onEnter={compute} placeholder="A and (B or not C)" testId="adv-expr" mono />
      </Field>
      <div style={noteStyle}>{t('adv.logic.hint')}</div>
      <ActionRow onCompute={compute} onClear={clear} t={t} />
      {result && !result.ok && (
        <div className="ui-panel" data-variant="danger" data-testid="adv-result" data-error-code={result.errorCode}>
          <span>{result.error}</span>
        </div>
      )}
      {result && result.ok && (
        <Panel testId="adv-result">
          <PanelLabel>{t('adv.result')}</PanelLabel>
          {result.tex && <Katex tex={result.tex} />}
          <TruthTableView tt={result} t={t} />
        </Panel>
      )}
    </>
  );
}

function TruthTableView({ tt, t }: { tt: TruthTable; t: T }) {
  if (tt.rows.length === 0) return null;
  return (
    <table style={tableStyle} data-testid="adv-truth-table">
      <thead>
        <tr>
          {tt.variables.map((v) => (
            <th key={v} style={thStyle}>{v}</th>
          ))}
          <th style={thStyle}>{t('adv.logic.result')}</th>
        </tr>
      </thead>
      <tbody>
        {tt.rows.map((row, i) => (
          <tr key={i}>
            {tt.variables.map((v) => (
              <td key={v} style={tdStyle}>{row.assignment[v] ? 'T' : 'F'}</td>
            ))}
            <td style={tdOkStyle} data-result={row.result ? 'T' : 'F'}>{row.result ? 'T' : 'F'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 14,
  fontFamily: 'var(--font-mono)',
  marginTop: 'var(--s-2)',
};

const thStyle: CSSProperties = {
  textAlign: 'center',
  padding: 'var(--s-1) var(--s-2)',
  color: 'var(--text-tertiary)',
  fontWeight: 600,
  fontSize: 12,
  borderBottom: '0.5px solid var(--hairline)',
};

const tdStyle: CSSProperties = {
  padding: 'var(--s-1) var(--s-2)',
  textAlign: 'center',
  borderBottom: '0.5px solid var(--hairline)',
};

const tdOkStyle: CSSProperties = {
  ...tdStyle,
  color: 'var(--accent)',
  fontWeight: 700,
};

// Re-exported so callers can simplify an expression with the 500ms-timeout
// worker path (used by future tabs / external consumers).
export { simplifyAsync };
