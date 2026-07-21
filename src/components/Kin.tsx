// ponytail (TGC-22, module 4): Chinese kinship calculator UI. Wraps
// mumuy/relationship.js with the calculator's UX conventions: an input box +
// quick-chip shortcut buttons (父/母/兄/弟/姐/妹/夫/妻/子/女), 区域模式三选一
// (default / 北方 / 粤语), and a "reverse" toggle for 对方称呼我.
//
// Engine contract is unchanged — we never go through src/engine/index.ts here.
// The relationship.js library is a pure functional tool; we wrap its calls
// in a useMemo to avoid re-running on unrelated re-renders.

import { useEffect, useMemo, useState } from 'react';
import relationship from 'relationship.js';
import type { KinMode } from 'relationship.js';
import { useI18n } from '../hooks/useI18n';
import { history } from '../history/api';
import { Chip, ChipSegment } from './Chip';
import { Panel, Pill } from './Panel';

const QUICK_TOKENS: { key: string; tokens: string[] }[] = [
  { key: 'father', tokens: ['爸爸', '父亲'] },
  { key: 'mother', tokens: ['妈妈', '母亲'] },
  { key: 'olderBrother', tokens: ['哥哥'] },
  { key: 'youngerBrother', tokens: ['弟弟'] },
  { key: 'olderSister', tokens: ['姐姐'] },
  { key: 'youngerSister', tokens: ['妹妹'] },
  { key: 'son', tokens: ['儿子'] },
  { key: 'daughter', tokens: ['女儿'] },
  { key: 'husband', tokens: ['老公', '丈夫'] },
  { key: 'wife', tokens: ['老婆', '妻子'] },
];

const REGION_MODES: { id: KinMode; labelKey: string }[] = [
  { id: 'default', labelKey: 'kin.region.default' },
  { id: 'greatway-north', labelKey: 'kin.region.north' },
  { id: 'greatway-south', labelKey: 'kin.region.south' },
];

export function Kin() {
  const { t } = useI18n();
  const [expr, setExpr] = useState('爸爸的妈妈');
  const [sex, setSex] = useState<0 | 1>(1);
  const [reverse, setReverse] = useState(false);
  const [region, setRegion] = useState<KinMode>('default');

  const result = useMemo<string[]>(() => {
    if (!expr.trim()) return [];
    try {
      return relationship({ text: expr, sex, reverse, mode: region });
    } catch {
      return [];
    }
  }, [expr, sex, reverse, region]);

  function appendToken(token: string) {
    setExpr((prev) => (prev ? `${prev}的${token}` : token));
  }

  // History record (debounced)
  useEffect(() => {
    if (!result.length) return;
    const id = setTimeout(() => {
      history.record(`${expr}`, result.join(' / '));
    }, 600);
    return () => clearTimeout(id);
  }, [expr, result]);

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
      data-testid="kin-mode"
    >
      <Field label={t('kin.field.expr')} testId="kin-expr">
        <input
          type="text"
          className="ui-field-input"
          value={expr}
          onChange={(e) => setExpr(e.target.value)}
          placeholder={t('kin.placeholder')}
          data-testid="kin-expr-input"
        />
      </Field>

      <Panel testId="kin-quickchips">
        <span className="ui-panel-label">{t('kin.quick.title')}</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-1)', marginTop: 'var(--s-2)' }}>
          {QUICK_TOKENS.map((qc) => (
            <Pill
              key={qc.key}
              size="md"
              onClick={() => appendToken(qc.tokens[0])}
              ariaLabel={t(`kin.quick.${qc.key}`)}
              testId={`kin-quick-${qc.key}`}
            >
              <span>{qc.tokens[0]}</span>
            </Pill>
          ))}
        </div>
      </Panel>

      <Field label={t('kin.region.title')} testId="kin-region">
        <ChipSegment role="radiogroup" ariaLabel={t('kin.region.title')} layout="fill" shape="card">
          {REGION_MODES.map((m) => (
            <Chip
              key={m.id}
              active={region === m.id}
              onClick={() => setRegion(m.id)}
              role="radio"
              fill
              testId={`kin-region-${m.id === 'default' ? 'default' : m.id === 'greatway-north' ? 'north' : 'south'}`}
            >
              {t(m.labelKey)}
            </Chip>
          ))}
        </ChipSegment>
      </Field>

      <Field label={t('kin.sex.title')} testId="kin-sex">
        <ChipSegment role="radiogroup" ariaLabel={t('kin.sex.title')} layout="fill" shape="card">
          <Chip active={sex === 1} onClick={() => setSex(1)} role="radio" fill data-testid="kin-sex-male">
            {t('kin.sex.male')}
          </Chip>
          <Chip active={sex === 0} onClick={() => setSex(0)} role="radio" fill data-testid="kin-sex-female">
            {t('kin.sex.female')}
          </Chip>
        </ChipSegment>
      </Field>

      <Field label={t('kin.reverse.title')} testId="kin-reverse">
        <ChipSegment role="radiogroup" ariaLabel={t('kin.reverse.title')} layout="fill" shape="card">
          <Chip active={!reverse} onClick={() => setReverse(false)} role="radio" fill data-testid="kin-reverse-mine">
            {t('kin.reverse.mine')}
          </Chip>
          <Chip active={reverse} onClick={() => setReverse(true)} role="radio" fill data-testid="kin-reverse-theirs">
            {t('kin.reverse.theirs')}
          </Chip>
        </ChipSegment>
      </Field>

      <Panel testId="kin-result">
        <span className="ui-result-secondary">{t('kin.result.title')}</span>
        {result.length > 0 ? (
          <div className="ui-result-primary" data-testid="kin-result-value">
            {result.join(' / ')}
          </div>
        ) : (
          <div className="ui-result-primary" style={{ color: 'var(--text-tertiary)' }} data-testid="kin-result-empty">
            {t('kin.result.empty')}
          </div>
        )}
        {result.length > 1 && (
          <div className="ui-result-secondary" style={{ marginTop: 'var(--s-1)' }} data-testid="kin-result-alt">
            {t('kin.result.alt', { n: result.length })}
          </div>
        )}
      </Panel>
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