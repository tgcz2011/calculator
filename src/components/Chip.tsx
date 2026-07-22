// Shared Chip component - used by Units / DateTime sub-tabs, Programmer
// radix / word-size pickers, and the Loan / Tax / Advanced sub-tabs. Two shapes:
//   - Chip         : a single pill (segmented control option)
//   - ChipSegment  : the rounded background container holding multiple chips
// Visual states (active / inactive) are CSS-driven via aria-selected / aria-checked
// so the same element works as both tab (role=tab) and radio (role=radio).

import { type CSSProperties, type ReactNode } from 'react';

export interface ChipProps {
  active: boolean;
  onClick(): void;
  children: ReactNode;
  testId?: string;
  /** role='tab' (default) or role='radio'. Tabs are tablist members, radios are radiogroup members. */
  role?: 'tab' | 'radio';
  ariaLabel?: string;
  /** Layout behavior inside a ChipSegment. 'fill' grows to fill (Programmer radios); default sizes to content. */
  fill?: boolean;
}

export function Chip({ active, onClick, children, testId, role = 'tab', ariaLabel, fill }: ChipProps) {
  const style: CSSProperties = fill
    ? { flex: 1 }
    : {};
  return (
    <button
      type="button"
      role={role}
      aria-selected={role === 'tab' ? active : undefined}
      aria-checked={role === 'radio' ? active : undefined}
      aria-label={ariaLabel}
      data-testid={testId}
      onClick={onClick}
      className="ui-chip"
      style={style}
    >
      {children}
    </button>
  );
}

export interface ChipSegmentProps {
  children: ReactNode;
  /** ARIA role of the segment container. Default 'tablist'. */
  role?: 'tablist' | 'radiogroup';
  ariaLabel?: string;
  testId?: string;
  /** Layout: 'auto' lets chips size to content (default), 'fill' gives each chip flex:1 (sub-tabs). */
  layout?: 'auto' | 'fill';
  /** Style override for the segment background shape - 'pill' (default, fully rounded) or 'card' (slight radius). */
  shape?: 'pill' | 'card';
}

export function ChipSegment({
  children,
  role = 'tablist',
  ariaLabel,
  testId,
  layout = 'auto',
  shape = 'pill',
}: ChipSegmentProps) {
  const style: CSSProperties = {
    ...(shape === 'card'
      ? {
          background: 'var(--key-fn-bg)',
          borderRadius: 'var(--radius-md)',
          padding: 4,
          gap: 2,
          overflow: layout === 'fill' ? 'hidden' : 'auto',
        }
      : {}),
    ...(layout === 'fill' && shape === 'pill' ? { width: '100%' } : {}),
  };
  return (
    <div
      role={role}
      aria-label={ariaLabel}
      data-testid={testId}
      className="ui-chip-segment"
      style={style}
      data-shape={shape}
    >
      {children}
    </div>
  );
}