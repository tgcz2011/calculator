// ponytail: home-screen calculator selector (TGC-20 item 2). The picker is
// the always-on entry point — App.tsx boots here every time (no localStorage
// skip). All five calculators are first-class tiles below. History is NOT a
// tile (it's a view of past calculations, reachable via the TabBar inside any
// calculator). Adding a new calculator is one config entry + one Mode case in
// App.tsx (no layout change).

import type { CSSProperties } from 'react';
import type { Mode } from '../state/useCalculator';

export interface CalculatorTileDef {
  mode: Mode;
  titleKey: string;
  descKey: string;
  glyph: string;
  /** Tile is selectable from the picker. Locked tiles render disabled with
   *  a "coming soon" badge — the config-driven shape leaves room for them. */
  enabled: boolean;
}

const TILES: CalculatorTileDef[] = [
  {
    mode: 'basic',
    titleKey: 'picker.tile.basic.title',
    descKey: 'picker.tile.basic.desc',
    glyph: '\u{1F4F1}',
    enabled: true,
  },
  {
    mode: 'scientific',
    titleKey: 'picker.tile.scientific.title',
    descKey: 'picker.tile.scientific.desc',
    glyph: '\u{1F9EE}',
    enabled: true,
  },
  {
    mode: 'programmer',
    titleKey: 'picker.tile.programmer.title',
    descKey: 'picker.tile.programmer.desc',
    glyph: '\u{1F4BB}',
    enabled: true,
  },
  {
    mode: 'units',
    titleKey: 'picker.tile.units.title',
    descKey: 'picker.tile.units.desc',
    glyph: '\u{1F4CF}',
    enabled: true,
  },
  {
    mode: 'date',
    titleKey: 'picker.tile.date.title',
    descKey: 'picker.tile.date.desc',
    glyph: '\u{1F4C5}',
    enabled: true,
  },
  // ponytail: History is intentionally NOT a picker tile — it's a view of
  // past calculations, not a calculator itself. Picking it as the entry
  // point would land the user on an empty-state screen with no history.
  // Reach History via the TabBar at the top of any calculator instead.
];

interface Props {
  onPick(mode: Mode): void;
  t(key: string): string;
}

export function CalculatorPicker({ onPick, t }: Props) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--s-4)',
        padding: 'var(--s-6) var(--s-4)',
        overflow: 'auto',
      }}
      data-testid="calculator-picker"
    >
      <header style={headerStyle}>
        <h1 style={titleStyle}>{t('picker.title')}</h1>
        <p style={subtitleStyle}>{t('picker.subtitle')}</p>
      </header>

      <ul style={listStyle} aria-label={t('picker.title')}>
        {TILES.map((tile) => (
          <li key={tile.mode}>
            <button
              type="button"
              onClick={() => tile.enabled && onPick(tile.mode)}
              disabled={!tile.enabled}
              aria-label={t(tile.titleKey)}
              data-testid={`picker-tile-${tile.mode}`}
              data-enabled={tile.enabled ? 'true' : 'false'}
              style={{
                ...tileStyle,
                opacity: tile.enabled ? 1 : 0.5,
                cursor: tile.enabled ? 'pointer' : 'not-allowed',
              }}
            >
              <span aria-hidden style={glyphStyle}>
                {tile.glyph}
              </span>
              <span style={bodyStyle}>
                <span style={titleStyle2}>{t(tile.titleKey)}</span>
                <span style={descStyle}>{t(tile.descKey)}</span>
              </span>
              {!tile.enabled && (
                <span style={badgeStyle}>{t('picker.locked')}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const headerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--s-1)',
};

const titleStyle: CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
  letterSpacing: '-0.02em',
  margin: 0,
};

const subtitleStyle: CSSProperties = {
  fontSize: 14,
  color: 'var(--text-tertiary)',
  margin: 0,
};

const listStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--s-3)',
};

const tileStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--s-4)',
  width: '100%',
  padding: 'var(--s-4)',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--bg-elevated)',
  boxShadow: 'var(--shadow)',
  border: 0,
  textAlign: 'left',
  fontFamily: 'inherit',
  color: 'inherit',
  transition: 'transform var(--dur-fast) var(--ease-standard)',
};

const glyphStyle: CSSProperties = {
  fontSize: 36,
  lineHeight: 1,
  flexShrink: 0,
  width: 56,
  height: 56,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--accent-soft)',
  borderRadius: 'var(--radius-md)',
};

const bodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--s-1)',
  flex: 1,
  minWidth: 0,
};

const titleStyle2: CSSProperties = {
  fontSize: 17,
  fontWeight: 600,
};

const descStyle: CSSProperties = {
  fontSize: 13,
  color: 'var(--text-tertiary)',
};

const badgeStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  padding: 'var(--s-1) var(--s-2)',
  borderRadius: 'var(--radius-full)',
  background: 'var(--key-fn-bg)',
  color: 'var(--text-secondary)',
  flexShrink: 0,
};