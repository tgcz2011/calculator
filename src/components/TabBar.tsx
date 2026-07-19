import type { Mode } from '../state/useCalculator';
import type { AngleMode } from '../engine';
import { Chip, ChipSegment } from './Chip';
import { Pill } from './Panel';

interface Props {
  mode: Mode;
  angle: AngleMode;
  onMode(m: Mode): void;
  onAngle(a: AngleMode): void;
}

const MODES: Mode[] = ['basic', 'scientific', 'history', 'programmer', 'units', 'date'];

export function TabBar({ mode, angle, onMode, onAngle }: Props) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 'var(--s-3) var(--s-4)',
        gap: 'var(--s-3)',
        zIndex: 'var(--z-tabbar)',
      }}
    >
      <ChipSegment ariaLabel="Mode" layout="auto">
        {MODES.map((m) => (
          <Chip key={m} active={mode === m} onClick={() => onMode(m)}>
            {labelFor(m)}
          </Chip>
        ))}
      </ChipSegment>
      <Pill
        size="lg"
        onClick={() => onAngle(angle === 'deg' ? 'rad' : 'deg')}
        ariaLabel={`Angle mode, currently ${angle.toUpperCase()}`}
      >
        {angle.toUpperCase()}
      </Pill>
    </div>
  );
}

function labelFor(m: Mode): string {
  switch (m) {
    case 'basic': return 'Basic';
    case 'scientific': return 'Scientific';
    case 'history': return 'History';
    case 'programmer': return 'Programmer';
    case 'units': return 'Units';
    case 'date': return 'Date';
  }
}