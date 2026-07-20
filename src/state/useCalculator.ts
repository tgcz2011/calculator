import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { engine, type AngleMode } from '../engine';
import { history } from '../history/api';

export type Mode = 'basic' | 'scientific' | 'history' | 'programmer' | 'units' | 'date';

// ponytail: codes that mean "expression isn't finished yet" rather than
// "expression is wrong". These are deferred — Display won't surface them
// until the user commits with `=` — so live typing like "1+2*" or "(1+2"
// doesn't yell at the user mid-keystroke.
const DEFERRED_ERROR_CODES = new Set(['UNCLOSED', 'PAREN', 'MISSING_OPERAND']);

interface Snapshot {
  expression: string;
  cursor: number;
}

interface State {
  expression: string;
  cursor: number;
  committed: string;
  /** Last committed (= press) error message — engine's localized text. */
  committedError: string;
  /** Last committed (= press) error code — stable across locales. */
  committedErrorCode: string;
  error: string;
  mode: Mode;
  angle: AngleMode;
  past: Snapshot[];
  future: Snapshot[];
  historyVersion: number;
}

type Action =
  | { kind: 'insert'; text: string; moveCursor?: boolean }
  | { kind: 'backspace' }
  | { kind: 'clear' }
  | { kind: 'allclear' }
  | { kind: 'commit'; result: string; error: string; errorCode: string }
  | { kind: 'cursor'; pos: number }
  | { kind: 'mode'; mode: Mode }
  | { kind: 'angle'; mode: AngleMode }
  | { kind: 'undo' }
  | { kind: 'redo' }
  | { kind: 'history-bump' };

function snapshotOf(s: State): Snapshot {
  return { expression: s.expression, cursor: s.cursor };
}

function push(s: State, snap: Snapshot): Snapshot[] {
  return [...s.past.slice(-99), snap];
}

function initial(): State {
  return {
    expression: '',
    cursor: 0,
    committed: '',
    committedError: '',
    committedErrorCode: '',
    error: '',
    mode: 'basic',
    angle: 'deg',
    past: [],
    future: [],
    historyVersion: 0,
  };
}

function reducer(s: State, a: Action): State {
  switch (a.kind) {
    case 'insert': {
      const before = s.expression.slice(0, s.cursor);
      const after = s.expression.slice(s.cursor);
      const expr = before + a.text + after;
      const cursor = a.moveCursor === false ? s.cursor : s.cursor + a.text.length;
      // ponytail: any keystroke invalidates a committed error (it was about
      // the previous expression state). Both committed and live error slots
      // reset so the Display goes back to the neutral state.
      return {
        ...s,
        expression: expr,
        cursor,
        error: '',
        committedError: '',
        committedErrorCode: '',
        past: push(s, snapshotOf(s)),
        future: [],
      };
    }
    case 'backspace': {
      if (s.cursor === 0) return s;
      const before = s.expression.slice(0, s.cursor - 1);
      const after = s.expression.slice(s.cursor);
      return {
        ...s,
        expression: before + after,
        cursor: s.cursor - 1,
        error: '',
        committedError: '',
        committedErrorCode: '',
        past: push(s, snapshotOf(s)),
        future: [],
      };
    }
    case 'clear': {
      if (!s.expression && !s.committed && !s.committedError && !s.error) return s;
      return {
        ...s,
        expression: '',
        cursor: 0,
        error: '',
        committedError: '',
        committedErrorCode: '',
        past: push(s, snapshotOf(s)),
        future: [],
      };
    }
    case 'allclear': {
      if (!s.expression && !s.committed && !s.error && !s.committedError) return s;
      return {
        ...s,
        expression: '',
        cursor: 0,
        committed: '',
        error: '',
        committedError: '',
        committedErrorCode: '',
        past: push(s, snapshotOf(s)),
        future: [],
      };
    }
    case 'commit': {
      if (!s.expression && !a.error) return s;
      if (a.error) {
        // ponytail: stash the committed error + code on the state so Display
        // can render it after the user presses `=`. We deliberately do NOT
        // mutate `expression` here — the user must see their input intact
        // so they can fix the typo, not get their text overwritten.
        return {
          ...s,
          committedError: a.error,
          committedErrorCode: a.errorCode,
          error: '',
          past: push(s, snapshotOf(s)),
          future: [],
        };
      }
      return {
        ...s,
        expression: a.result,
        cursor: a.result.length,
        committed: a.result,
        error: '',
        committedError: '',
        committedErrorCode: '',
        past: push(s, snapshotOf(s)),
        future: [],
      };
    }
    case 'cursor':
      return { ...s, cursor: a.pos };
    case 'mode':
      return { ...s, mode: a.mode };
    case 'angle':
      return { ...s, angle: a.mode };
    case 'undo': {
      if (!s.past.length) return s;
      const prev = s.past[s.past.length - 1];
      return {
        ...s,
        past: s.past.slice(0, -1),
        future: [snapshotOf(s), ...s.future].slice(0, 100),
        expression: prev.expression,
        cursor: prev.cursor,
      };
    }
    case 'redo': {
      if (!s.future.length) return s;
      const next = s.future[0];
      return {
        ...s,
        future: s.future.slice(1),
        past: [...s.past, snapshotOf(s)].slice(-100),
        expression: next.expression,
        cursor: next.cursor,
      };
    }
    case 'history-bump':
      return { ...s, historyVersion: s.historyVersion + 1 };
  }
}

