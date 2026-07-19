import { type CSSProperties, type KeyboardEvent, useEffect, useRef } from 'react';

// ponytail: one Unicode glyph per error code, semantically chosen:
//   UNCLOSED          - ellipsis (incomplete)
//   PAREN             - right paren (close hint)
//   MISSING_OPERAND   - underscore (blank slot)
//   UNKNOWN_SYMBOL    - question mark
//   NOT_FUNCTION      - ƒ (italic f for "function")
//   CONVERT           - swap arrows (type swap)
//   ENGINE            - bang (generic engine fault)
// Same red color across all codes (Apple HIG consistency); only glyph varies.
const ERROR_GLYPHS: Record<string, string> = {
  UNCLOSED: '\u2026',
  PAREN: ')',
  MISSING_OPERAND: '_',
  UNKNOWN_SYMBOL: '?',
  NOT_FUNCTION: '\u0192',
  CONVERT: '\u2194',
  ENGINE: '!',
};

function errorGlyph(code: string | undefined): string | null {
  if (!code) return null;
  return ERROR_GLYPHS[code] ?? '!';
}

interface Props {
  expression: string;
  result: string;
  error: string;
  errorCode?: string;
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

  const glyphStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '1.6em',
    height: '1.6em',
    marginRight: '0.4em',
    borderRadius: 'var(--radius-full)',
    background: 'var(--danger-soft)',
    color: 'var(--danger)',
    fontSize: '0.8em',
    fontWeight: 700,
    fontFamily: 'var(--font-system)',
    lineHeight: 1,
    flexShrink: 0,
    verticalAlign: 'middle',
  };

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
    flexShrink: 0,
    // ponytail: trim huge font on error so "Mismatched parentheses" doesn't overflow.
    ...(props.error ? { fontSize: 'clamp(22px, 4.5vw, 36px)', fontWeight: 500 } : null),
  };

  // ponytail: previous layout used `justify-content: flex-end` to push input + result
  // to the bottom of the display column. When the display column got squeezed on
  // desktop (large --display-fs * 1.2em minHeight > available space), the children
  // overflowed UPWARD past the container, pushing the input on top of the tab bar.
  // Fix: stack normally (top-down), push only the result to the bottom with
  // margin-top: auto. Overflow now goes downward into the keypad (which is clipped
  // by .shell overflow: hidden on desktop) instead of into the top bar.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
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
      <div
        style={{ ...resultStyle, marginTop: 'auto' }}
        aria-live="polite"
        data-error-code={props.error && props.errorCode ? props.errorCode : undefined}
        data-error={props.error ? 'true' : undefined}
      >
        {props.error ? (
          <>
            {errorGlyph(props.errorCode) && (
              <span
                className="error-glyph"
                data-error-code={props.errorCode}
                aria-hidden="true"
                style={glyphStyle}
              >
                {errorGlyph(props.errorCode)}
              </span>
            )}
            <span className="error-message">{props.error}</span>
          </>
        ) : (
          props.result || '\u00a0'
        )}
      </div>
    </div>
  );
}