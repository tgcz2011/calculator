import type { Mode } from '../state/useCalculator';
import type { AngleMode } from '../engine';

interface Props {
  mode: Mode;
  angle: AngleMode;
  onMode(m: Mode): void;
  onAngle(a: AngleMode): void;
}

export function TabBar({ mode, angle, onMode, onAngle }: Props) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 'var(--s-3) var(--s-4)',
        gap: 'var(--s-3)',
      }}
    >
      <div
        role="tablist"
        aria-label="Mode"
        style={{
          display: 'inline-flex',
          background: 'var(--key-fn-bg)',
          borderRadius: 'var(--r-full)',
          padding: 2,
          overflowX: 'auto',
          maxWidth: '100%',
        }}
      >
        <Tab active={mode === 'basic'} onClick={() => onMode('basic')}>
          Basic
        </Tab>
        <Tab active={mode === 'scientific'} onClick={() => onMode('scientific')}>
          Scientific
        </Tab>
        <Tab active={mode === 'history'} onClick={() => onMode('history')}>
          History
        </Tab>
        <Tab active={mode === 'programmer'} onClick={() => onMode('programmer')}>
          Programmer
        </Tab>
        <Tab active={mode === 'units'} onClick={() => onMode('units')}>
          Units
        </Tab>
        <Tab active={mode === 'date'} onClick={() => onMode('date')}>
          Date
        </Tab>
      </div>
      <button
        type="button"
        onClick={() => onAngle(angle === 'deg' ? 'rad' : 'deg')}
        aria-label={`Angle mode, currently ${angle.toUpperCase()}`}
        style={{
          width: 44,
          height: 32,
          borderRadius: 'var(--r-full)',
          background: 'var(--key-fn-bg)',
          color: 'var(--key-fn-fg)',
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: '0.04em',
        }}
      >
        {angle.toUpperCase()}
      </button>
    </div>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick(): void; children: React.ReactNode }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      type="button"
      onClick={onClick}
      style={{
        padding: '6px 14px',
        borderRadius: 'var(--r-full)',
        fontSize: 13,
        fontWeight: 600,
        color: active ? 'var(--bg-elevated)' : 'var(--text)',
        background: active ? 'var(--text)' : 'transparent',
        transition: 'background-color var(--dur-normal) var(--ease-standard), color var(--dur-normal) var(--ease-standard)',
        letterSpacing: '0.01em',
      }}
    >
      {children}
    </button>
  );
}
