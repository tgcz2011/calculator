import { useCallback, useEffect, useState } from 'react';
import { Display } from './components/Display';
import { Keypad } from './components/Keypad';
import { TabBar } from './components/TabBar';
import { HistoryList } from './components/HistoryList';
import { SyncSettings } from './components/SyncSettings';
import { DateTime } from './components/DateTime';
import { Units } from './components/Units';
import { Programmer } from './components/Programmer';
import { CalculatorPicker } from './components/CalculatorPicker';
import { Pill } from './components/Panel';
import { useCalculator, type Mode } from './state/useCalculator';
import { useKeyboard } from './native/keyboard';
import { useKeyboardExtras } from './hooks/useKeyboardExtras';
import { useTheme } from './hooks/useTheme';
import { useI18n } from './hooks/useI18n';
import { useOrientation } from './hooks/useOrientation';
import { isIOS, isDesktop, isMobileNative, isWeb } from './native/platform';

// ponytail: width breakpoint -> shell width class. Three tiers:
// phone (<768), tablet (768-1023), desktop (>=1024). Driven by matchMedia so it
// survives window resize and device rotation without re-rendering the app tree.
function useShellWidth(): 'phone' | 'tablet' | 'desktop' {
  const [tier, setTier] = useState<'phone' | 'tablet' | 'desktop'>(() => {
    if (typeof window === 'undefined') return 'phone';
    if (window.matchMedia('(min-width: 1024px)').matches) return 'desktop';
    if (window.matchMedia('(min-width: 768px)').matches) return 'tablet';
    return 'phone';
  });
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    const tablet = window.matchMedia('(min-width: 768px)');
    const handler = () => {
      if (desktop.matches) setTier('desktop');
      else if (tablet.matches) setTier('tablet');
      else setTier('phone');
    };
    desktop.addEventListener('change', handler);
    tablet.addEventListener('change', handler);
    return () => {
      desktop.removeEventListener('change', handler);
      tablet.removeEventListener('change', handler);
    };
  }, []);
  return tier;
}

// ponytail: scientific mode forces landscape (useOrientation.lock). On iOS
// Safari the Screen Orientation API is unsupported — there, lock() returns
// false and the App shows a dismissible rotate hint instead. The rotate hint
// is gated on lockFailed so it only appears when we couldn't actually lock.
// Other modes call unlock() so the user can rotate freely; a top-bar rotate
// Pill lets the user manually flip orientation in any mode.

// ponytail: home-screen picker persistence (TGC-20 item 2). When the user
// hasn't picked a calculator yet, the picker shows. Once they pick, we
// stash the choice under 'calc:last-pick' so subsequent loads skip it.
// Tests clear localStorage before navigating, then either re-set the
// preference (skip picker) or let it clear (force picker).
const LAST_PICK_KEY = 'calc:last-pick';

// ponytail: a-z / A-Z -> self map. Hoisted to module scope so handleKey
// doesn't rebuild it on every keydown. Lets users type identifiers
// (foo+1 -> UNKNOWN_SYMBOL) and unknown functions (xyz(1) -> NOT_FUNCTION).
const LETTER_KEY_MAP: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (let c = 0; c < 26; c++) {
    const lower = String.fromCharCode(97 + c);
    const upper = String.fromCharCode(65 + c);
    m[lower] = lower;
    m[upper] = upper;
  }
  return m;
})();

function readLastPick(): Mode | null {
  try {
    const v = localStorage.getItem(LAST_PICK_KEY);
    if (v === 'basic' || v === 'scientific' || v === 'history' ||
        v === 'programmer' || v === 'units' || v === 'date') {
      return v;
    }
  } catch {
    // private mode
  }
  return null;
}

function writeLastPick(mode: Mode): void {
  try {
    localStorage.setItem(LAST_PICK_KEY, mode);
  } catch {
    // private mode
  }
}

// ponytail (TGC-20 hotfix): the expression <input> in Display has its own
// React onKeyDown that handles Backspace / Enter / Cmd-Z locally. When the
// input is focused, the native keydown bubbles to this window-level listener
// too, so a single Backspace press used to dispatch calc.backspace() twice
// and delete two characters. The expression input owns those keys when it's
// the focus target, so this guard skips our window-level handling and lets
// Display do its thing.
function isExpressionInputTarget(t: EventTarget | null): boolean {
  return (
    t instanceof HTMLInputElement &&
    t.getAttribute('aria-label') === 'Expression'
  );
}

