import { useCallback, useEffect, useState } from 'react';
import { Display } from './components/Display';
import { Keypad } from './components/Keypad';
import { HistoryList } from './components/HistoryList';
import { SyncSettings } from './components/SyncSettings';
import { DateTime } from './components/DateTime';
import { Units } from './components/Units';
import { Programmer } from './components/Programmer';
import { ChemBalancer } from './components/ChemBalancer';
import { AdvancedMath } from './components/AdvancedMath';
import { Loan } from './components/Loan';
import { Tax } from './components/Tax';
import { Kin } from './components/Kin';
import { CalculatorPicker } from './components/CalculatorPicker';
import { Pill } from './components/Panel';
import { useCalculator, type Mode } from './state/useCalculator';
import { useKeyboard } from './native/keyboard';
import { useKeyboardExtras } from './hooks/useKeyboardExtras';
import { useTheme } from './hooks/useTheme';
import { useI18n } from './hooks/useI18n';
import { useOrientation } from './hooks/useOrientation';
import { isIOS, isDesktop, isMobileNative, isWeb, isTauri } from './native/platform';

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

// ponytail (TGC-26 #4 root fix): the ↻ (rotate) button and force-landscape.
// The Screen Orientation API is dead on web (no lock() on iOS Safari; needs
// fullscreen elsewhere, usually denied), so the old ↻ button that called
// orientation.toggle() was a no-op on web - "rotate键不生效". The root fix
// drives CSS rotation directly: a `rotated` state toggles the shell's
// [data-force-landscape] CSS (90deg rotate, see tokens.css). Entering
// scientific on a phone auto-sets rotated=true (preserves the TGC-24 #6
// auto-force-landscape); the ↻ button toggles it so the user can override in
// any mode. Native mobile still uses the real orientation.lock (works on
// Capacitor) with CSS as the fallback. Desktop (dataDesktop) has no rotation,
// so ↻ toggles the 9/16 aspect lock instead (tall shell ↔ wide column).
//
// ponytail (TGC-23): the top TabBar (mode chip strip) was removed per user
// request - the home-page CalculatorPicker is now the only mode selector.
// The angle-mode (DEG/RAD) toggle used to live inside TabBar; it's now a
// Pill in the right-side toolbar, gated on mode === 'scientific'.

// ponytail: picker shows on every boot — the user wants the calculator
// selector as the always-on entry point ("重启后一定要到选择计算器的界面去").
// No localStorage persistence; onPick / onExitToPicker just toggle in-memory
// state.

// ponytail: desktop aspect-ratio lock persistence. When on, the desktop
// shell keeps a 9/16 phone-like aspect ratio so resizing the window
// doesn't deform the calculator. Default: ON for desktop tier, OFF for
// mobile/tablet (where the shell already fills the screen).
const ASPECT_LOCK_KEY = 'calc:aspect-locked';

function readAspectLocked(): boolean | null {
  try {
    const v = localStorage.getItem(ASPECT_LOCK_KEY);
    if (v === 'true') return true;
    if (v === 'false') return false;
  } catch {
    // private mode
  }
  return null;
}

function writeAspectLocked(locked: boolean): void {
  try {
    localStorage.setItem(ASPECT_LOCK_KEY, String(locked));
  } catch {
    // private mode
  }
}

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

// ponytail (TGC-20 hotfix): the expression <input> in Display has its own
// React onKeyDown that handles Backspace / Enter / Cmd-Z locally. When the
// input is focused, the native keydown bubbles to this window-level listener
// too, so a single Backspace press used to dispatch calc.backspace() twice
// and delete two characters. The expression input owns those keys when it's
// the focus target, so this guard skips our window-level handling and lets
// Display do its thing.
function isExpressionInputTarget(t: EventTarget | null): boolean {
  return (
    (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) &&
    t.getAttribute('aria-label') === 'Expression'
  );
}

