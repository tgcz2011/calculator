// ponytail: independent keydown listener. The existing src/native/keyboard.ts
// `useKeyboard` short-circuits on meta/ctrl (`if (e.metaKey || e.ctrlKey) return`)
// and has no handler for arrow keys, so Cmd/Ctrl+ shortcuts and cursor nav
// silently do nothing today. This hook sits alongside it as a second listener —
// both fire on every keydown, the two never race because their key sets
// don't overlap. No changes to src/native/keyboard.ts, no engine / history
// / sync contract changes, no Platform selector coupling.
import { useEffect } from 'react';
import type { Calculator, Mode } from '../state/useCalculator';

const MODE_KEYS: Record<string, Mode> = {
  '1': 'basic',
  '2': 'scientific',
  '3': 'history',
  '4': 'programmer',
  '5': 'units',
  '6': 'date',
};

function isTextInputTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return t.isContentEditable;
}

export function useKeyboardExtras(calc: Calculator): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't hijack typing in inputs / contenteditable.
      if (isTextInputTarget(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key;

      if (mod && !e.shiftKey && !e.altKey && (key === 'z' || key === 'Z')) {
        e.preventDefault();
        calc.undo();
        return;
      }
      if (
        mod &&
        !e.altKey &&
        ((e.shiftKey && (key === 'z' || key === 'Z')) || (!e.shiftKey && (key === 'y' || key === 'Y')))
      ) {
        e.preventDefault();
        calc.redo();
        return;
      }

      if (mod && !e.shiftKey && !e.altKey && MODE_KEYS[key]) {
        e.preventDefault();
        calc.setMode(MODE_KEYS[key]);
        return;
      }

      if (!mod && key === 'ArrowLeft') {
        e.preventDefault();
        calc.setCursor(Math.max(0, calc.state.cursor - 1));
        return;
      }
      if (!mod && key === 'ArrowRight') {
        e.preventDefault();
        calc.setCursor(Math.min(calc.state.expression.length, calc.state.cursor + 1));
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [calc]);
}
