import type { Mode } from '../state/useCalculator';
import type { AngleMode } from '../engine';
import { Chip, ChipSegment } from './Chip';
import { Pill } from './Panel';

interface Props {
  mode: Mode;
  angle: AngleMode;
  onMode(m: Mode): void;
  onAngle(a: AngleMode): void;
  t(key: string): string;
}

const MODES: Mode[] = ['basic', 'scientific', 'history', 'programmer', 'units', 'date', 'chemistry'];

export function TabBar({ mode, angle, onMode, onAngle, t }: Props) {
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
            {t(`mode.${m}`)}
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