// ponytail: editable text fields of the non-basic modes (chemistry, advanced,
// units amount, and the loan/tax/relationship modules). When one of these has
// focus, the window-level keydown handler must NOT hijack keystrokes - the
// digit/op/letter routing below calls preventDefault() and shoves the char
// into the basic calculator via calc.insert(), which eats the typed character
// (Tester repro: type() into chemistry/advanced inputs dropped digits and
// operators; fill() hid it because it sets value directly).
//
// The basic calculator's Expression input is readOnly and deliberately relies
// on this handler routing through calc.insert() (it can't accept native
// typing), so it's excluded here and keeps its existing TGC-20 behavior -
// isExpressionInputTarget() still owns its Enter/Backspace/Escape skipping.
function isEditableFieldTarget(t: EventTarget | null): boolean {
  if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) {
    return t.getAttribute('aria-label') !== 'Expression';
  }
  return false;
}

export default function App() {
  const calc = useCalculator();
  const tier = useShellWidth();
  const orientation = useOrientation();
  const { theme, toggle: toggleTheme } = useTheme();
  const i18n = useI18n();
  const { t, locale, toggleLocale } = i18n;
  const [syncOpen, setSyncOpen] = useState(false);
  // ponytail (TGC-26 #4): user/app rotation request that drives the CSS
  // force-landscape on mobile. The ↻ button toggles this on web (the Screen
  // Orientation API is dead on iOS Safari / non-fullscreen web, so the old
  // orientation.toggle() button was a no-op there - "rotate键不生效").
  // Entering scientific on a phone auto-sets this true (preserves the
  // TGC-24 #6 auto-force-landscape); the ↻ button then lets the user
  // override it in any mode. Native still attempts the real orientation.lock
  // first; this is the web primary and the native fallback. See
  // tokens.css [data-force-landscape].
  const [rotated, setRotated] = useState(false);
  // ponytail: desktop aspect-ratio lock. Hydrate from localStorage; if unset,
  // default ON for desktop tier, OFF for tablet/phone. We re-read tier here
  // (not via useEffect) so the initial render matches the user's last choice
  // instead of flashing the freeform layout first.
  const [aspectLocked, setAspectLocked] = useState<boolean>(() => {
    const stored = readAspectLocked();
    if (stored !== null) return stored;
    // ponytail (TGC-25 #8): default ON for desktop platforms - Tauri at any
    // window width (the Mac app defaults to 420x720, below the old 1024px
    // gate) OR web >=1024px. iPad/tablet and phones stay unlocked (the shell
    // already fills the viewport there).
    if (isTauri) return true;
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches) {
      return true;
    }
    return false;
  });

  useEffect(() => {
    writeAspectLocked(aspectLocked);
  }, [aspectLocked]);

  // ponytail: picker visibility. Boot always starts on the picker — the user
  // wants the calculator selector as the always-on entry point, so we no
  // longer hydrate from / persist to 'calc:last-pick'. onPick sets the
  // in-memory mode; onExitToPicker clears it back to null.
  const [pickedMode, setPickedMode] = useState<Mode | null>(null);

  // ponytail (TGC-26 #4 root fix): apply orientation for a mode. Scientific
  // wants landscape. Desktop monitors don't rotate, so skip. Mobile WEB sets
  // `rotated` true so the shell CSS-rotates to landscape (the Screen
  // Orientation API is dead on iOS Safari / non-fullscreen web - the old
  // lock+hint path never rotated anything, and the manual ↻ button that
  // called orientation.toggle() was a no-op too). Native mobile still
  // attempts the real orientation.lock (works on Capacitor); if it fails,
  // `rotated` kicks in as the CSS fallback. Non-scientific modes clear
  // `rotated` and release any native lock. The ↻ button also toggles
  // `rotated` on web, so the user can manually rotate/override in any mode.
  const applyOrientationForMode = useCallback((m: Mode) => {
    if (m === 'scientific') {
      if (isDesktop) {
        // Desktop is always landscape; no rotation needed.
        return;
      }
      if (isWeb) {
        // CSS force-landscape is the primary mechanism on web.
        setRotated(true);
        return;
      }
      // Native mobile: attempt the real lock first; fall back to CSS only if
      // it fails. Don't set rotated upfront to avoid a rotate-then-unrotate
      // flash while the lock is in flight - if it succeeds the device
      // physically rotates and the portrait-gated forceLandscape stays off.
      orientation.lock('landscape').then((ok) => {
        if (!ok) setRotated(true);
      });
    } else {
      setRotated(false);
      orientation.unlock();
    }
  }, [orientation]);

  const onPick = useCallback((m: Mode) => {
    setPickedMode(m);
    calc.setMode(m);
    // ponytail: fire applyOrientationForMode synchronously inside the click
    // handler. On native mobile this preserves the user-gesture context for
    // screen.orientation.lock(); on web it just flips `rotated` (no gesture
    // needed for CSS). Calling from useEffect would lose the native gesture.
    applyOrientationForMode(m);
  }, [calc, applyOrientationForMode]);

  // ponytail: wrap calc.setMode so the orientation/rotation fires synchronously
  // inside the picker tile's click handler (preserves the native user gesture
  // for orientation.lock). Also injected into useKeyboardExtras so Ctrl/Cmd+1..6
  // honors the same lock-on-enter rule (TGC-23 §3.9).
  const handleModeChange = useCallback((m: Mode) => {
    calc.setMode(m);
    applyOrientationForMode(m);
  }, [calc, applyOrientationForMode]);

  // ponytail: exit-to-picker handler. Just clears in-memory state - the picker
  // always shows on next boot anyway (no persistence to clear). Also clears
  // any CSS force-landscape so the picker is never rendered rotated.
  const onExitToPicker = useCallback(() => {
    orientation.unlock();
    setRotated(false);
    setPickedMode(null);
  }, [orientation]);

  const showPicker = pickedMode === null;

  // ponytail (TGC-25 #8): desktop-platform flag driving the centered column
  // + aspect-lock CSS. Tauri at any width (the Mac app window is 420x720,
  // below the 1024px layout breakpoint) OR web >=1024px. iPad/tablet/phone
  // stay non-desktop (full-bleed shell).
  const dataDesktop = isTauri || tier === 'desktop';

  // ponytail (TGC-26 #4 root fix): CSS force-landscape, driven by `rotated`
  // (the user/app rotation request) instead of being auto-only for
  // scientific. Applies on non-desktop phones held in portrait: the shell is
  // CSS-rotated 90deg (see tokens.css [data-force-landscape]). `rotated` is
  // auto-set true on entering scientific (TGC-24 #6 auto-force-landscape)
  // and toggled by the ↻ button on web, so rotation works in any mode, not
  // just scientific. Turns off the moment the device is physically rotated
  // to landscape (orientation flips), so a real native lock + CSS never
  // double-rotate.
  const forceLandscape =
    !showPicker &&
    !isDesktop &&
    tier === 'phone' &&
    rotated &&
    orientation.orientation === 'portrait';
  const effectiveOrient: 'landscape' | 'portrait' =
    forceLandscape || orientation.orientation === 'landscape' ? 'landscape' : 'portrait';

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
      // ponytail: editable fields of other modes own their keystrokes. Bail
      // before the routing below so typed chars reach the field natively
      // instead of being preventDefault()'d into the basic calculator. The
      // basic calculator's Expression input is readOnly and excluded by
      // isEditableFieldTarget, so its TGC-20 handling below is preserved.
      if (isEditableFieldTarget(e.target)) return;
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
  useKeyboardExtras(calc, handleModeChange);

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
        data-desktop={dataDesktop ? 'true' : 'false'}
        data-aspect={aspectLocked ? 'locked' : 'auto'}
        data-platform={isMobileNative ? 'native' : isDesktop ? 'desktop' : isWeb ? 'web' : 'unknown'}
      >
        <div className="app-toolbar app-toolbar--picker">
          {dataDesktop && (
            <Pill
              onClick={() => setAspectLocked((v) => !v)}
              ariaLabel={aspectLocked ? t('common.aspect.unlock') : t('common.aspect.lock')}
              testId="toggle-aspect"
            >
              <span aria-hidden style={{ fontSize: 16 }}>{aspectLocked ? '\u{1F512}' : '\u{1F513}'}</span>
            </Pill>
          )}
          <Pill
            onClick={() => onPick('history')}
            ariaLabel={t('mode.history')}
            testId="open-history-picker"
          >
            <span aria-hidden style={{ fontSize: 16 }}>{'◷'}</span>
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
      className={`shell${calc.state.mode === 'scientific' ? ' shell--scientific' : ''}`}
      data-tier={tier}
      data-desktop={dataDesktop ? 'true' : 'false'}
      data-aspect={aspectLocked ? 'locked' : 'auto'}
      data-orient={effectiveOrient}
      data-force-landscape={forceLandscape ? 'true' : 'false'}
      data-platform={isMobileNative ? 'native' : isDesktop ? 'desktop' : isWeb ? 'web' : 'unknown'}
    >
      <div className="app-toolbar">
        {calc.state.mode === 'scientific' && (
          <Pill
            size="lg"
            onClick={() => calc.setAngle(calc.state.angle === 'deg' ? 'rad' : 'deg')}
            ariaLabel={`Angle mode, currently ${calc.state.angle.toUpperCase()}`}
            testId="toggle-angle"
          >
            {calc.state.angle.toUpperCase()}
          </Pill>
        )}
        <Pill
          onClick={onExitToPicker}
          ariaLabel={t('common.home')}
          testId="exit-to-picker"
        >
          <span aria-hidden style={{ fontSize: 16 }}>{'\u2302'}</span>
        </Pill>
        {calc.state.mode !== 'history' && (
          <Pill
            onClick={() => handleModeChange('history')}
            ariaLabel={t('mode.history')}
            testId="open-history"
          >
            <span aria-hidden style={{ fontSize: 16 }}>{'◷'}</span>
          </Pill>
        )}
        <Pill
          onClick={() => {
            // ponytail (TGC-26 #4 root fix): the ↻ button must actually do
            // something on every platform. The old wiring called the dead
            // Screen Orientation API on web (no-op on iOS Safari / non-
            // fullscreen), so the button did nothing - "rotate键不生效".
            // Desktop (dataDesktop - reactive, matches the aspect CSS gate,
            // unlike the old static isDesktop which drifted at 768-1023px):
            // toggle the 9/16 aspect lock (tall shell ↔ wide column). Native
            // mobile: toggle the real orientation lock (works on Capacitor).
            // Web non-desktop: toggle CSS force-landscape (rotated), the only
            // mechanism that actually rotates on web.
            if (dataDesktop) {
              setAspectLocked((v) => !v);
            } else if (isMobileNative) {
              void orientation.toggle();
            } else {
              setRotated((v) => !v);
            }
          }}
          ariaLabel={
            dataDesktop
              ? (aspectLocked ? t('common.rotate.desktopUnlocked') : t('common.rotate.desktopLocked'))
              : t('common.rotate')
          }
          testId="toggle-orientation"
        >
          <span aria-hidden style={{ fontSize: 16 }}>{'↻'}</span>
          <span>{t('common.rotate.short')}</span>
        </Pill>
        {dataDesktop && (
          <Pill
            onClick={() => setAspectLocked((v) => !v)}
            ariaLabel={aspectLocked ? t('common.aspect.unlock') : t('common.aspect.lock')}
            testId="toggle-aspect"
          >
            <span aria-hidden style={{ fontSize: 16 }}>{aspectLocked ? '\u{1F512}' : '\u{1F513}'}</span>
          </Pill>
        )}
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
      {calc.state.mode !== 'history' && calc.state.mode !== 'date' && calc.state.mode !== 'units' && calc.state.mode !== 'programmer' && calc.state.mode !== 'chemistry' && calc.state.mode !== 'advanced' && calc.state.mode !== 'loan' && calc.state.mode !== 'tax' && calc.state.mode !== 'kin' && (
        <div className="display-area" style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-display)', color: 'var(--text-display)' }}>
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
      ) : calc.state.mode === 'chemistry' ? (
        <ChemBalancer />
      ) : calc.state.mode === 'advanced' ? (
        <AdvancedMath />
      ) : calc.state.mode === 'loan' ? (
        <Loan />
      ) : calc.state.mode === 'tax' ? (
        <Tax />
      ) : calc.state.mode === 'kin' ? (
        <Kin />
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