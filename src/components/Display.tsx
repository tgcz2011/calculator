import { type CSSProperties, type KeyboardEvent, useEffect, useLayoutEffect, useRef } from 'react';
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
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const safe = Math.max(0, Math.min(props.cursor, props.expression.length));
    if (document.activeElement === el) el.setSelectionRange(safe, safe);
    if (safe === props.expression.length) el.scrollLeft = el.scrollWidth;
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
    overflowX: 'auto',
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
    overflowWrap: 'break-word',
    wordBreak: 'break-all',
    flexShrink: 0,
    // ponytail (M8): when the live result is sticky (showing the last good
    // value while the user types an incomplete expression), italicize it so
    // the user can tell the displayed value isn't fresh. Don't change the
    // value or opacity — opacity < 1 creates a compositing layer that can
    // intercept pointer events on the keypad below (e2e regression).
    fontStyle: props.liveSticky ? 'italic' : 'normal',
    // ponytail (TGC-23): errors stay on the small error fontSize (don't run
    // auto-shrink on them — error text is short and the clamp is fine).
    ...(shownError ? { fontSize: 'clamp(22px, 4.5vw, 36px)', fontWeight: 500 } : null),
  };

  // ponytail (TGC-23): dynamic result font shrink. The token clamp gives a
  // reasonable size for short results, but multi-digit decimals (e.g. long
  // division, big factorial, or live error labels) can still wrap to 2-3
  // lines on narrow phones or compact desktop shells. We want a single
  // line, so on every render we measure the actual line count and shrink
  // in 0.9× steps until it converges. Single useLayoutEffect per change
  // so the user never sees a "flash at full size then shrink" pop.
  // Errors take the smaller errorSize path above and skip this entirely.
  //
  // We can't rely on scrollWidth > clientWidth for the overflow check:
  // overflowWrap:break-word + wordBreak:break-all wrap digits, so
  // scrollWidth stays bounded by clientWidth even for 15+ digit results.
  // Instead we count lines (offsetHeight / lineHeight). 1 line = good;
  // 2+ lines = shrink. The 0.4× floor caps absurd inputs to a single
  // readable line instead of shrinking toward zero.
  //
  // Implementation gotcha: lineHeight must be re-read INSIDE the
  // measureLines closure. The CSS `line-height: 1.05` is unitless, so
  // getComputedStyle returns the resolved value in px at the current
  // font-size. If we capture lineHeight once before the loop, it stays
  // at the natural-size value (e.g. 105px) while the loop shrinks the
  // font down to 65px — the next call still divides offsetHeight by
  // 105 and reports "1 line" when it's actually 2. Re-reading on each
  // iteration makes the check track the live font size.
  const resultRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (shownError) return;
    const el = resultRef.current;
    if (!el) return;
    el.style.fontSize = 'var(--display-fs)';
    const measureLines = (): number => {
      const fontSize = parseFloat(getComputedStyle(el).fontSize);
      // CSS lineHeight: 1.05 (unitless) → resolved in px. Fall back to
      // fontSize * 1.05 if the browser returned a unitless token.
      const rawLh = parseFloat(getComputedStyle(el).lineHeight);
      const lh = Number.isFinite(rawLh) && rawLh > 0
        ? rawLh
        : fontSize * 1.05;
      return Math.max(1, Math.round(el.offsetHeight / lh));
    };
    let scale = 1;
    for (let i = 0; i < 10; i++) {
      el.style.fontSize = `calc(var(--display-fs) * ${scale})`;
      if (measureLines() <= 1) return;
      scale *= 0.9;
    }
    el.style.fontSize = 'calc(var(--display-fs) * 0.4)';
  }, [props.result, shownError, props.expression]);

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
        style={exprStyle}
      />
      <div
        ref={resultRef}
        style={resultStyle}
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