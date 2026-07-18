import { type ReactNode } from 'react';

type Variant = 'num' | 'fn' | 'op' | 'ghost';

interface Props {
  label: ReactNode;
  variant: Variant;
  flex?: number | string;
  double?: boolean;
  onClick(): void;
  onHold?(): void;
  active?: boolean;
  ariaLabel?: string;
}

export function KeypadButton({ label, variant, flex, double, onClick, onHold, active, ariaLabel }: Props) {
  const style: React.CSSProperties = {
    flex: flex ?? 1,
    height: 'var(--key-size, 64px)',
    minHeight: 'var(--key-size, 64px)',
    margin: 'var(--s-1)',
    borderRadius: 'var(--r-full)',
    fontSize: 'calc(var(--key-size, 64px) * 0.4)',
    fontWeight: 500,
    background:
      variant === 'op'
        ? 'var(--key-op-bg)'
        : variant === 'fn'
          ? 'var(--key-fn-bg)'
          : variant === 'ghost'
            ? 'transparent'
            : 'var(--key-num-bg)',
    color:
      variant === 'op'
        ? 'var(--key-op-fg)'
        : variant === 'fn'
          ? 'var(--key-fn-fg)'
          : 'var(--key-num-fg)',
    boxShadow: variant === 'ghost' ? 'none' : 'var(--shadow-btn)',
    transform: active ? 'scale(0.97)' : 'scale(1)',
    transition:
      'transform var(--dur-fast) var(--ease-standard), background-color var(--dur-normal) var(--ease-standard)',
    userSelect: 'none',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      onDoubleClick={onHold}
      aria-label={ariaLabel}
      style={{ ...style, ...(double ? { flex: 2, justifyContent: 'flex-start', paddingLeft: 'var(--s-6)' } : null) }}
      onTouchStart={(e) => {
        const t = (e.target as HTMLElement);
        t.style.transition = 'transform 60ms var(--ease-standard)';
        t.style.transform = 'scale(0.97)';
      }}
      onTouchEnd={(e) => {
        const t = (e.target as HTMLElement);
        t.style.transform = 'scale(1)';
      }}
    >
      {label}
    </button>
  );
}
