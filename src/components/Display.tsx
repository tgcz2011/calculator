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
    // ponytail (TGC-27 #2 + follow-up): the expression wraps onto multiple
    // lines for long inputs. Auto-grow to its natural scrollHeight so the
    // user sees every line, AND cap the grown height to ~50% of the display
    // column so a 70+ digit input can't push the result past the column
    // and paint onto the keypad (Tester-reported regression on desktop
    // aspect-locked basic: scrollHeight 369px in a 152px column). Beyond
    // the cap the textarea scrolls internally instead of growing.
    const wrapper = el.parentElement;
    const column = wrapper?.parentElement;
    const cap = column && column.clientHeight > 0 ? column.clientHeight * 0.5 : Infinity;
    el.style.height = 'auto';
    const desired = el.scrollHeight;
    if (cap !== Infinity && desired > cap) {
      el.style.height = `${cap}px`;
      el.style.overflowY = 'auto';
    } else {
      el.style.height = `${desired}px`;
      el.style.overflowY = 'hidden';
    }
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
    // ponytail (TGC-27 #2 follow-up): use a fixed px floor (≈1 line of body
    // text) instead of 1.6em — `em` resolves against this element's own
    // font-size, which would be 1.6× --display-fs-expr and balloon to ~32px
    // on desktop; not what we want here. The auto-grow in useEffect covers
    // short content; px floor just guarantees the box has a visible row.
    minHeight: 24,
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
    // horizontal-scrolling out of view. Auto-grow height in useEffect above,
    // capped at 50% of the display column so it can't push the result onto
    // the keypad; overflowY flips to 'auto' in that case for internal scroll.
    resize: 'none',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    overflowWrap: 'anywhere',
    flexShrink: 1,
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
    // ponytail (TGC-27 #2 follow-up): fixed px floor instead of 1.2em. `em`
    // resolved against the result's own font-size (100px on desktop) would
    // push minHeight to 120px — bigger than half of a 152px display column,
    // forcing the result past the column and breaking the keypad containment
    // even with overflow:hidden on the wrapper. 24px keeps a 1-line minimum
    // without competing with the flex-grow allocation.
    minHeight: 24,
    fontVariantNumeric: 'tabular-nums',
    // ponytail (TGC-27 #2): the result may also wrap onto multiple lines
    // when its live value exceeds a single line. The old 1-line auto-shrink
    // hid overflow by shrinking the font down to 0.4× — that wasn't what
    // the user asked for ("I want to see all the digits, just spread across
    // more lines"). Now we cap at a sensible floor (32px ≈ readable on
    // phone portrait) and let long results wrap naturally.
    overflowWrap: 'anywhere',
    wordBreak: 'break-all',
    // ponytail (TGC-27 #2 follow-up): the result fills whatever space the
    // expression textarea leaves. min-height:0 lets flex shrink it when the
    // column is squeezed (e.g. desktop aspect-locked basic); overflow-y:auto
    // gives it an internal scroll bar instead of painting past the column
    // and onto the keypad (Tester-reported regression on the desktop
    // aspect-locked shell).
    flex: '1 1 0',
    overflowY: 'auto',
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
  // ponytail (TGC-27 #2 follow-up): overflow:hidden on the wrapper so a wrapped
  // expression / result that's larger than the column is clipped at the column
  // bounds instead of painting onto the keypad. The internal scroll on each
  // child (overflow-y:auto on textarea when capped, on result always) keeps
  // the content reachable without expanding the display column.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
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