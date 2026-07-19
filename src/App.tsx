import { useCallback, useEffect, useState } from 'react';
import { Display } from './components/Display';
import { Keypad } from './components/Keypad';
import { TabBar } from './components/TabBar';
import { HistoryList } from './components/HistoryList';
import { SyncSettings } from './components/SyncSettings';
import { DateTime } from './components/DateTime';
import { Units } from './components/Units';
import { Programmer } from './components/Programmer';
import { useCalculator } from './state/useCalculator';
import { useKeyboard } from './native/keyboard';
import { useKeyboardExtras } from './hooks/useKeyboardExtras';
import { useTheme } from './hooks/useTheme';
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

export default function App() {
  const calc = useCalculator();
  const tier = useShellWidth();
  const { theme, toggle: toggleTheme } = useTheme();
  const [syncOpen, setSyncOpen] = useState(false);

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      // Cmd/Ctrl-Z, Cmd-Shift-Z, Cmd-Y -> undo/redo (handled by reducer via dispatch would need
      // extra plumbing; skip at App level to avoid coupling).
      if (e.metaKey || e.ctrlKey) return;
      if (e.key === 'Enter' || e.key === '=') {
        e.preventDefault();
        calc.equals();
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        calc.backspace();
        return;
      }
      if (e.key === 'Escape') {
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
      const letterMap: Record<string, string> = {};
      for (let c = 0; c < 26; c++) {
        const lower = String.fromCharCode(97 + c);
        const upper = String.fromCharCode(65 + c);
        letterMap[lower] = lower;
        letterMap[upper] = upper;
      }
      const map: Record<string, string> = {
        ...letterMap,
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
    [calc],
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
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <TabBar
            mode={calc.state.mode}
            angle={calc.state.angle}
            onMode={calc.setMode}
            onAngle={calc.setAngle}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--s-2)', padding: 'var(--s-3) var(--s-4) var(--s-3) 0' }}>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={`切换到${theme === 'light' ? '深色' : '浅色'}主题`}
            title={`当前：${theme === 'light' ? '浅色' : '深色'}`}
            data-testid="toggle-theme"
            data-theme-toggle={theme}
            style={{
              width: 32,
              height: 32,
              borderRadius: 'var(--radius-full)',
              background: 'var(--key-fn-bg)',
              color: 'var(--key-fn-fg)',
              fontSize: 16,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span aria-hidden>{theme === 'light' ? '\u263D' : '\u2600'}</span>
          </button>
          <button
            type="button"
            onClick={() => setSyncOpen(true)}
            aria-label="同步设置"
            data-testid="open-sync-settings"
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--radius-full)',
              background: 'var(--key-fn-bg)',
              color: 'var(--key-fn-fg)',
              fontSize: 13,
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              height: 32,
            }}
          >
            <span aria-hidden style={{ fontSize: 16 }}>{'\u2699'}</span>
            <span>同步</span>
          </button>
        </div>
      </div>
      {calc.state.mode !== 'history' && calc.state.mode !== 'date' && calc.state.mode !== 'units' && calc.state.mode !== 'programmer' && (
        <div className="display-area" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <Display
            expression={calc.state.expression}
            result={calc.live}
            error={calc.liveError}
            errorCode={calc.liveErrorCode}
            cursor={calc.state.cursor}
            onCursor={calc.setCursor}
            onBackspace={calc.backspace}
            onClear={calc.clear}
            onAllClear={calc.allClear}
            onEquals={calc.equals}
            onUndo={calc.undo}
            onRedo={calc.redo}
          />
        </div>
      )}
      {calc.state.mode === 'history' ? (
        <HistoryList
          bump={calc.state.historyVersion}
          onRecall={calc.recall}
          onClear={calc.clearHistory}
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
        />
      )}
      {calc.state.mode !== 'history' && tier === 'phone' && (
        <div style={{ textAlign: 'center', padding: 'var(--s-1)', color: 'var(--fg-tertiary)', fontSize: 11 }}>
          Tap AC to clear · long-press AC to reset
        </div>
      )}
      <SyncSettings open={syncOpen} onClose={() => setSyncOpen(false)} />
    </main>
  );
}