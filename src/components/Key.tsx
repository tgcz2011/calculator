// Shared Key component - the single source of truth for calculator button look.
// Used by Keypad (basic + scientific) and Programmer mode. Variants drive the
// palette via tokens; geometry + motion come from --key-size / --key-fs / --key-pad.
//
// ponytail: press feedback uses CSS :active instead of inline JS event handlers.
// The old approach mutated the element's style.transform on touchstart/end, which
// raced the click and left buttons stuck at scale(0.97) if the touch was cancelled.
// :active is the platform-native press state and handles cancellation correctly.

import { type CSSProperties, type ReactNode, useCallback, useRef } from 'react';

export type KeyVariant = 'num' | 'fn' | 'op' | 'danger';

export interface KeyProps {
  label: ReactNode;
  variant: KeyVariant;
  /** Flex grow ratio. Default 1. Use 2 for the wide "0" key. */
  flex?: number | string;
  /** Wide variant - 0 key spans two columns. */
  wide?: boolean;
  /** Disabled state - dims and ignores presses. */
  disabled?: boolean;
  /** Use a monospaced font for the label (numeric digit clarity). */
  mono?: boolean;
  onClick(): void;
  onHold?(): void;
  ariaLabel?: string;
  /** Hook for e2e / integration tests. Passed through to data-testid. */
  testId?: string;
  /** Size override: 'default' uses --key-size; 'compact' is smaller (programmer mode). */
  size?: 'default' | 'compact';
  /** Extra style overrides merged on top of the internal style (last-wins). Lets
   *  callers place a key in a CSS grid with row/column spans without forking Key. */
  style?: CSSProperties;
}

export function Key({
  label,
  variant,
  flex,
  wide,
  disabled,
  mono,
  onClick,
  onHold,
  ariaLabel,
  testId,
  size = 'default',
  style: extraStyle,
}: KeyProps) {
  const compact = size === 'compact';
  const palette = paletteFor(variant);

  // Long-press via pointer events: a 500ms timer started on pointerdown,
  // cancelled on pointerup/pointerleave/pointercancel. Works for mouse and
  // touch. If onHold is undefined, the timer is never armed (no-op).
  const holdTimer = useRef<number | null>(null);
  const clearHoldTimer = useCallback(() => {
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }, []);
  const handlePointerDown = useCallback(() => {
    if (!onHold) return;
    clearHoldTimer();
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = null;
      onHold();
    }, 500);
  }, [onHold, clearHoldTimer]);
  const handlePointerUp = useCallback(() => {
    clearHoldTimer();
  }, [clearHoldTimer]);
  const style: CSSProperties = {
    flex: flex ?? (wide ? 2 : 1),
    height: compact ? 'clamp(48px, 10vw, 60px)' : 'var(--key-size)',
    minHeight: compact ? 'clamp(48px, 10vw, 60px)' : 'var(--key-size)',
    margin: 'var(--s-1)',
    borderRadius: 'var(--radius-full)',
    fontSize: compact ? 'clamp(15px, 3.4vw, 18px)' : 'var(--key-fs)',
    fontWeight: 500,
    fontFamily: mono ? 'var(--font-mono)' : 'inherit',
    background: palette.bg,
    color: palette.fg,
    boxShadow: 'var(--shadow-key)',
    transition:
      'transform var(--dur-fast) var(--ease-standard), ' +
      'background-color var(--dur) var(--ease-standard), ' +
      'box-shadow var(--dur) var(--ease-standard)',
    userSelect: 'none',
    // Wide "0" key: left-align the label so the digit sits flush with the
    // leftmost digit column, matching Apple's Calculator layout.
    justifyContent: wide ? 'flex-start' : 'center',
    paddingLeft: wide ? 'calc(var(--key-size) * 0.32)' : 0,
    opacity: disabled ? 0.35 : 1,
    pointerEvents: disabled ? 'none' : 'auto',
    ...(extraStyle ?? {}),
  };
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onPointerCancel={handlePointerUp}
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      data-testid={testId}
      style={style}
      className="ui-key"
      data-variant={variant}
    >
      {label}
    </button>
  );
}

function paletteFor(variant: KeyVariant): { bg: string; fg: string } {
  switch (variant) {
    case 'op':
      return { bg: 'var(--key-op-bg)', fg: 'var(--key-op-fg)' };
    case 'fn':
      return { bg: 'var(--key-fn-bg)', fg: 'var(--key-fn-fg)' };
    case 'danger':
      return { bg: 'var(--key-danger-bg)', fg: 'var(--key-danger-fg)' };
    case 'num':
    default:
      return { bg: 'var(--key-num-bg)', fg: 'var(--key-num-fg)' };
  }
}