export default function App() {
  const calc = useCalculator();
  const tier = useShellWidth();
  const orientation = useOrientation();
  const { theme, toggle: toggleTheme } = useTheme();
  const i18n = useI18n();
  const { t, locale, toggleLocale } = i18n;
  const [syncOpen, setSyncOpen] = useState(false);
  // ponytail: scientific mode forces landscape. Track whether the lock attempt
  // succeeded — if it failed (iOS Safari, non-fullscreen desktop), show a
  // dismissible hint instead. Cleared when leaving scientific mode.
  const [sciLockFailed, setSciLockFailed] = useState(false);

  // ponytail: picker visibility. We start by hydrating from localStorage on
  // mount (avoids a flash of the picker when the user has already chosen).
  // null = no decision yet (show picker), Mode = skip picker & go there.
  const [pickedMode, setPickedMode] = useState<Mode | null>(() => readLastPick());

  // If something else (sync, theme, etc.) changes the URL or storage, keep
  // pickedMode in sync. Single source of truth: localStorage.
  useEffect(() => {
    if (pickedMode) writeLastPick(pickedMode);
  }, [pickedMode]);

  // ponytail: restore the persisted mode on boot. readLastPick() hydrates
  // pickedMode to skip the picker, but it never calls calc.setMode — so on
  // reload the picker was skipped but the calculator stayed in 'basic' instead
  // of the mode the user picked last time. onPick (the picker path) sets both,
  // but the boot-hydration path only set pickedMode. This effect closes that
  // gap: when pickedMode is non-null and the calc mode hasn't caught up, push
  // it through setMode so the actual mode matches the persisted pick.
  useEffect(() => {
    if (pickedMode && calc.state.mode !== pickedMode) {
      calc.setMode(pickedMode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedMode]);

  const onPick = useCallback((m: Mode) => {
    writeLastPick(m);
    setPickedMode(m);
    calc.setMode(m);
  }, [calc]);

  // ponytail: scientific mode forces landscape (user requirement: "科学模式强制
  // 横屏"). Other modes call unlock() so the user can rotate freely. If the lock
  // fails (iOS Safari, non-fullscreen desktop), we set sciLockFailed=true so
  // the rotate hint shows as a fallback. lock() is async and may race mode
  // changes; we ignore late-arriving results by checking the mode on resolve.
  useEffect(() => {
    let cancelled = false;
    if (calc.state.mode === 'scientific') {
      setSciLockFailed(false);
      orientation.lock('landscape').then((ok) => {
        if (!cancelled && !ok) setSciLockFailed(true);
      });
    } else {
      setSciLockFailed(false);
      orientation.unlock();
    }
    return () => {
      cancelled = true;
    };
  }, [calc.state.mode, orientation]);

  // ponytail: exit-to-picker handler. Clears localStorage so the picker shows
  // on next boot too (user-initiated "switch calculator" should persist).
  const onExitToPicker = useCallback(() => {
    try {
      localStorage.removeItem(LAST_PICK_KEY);
    } catch {
      // private mode
    }
    orientation.unlock();
    setPickedMode(null);
  }, [orientation]);

  const showPicker = pickedMode === null;

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      // ponytail: picker mode — any printable key picks Basic so the user can
      // bypass the picker via keyboard if they want. Esc also picks Basic
      // (cancel = "give me the default").
      if (showPicker) {
        if (e.key === 'Escape' || e.key === 'Enter' || /^[0-9+\-*/().]$/.test(e.key)) {
          e.preventDefault();
          onPick('basic');
          return;
        }
        return;
      }
      // ponytail (TGC-20 hotfix): when the expression input has focus, Display's
      // own onKeyDown handles Enter / Backspace / Cmd+Z / Escape. Skip our
      // window-level handling for those keys so we don't double-dispatch — the
      // pre-fix behavior was one BS press deleting two chars because both
      // handlers ran. Other keys (digits, ops, letters) still flow through
      // here so typing-into-focused-input keeps working; the input is
      // readOnly so insert() is the only mutation path for those keys.
      // Skip is key-scoped, not target-scoped, so cursor-mid BS still falls
      // through to this window handler (Display's local handler only fires
      // when cursor === expression.length).
      const inFocusedExprInput = isExpressionInputTarget(e.target);
      // Cmd/Ctrl-Z, Cmd-Shift-Z, Cmd-Y -> undo/redo (handled by reducer via dispatch would need
      // extra plumbing; skip at App level to avoid coupling).
      if (e.metaKey || e.ctrlKey) return;
      if (e.key === 'Enter' || e.key === '=') {
        if (inFocusedExprInput) return; // Display's onKeyDown handles it.
        e.preventDefault();
        calc.equals();
        return;
      }
      if (e.key === 'Backspace') {
        if (inFocusedExprInput && calc.state.cursor === calc.state.expression.length) {
          // Display's local handler fires for cursor-at-end; let it own the dispatch.
          return;
        }
        e.preventDefault();
        calc.backspace();
        return;
      }
      if (e.key === 'Escape') {
        if (inFocusedExprInput) return; // Display's onKeyDown handles it.
        e.preventDefault();
        if (calc.state.expression) calc.clear();
        else calc.allClear();
        return;
      }
      // ponytail: letters a-z / A-Z insert as-is so users can type identifiers
      // (foo+1 -> UNKNOWN_SYMBOL) and unknown functions (xyz(1) -> NOT_FUNCTION).
      // We DON'T map 'x'/'X' to '×' anymore — the engine's normalize() rewrites
      // every '×' to '*' (src/engine/index.ts:102), which collapses identifier-
      // leading '×' and breaks the unknown-function classification. '*' / '×'
      // button still work for multiplication.
      const map: Record<string, string> = {
        ...LETTER_KEY_MAP,
        '0': '0', '1': '1', '2': '2', '3': '3', '4': '4',
        '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
        '.': '.', ',': '.', '+': '+', '-': '-', '*': '×',
        '/': '÷', '(': '(', ')': ')',
        '!': '!', '^': '^',
      };
      const insert = map[e.key];
      if (insert) {
        e.preventDefault();
        calc.insert(insert);
      }
    },
    [calc, showPicker, onPick],
  );

  useKeyboard(handleKey);
  useKeyboardExtras(calc);

  // ponytail: iOS safe-area tweak for the display top — extend the dark display into the
  // status bar via a small extra style. Lightweight, no extra component.
  useEffect(() => {
    if (!isIOS) return;
    const id = 'ios-safe-area-display';
    if (document.getElementById(id)) return;
    const s = document.createElement('style');
    s.id = id;
    s.textContent = `.display-area { padding-top: max(env(safe-area-inset-top), 0px); }`;
    document.head.appendChild(s);
    return () => s.remove();
  }, []);

  if (showPicker) {
    return (
      <main
        className="shell"
        data-tier={tier}
        data-platform={isMobileNative ? 'native' : isDesktop ? 'desktop' : isWeb ? 'web' : 'unknown'}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'flex-end',
            gap: 'var(--s-2)',
            padding: 'var(--s-3) var(--s-4)',
          }}
        >
          <Pill
            onClick={toggleLocale}
            ariaLabel={locale === 'zh' ? t('common.lang.zh') : t('common.lang.en')}
            testId="toggle-locale"
          >
            <span aria-hidden style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.04em' }}>
              {locale === 'zh' ? 'EN' : '中'}
            </span>
          </Pill>
          <Pill
            onClick={toggleTheme}
            ariaLabel={theme === 'light' ? t('common.theme.light') : t('common.theme.dark')}
            testId="toggle-theme"
          >
            <span aria-hidden>{theme === 'light' ? '\u263D' : '\u2600'}</span>
          </Pill>
        </div>
        <CalculatorPicker onPick={onPick} t={t} />
      </main>
    );
  }

  // ponytail: prefer committed errors (= press) over live errors so deferred
  // codes (UNCLOSED / PAREN / MISSING_OPERAND) become visible after the user
  // commits, while live errors (UNKNOWN_SYMBOL / NOT_FUNCTION / etc.) stay
  // surfaced as the user types. Empty committed → fall back to live.
  const displayError = calc.committedError || calc.liveError;
  const displayErrorCode = calc.committedErrorCode || calc.liveErrorCode;

  return (
    <main
      className="shell"
      data-tier={tier}
      data-platform={isMobileNative ? 'native' : isDesktop ? 'desktop' : isWeb ? 'web' : 'unknown'}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          justifyContent: 'space-between',
          gap: 'var(--s-2)',
          position: 'relative',
          zIndex: 'var(--z-tabbar)',
        }}
      >
        <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
          <TabBar
            mode={calc.state.mode}
            angle={calc.state.angle}
            onMode={calc.setMode}
            onAngle={calc.setAngle}
            t={t}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--s-2)', padding: 'var(--s-3) var(--s-4) var(--s-3) 0' }}>
          <Pill
            onClick={onExitToPicker}
            ariaLabel={t('common.home')}
            testId="exit-to-picker"
          >
            <span aria-hidden style={{ fontSize: 16 }}>{'\u2302'}</span>
          </Pill>
          <Pill
            onClick={() => void orientation.toggle()}
            ariaLabel={t('common.rotate')}
            testId="toggle-orientation"
          >
            <span aria-hidden style={{ fontSize: 16 }}>{orientation.orientation === 'landscape' ? '\u2191' : '\u2197'}</span>
          </Pill>
          <Pill
            onClick={toggleLocale}
            ariaLabel={locale === 'zh' ? t('common.lang.zh') : t('common.lang.en')}
            testId="toggle-locale"
          >
            <span aria-hidden style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.04em' }}>
              {locale === 'zh' ? 'EN' : '中'}
            </span>
          </Pill>
          <Pill
            onClick={toggleTheme}
            ariaLabel={theme === 'light' ? t('common.theme.light') : t('common.theme.dark')}
            testId="toggle-theme"
          >
            <span aria-hidden>{theme === 'light' ? '\u263D' : '\u2600'}</span>
          </Pill>
          <Pill
            onClick={() => setSyncOpen(true)}
            ariaLabel={t('common.syncSettings')}
            testId="open-sync-settings"
          >
            <span aria-hidden style={{ fontSize: 16 }}>{'\u2699'}</span>
            <span>{t('common.sync')}</span>
          </Pill>
        </div>
      </div>
      {calc.state.mode === 'scientific' && sciLockFailed && (
        <div
          style={{
            textAlign: 'center',
            padding: 'var(--s-1) var(--s-3)',
            color: 'var(--text-tertiary)',
            fontSize: 12,
            background: 'var(--bg-elevated)',
            borderRadius: 'var(--radius-sm)',
            margin: '0 var(--s-3) var(--s-1)',
          }}
          data-testid="rotate-hint"
        >
          {t('app.hint.rotate')}
        </div>
      )}
      {calc.state.mode !== 'history' && calc.state.mode !== 'date' && calc.state.mode !== 'units' && calc.state.mode !== 'programmer' && (
        <div className="display-area" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg-display)', color: 'var(--text-display)' }}>
          <Display
            expression={calc.state.expression}
            result={calc.live}
            error={displayError}
            errorCode={displayErrorCode}
            locale={locale}
            cursor={calc.state.cursor}
            onCursor={calc.setCursor}
            onBackspace={calc.backspace}
            onClear={calc.clear}
            onAllClear={calc.allClear}
            onEquals={calc.equals}
            onUndo={calc.undo}
            onRedo={calc.redo}
            liveSticky={calc.liveSticky}
          />
        </div>
      )}
      {calc.state.mode === 'history' ? (
        <HistoryList
          bump={calc.state.historyVersion}
          onRecall={calc.recall}
          onClear={calc.clearHistory}
          t={t}
        />
      ) : calc.state.mode === 'date' ? (
        <DateTime />
      ) : calc.state.mode === 'units' ? (
        <Units />
      ) : calc.state.mode === 'programmer' ? (
        <Programmer />
      ) : (
        <Keypad
          scientific={calc.state.mode === 'scientific'}
          angle={calc.state.angle}
          onInsert={calc.insert}
          onBackspace={calc.backspace}
          onClear={calc.clear}
          onAllClear={calc.allClear}
          onEquals={calc.equals}
          onAngle={calc.setAngle}
          onPercent={calc.percent}
          onNegate={calc.negate}
        />
      )}
      {calc.state.mode !== 'history' && tier === 'phone' && (
        <div style={{ textAlign: 'center', padding: 'var(--s-1)', color: 'var(--fg-tertiary)', fontSize: 11 }}>
          {t('app.hint.ac')}
        </div>
      )}
      <SyncSettings open={syncOpen} onClose={() => setSyncOpen(false)} />
    </main>
  );
}