const TOKEN_REPLACEMENTS: Array<[RegExp, string]> = [
  [/×/g, '*'],
  [/÷/g, '/'],
  [/−/g, '-'],
  [/π/g, 'pi'],
  [/√\(/g, 'sqrt('],
  [/(\d+(?:\.\d+)?)!/g, 'gamma($1+1)'],
];

function normalize(raw: string): string {
  let s = raw;
  for (const [re, replacement] of TOKEN_REPLACEMENTS) s = s.replace(re, replacement);
  return s;
}

export interface Calculator {
  state: State;
  live: string;
  /** Live error (deferred codes filtered out). UI should surface this live
   *  as the user types — covers UNKNOWN_SYMBOL, NOT_FUNCTION, etc. */
  liveError: string;
  liveErrorCode: string;
  /** Error captured at the last `=` press. Stays until the user edits.
   *  This is where deferred codes (UNCLOSED/PAREN/MISSING_OPERAND) appear. */
  committedError: string;
  committedErrorCode: string;
  insert: (text: string) => void;
  backspace: () => void;
  clear: () => void;
  allClear: () => void;
  equals: () => void;
  setCursor: (pos: number) => void;
  setMode: (m: Mode) => void;
  setAngle: (m: AngleMode) => void;
  undo: () => void;
  redo: () => void;
  recall: (expr: string, result: string) => void;
  clearHistory: () => void;
}

export function useCalculator(): Calculator {
  const [state, dispatch] = useReducer(reducer, undefined, initial);

  useEffect(() => {
    engine.setAngleMode(state.angle);
  }, [state.angle]);

  const expr = state.expression;
  const normalized = useMemo(() => normalize(expr), [expr]);
  const live = useMemo(() => {
    if (!normalized) return { value: '', error: '', errorCode: '' };
    const r = engine.evaluate(normalized, { angle: state.angle });
    return {
      value: r.value,
      error: r.error ?? '',
      errorCode: r.errorCode ?? '',
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalized, state.angle, state.historyVersion]);
  // ponytail: deferred codes (UNCLOSED / PAREN / MISSING_OPERAND) are filtered
  // out of the *live* error slot so typing doesn't yell at the user. They
  // resurface only when `equals()` evaluates and stashes them in committedError.
  const liveResult = live.value && !live.error ? live.value : '';
  const liveError =
    live.error && live.errorCode && DEFERRED_ERROR_CODES.has(live.errorCode)
      ? ''
      : live.error;
  const liveErrorCode =
    live.error && live.errorCode && DEFERRED_ERROR_CODES.has(live.errorCode)
      ? ''
      : live.errorCode;

  const insert = useCallback((text: string) => dispatch({ kind: 'insert', text }), []);
  const backspace = useCallback(() => dispatch({ kind: 'backspace' }), []);
  const clear = useCallback(() => dispatch({ kind: 'clear' }), []);
  const allClear = useCallback(() => dispatch({ kind: 'allclear' }), []);
  const setCursor = useCallback((pos: number) => dispatch({ kind: 'cursor', pos }), []);
  const setMode = useCallback((mode: Mode) => dispatch({ kind: 'mode', mode }), []);
  const setAngle = useCallback((mode: AngleMode) => dispatch({ kind: 'angle', mode }), []);
  const undo = useCallback(() => dispatch({ kind: 'undo' }), []);
  const redo = useCallback(() => dispatch({ kind: 'redo' }), []);

  const equals = useCallback(() => {
    if (!normalized) {
      // empty expression + press `=` → wipe any stale committed error so the
      // display settles back to neutral.
      dispatch({ kind: 'commit', result: '', error: '', errorCode: '' });
      return;
    }
    // ponytail: evaluate the normalized expression at commit time and stash
    // whatever the engine returns. Deferred codes (UNCLOSED/PAREN/MISSING_OPERAND)
    // become visible here for the first time; non-deferred codes (which were
    // already shown live) just re-affirm.
    const r = engine.evaluate(normalized, { angle: state.angle });
    if (r.error) {
      dispatch({ kind: 'commit', result: '', error: r.error ?? '', errorCode: r.errorCode ?? '' });
      return;
    }
    history.record(state.expression, r.value);
    dispatch({ kind: 'history-bump' });
    dispatch({ kind: 'commit', result: r.value, error: '', errorCode: '' });
  }, [normalized, state.angle, state.expression]);

  const recall = useCallback(
    (expression: string, result: string) => {
      dispatch({ kind: 'insert', text: expression });
      setTimeout(() => {
        dispatch({ kind: 'commit', result, error: '', errorCode: '' });
        dispatch({ kind: 'history-bump' });
      }, 0);
    },
    [],
  );

  const clearHistory = useCallback(() => {
    history.clear();
    dispatch({ kind: 'history-bump' });
  }, []);

  return {
    state,
    live: liveResult,
    liveError,
    liveErrorCode,
    committedError: state.committedError,
    committedErrorCode: state.committedErrorCode,
    insert,
    backspace,
    clear,
    allClear,
    equals,
    setCursor,
    setMode,
    setAngle,
    undo,
    redo,
    recall,
    clearHistory,
  };
}