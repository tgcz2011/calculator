import { type CSSProperties, type KeyboardEvent, useEffect, useRef } from 'react';

interface Props {
  expression: string;
  result: string;
  error: string;
  cursor: number;
  onCursor(pos: number): void;
  onBackspace(): void;
  onClear(): void;
  onAllClear(): void;
  onEquals(): void;
  onUndo(): void;
  onRedo(): void;
  readOnly?: boolean;
}

export function Display(props: Props) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (document.activeElement !== el) return;
    const safe = Math.max(0, Math.min(props.cursor, props.expression.length));
    el.setSelectionRange(safe, safe);
  }, [props.cursor, props.expression]);

  function onSelect() {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    props.onCursor(start);
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      props.onEquals();
      return;
    }
    if (e.key === 'Backspace' && props.cursor === props.expression.length) {
      e.preventDefault();
      props.onBackspace();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) props.onRedo();
      else props.onUndo();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (props.expression) props.onClear();
      else props.onAllClear();
    }
  }

  const exprStyle: CSSProperties = {
    fontSize: 'var(--display-fs-expr)',
    color: 'var(--text-secondary)',
    fontWeight: 400,
    letterSpacing: '-0.01em',
    minHeight: '1.6em',
    textAlign: 'right',
    width: '100%',
    padding: '0 var(--s-4)',
    background: 'transparent',
    border: 0,
    outline: 0,
    fontFamily: 'inherit',
  };

  const resultStyle: CSSProperties = {
    fontSize: 'var(--display-fs)',
    color: props.error ? 'var(--danger)' : 'var(--text)',
    fontWeight: 300,
    letterSpacing: '-0.03em',
    lineHeight: 1.05,
    textAlign: 'right',
    padding: 'var(--s-2) var(--s-4) 0',
    minHeight: '1.2em',
    fontVariantNumeric: 'tabular-nums',
    overflowWrap: 'break-word',
    wordBreak: 'break-all',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', flex: 1, minHeight: 0 }}>
      <input
        ref={ref}
        value={props.expression || (props.error ? props.error : '0')}
        onSelect={onSelect}
        onClick={onSelect}
        onKeyDown={onKey}
        onChange={() => {/* controlled; mutations come via insert() */}}
        readOnly={props.readOnly}
        inputMode="decimal"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        aria-label="Expression"
        style={exprStyle}
      />
      <div style={resultStyle} aria-live="polite">
        {props.error ? props.error : props.result || '\u00a0'}
      </div>
    </div>
  );
}
