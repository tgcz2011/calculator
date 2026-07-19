// Shared Panel + Section + Modal surface components. The visual rules are
// driven by .ui-panel / .ui-section / .ui-modal-* classes in tokens.css.

import { type CSSProperties, type ReactNode } from 'react';

export interface PanelProps {
  children: ReactNode;
  /** 'default' = elevated card, 'danger' = danger soft fill. */
  variant?: 'default' | 'danger';
  testId?: string;
  style?: CSSProperties;
}

export function Panel({ children, variant = 'default', testId, style }: PanelProps) {
  return (
    <div
      className="ui-panel"
      data-variant={variant}
      data-testid={testId}
      style={style}
    >
      {children}
    </div>
  );
}

export interface PanelLabelProps {
  children: ReactNode;
}

export function PanelLabel({ children }: PanelLabelProps) {
  return <span className="ui-panel-label">{children}</span>;
}

export interface SectionProps {
  title: string;
  children: ReactNode;
}

export function Section({ title, children }: SectionProps) {
  return (
    <section className="ui-section">
      <h3 className="ui-section-title">{title}</h3>
      {children}
    </section>
  );
}

export interface ModalProps {
  open: boolean;
  onClose(): void;
  ariaLabel: string;
  testId?: string;
  children: ReactNode;
}

/** Modal wraps a backdrop + panel. Clicking the backdrop closes. */
export function Modal({ open, onClose, ariaLabel, testId, children }: ModalProps) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      className="ui-modal-backdrop"
      onClick={onClose}
    >
      <div
        className="ui-modal-panel"
        onClick={(e) => e.stopPropagation()}
        data-testid={testId}
      >
        {children}
      </div>
    </div>
  );
}

export interface PillProps {
  onClick(): void;
  ariaLabel?: string;
  testId?: string;
  size?: 'md' | 'lg';
  children: ReactNode;
}

/** Pill-shaped icon/text button - 32-44px circular surface, used in toolbars. */
export function Pill({ onClick, ariaLabel, testId, size = 'md', children }: PillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      data-testid={testId}
      className="ui-pill"
      data-size={size}
    >
      {children}
    </button>
  );
}

export interface FieldProps {
  label?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

/** Field wraps a labeled input with hint / error text underneath. */
export function Field({ label, hint, error, children }: FieldProps) {
  return (
    <label className="ui-field" style={{ marginBottom: 'var(--s-3)' }}>
      {label && <span className="ui-field-label">{label}</span>}
      {children}
      {(hint || error) && (
        <span className="ui-field-hint" data-variant={error ? 'error' : undefined}>
          {error ?? hint}
        </span>
      )}
    </label>
  );
}