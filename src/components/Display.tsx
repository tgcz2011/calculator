import { type CSSProperties, type KeyboardEvent, useEffect, useRef } from 'react';
import { localizeErrorMessage, type Locale } from '../i18n';

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

export function errorGlyph(code: string | undefined): string | null {
  if (!code) return null;
  return ERROR_GLYPHS[code] ?? '!';
}

interface Props {
  expression: string;
  result: string;
  error: string;
  errorCode?: string;
  cursor: number;
  locale: Locale;
  onCursor(pos: number): void;
  onBackspace(): void;
  onClear(): void;
  onAllClear(): void;
  onEquals(): void;
  onUndo(): void;
  onRedo(): void;
  readOnly?: boolean;
  liveSticky?: boolean;
}

export function Display(props: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const safe = Math.max(0, Math.min(props.cursor, props.expression.length));
    if (document.activeElement === el) el.setSelectionRange(safe, safe);
    // ponytail (TGC-27 #2): the expression now wraps onto multiple lines
    // (long inputs split visually). Auto-grow the textarea so the user sees
    // every line without scrolling, and keep the cursor at the end so the
    // wrap "follows" the typing edge instead of pinning to the top.
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
    if (safe === props.expression.length) {
      el.scrollTop = el.scrollHeight;
    }
  }, [props.cursor, props.expression]);

  function onSelect() {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    props.onCursor(start);
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
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
    // ponytail: Ctrl+Y is the Windows redo shortcut. useKeyboardExtras handles
    // it globally but bails for any text-input target, so when the expression
    // input is focused Ctrl+Y silently did nothing. Handle it here alongside
    // Ctrl+Z / Ctrl+Shift+Z so redo works regardless of focus.
    if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      props.onRedo();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (props.expression) props.onClear();
      else props.onAllClear();
    }
  }

  // ponytail: localize the error message based on the engine's stable code.
  // Engine returns Chinese strings; for non-zh locales we rebuild from the
  // code via i18n.localizeErrorMessage. Falls back to engine's text if the
  // code is unknown to the i18n table.
  const shownError = props.error
    ? localizeErrorMessage(props.locale, props.errorCode, props.error)
    : '';

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
    // ponytail: use --text-display-secondary (translucent display text) so the
    // expression reads as muted against --bg-display. The token flips with the
    // theme — dark text on light surface (light mode), light on dark (dark mode).
    color: 'var(--text-display-secondary)',
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
    minWidth: 0,
    maxWidth: '100%',
    // ponytail (TGC-27 #2): a textarea instead of an input so long numeric
    // strings (70+ digits) wrap onto multiple visible lines instead of
    // horizontal-scrolling out of view. Auto-grow height in useEffect above.
    resize: 'none',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    overflowWrap: 'anywhere',
    overflowY: 'hidden',
  };

  const resultStyle: CSSProperties = {
    fontSize: 'var(--display-fs)',
    // ponytail: --text-display follows the display surface — dark on light in
    // light mode, light on dark in dark mode. Errors always use --danger.
    color: shownError ? 'var(--danger)' : 'var(--text-display)',
    fontWeight: 300,
    letterSpacing: '-0.03em',
    lineHeight: 1.05,
    textAlign: 'right',
    padding: '0 var(--s-4)',
    minHeight: '1.2em',
    fontVariantNumeric: 'tabular-nums',
    // ponytail (TGC-27 #2): the result may also wrap onto multiple lines
    // when its live value exceeds a single line. The old 1-line auto-shrink
    // hid overflow by shrinking the font down to 0.4× — that wasn't what
    // the user asked for ("I want to see all the digits, just spread across
    // more lines"). Now we cap at a sensible floor (32px ≈ readable on
    // phone portrait) and let long results wrap naturally.
    overflowWrap: 'anywhere',
    wordBreak: 'break-all',
    flexShrink: 0,
    fontStyle: props.liveSticky ? 'italic' : 'normal',
    // ponytail (TGC-23): errors stay on the small error fontSize (don't run
    // auto-shrink on them — error text is short and the clamp is fine).
    ...(shownError ? { fontSize: 'clamp(22px, 4.5vw, 36px)', fontWeight: 500 } : null),
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
      <textarea
        ref={ref}
        value={props.expression || '0'}
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
        data-testid="expression"
        style={exprStyle}
      />
      <div
        style={resultStyle}
        data-testid="result"
        aria-live="polite"
        data-error-code={shownError && props.errorCode ? props.errorCode : undefined}
        data-error={shownError ? 'true' : undefined}
        data-sticky={props.liveSticky ? 'true' : undefined}
      >
        {shownError ? (
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
            <span className="error-message">{shownError}</span>
          </>
        ) : (
          props.result || '\u00a0'
        )}
      </div>
    </div>
  );
}