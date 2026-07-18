import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { engine, type AngleMode } from '../engine';
import { history } from '../history/api';

export type Mode = 'basic' | 'scientific' | 'history' | 'date' | 'units';

interface Snapshot {
  expression: string;
  cursor: number;
}

interface State {
  expression: string;
  cursor: number;
  committed: string;
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
  | { kind: 'commit'; result: string }
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
      return { ...s, expression: expr, cursor, error: '', past: push(s, snapshotOf(s)), future: [] };
    }
    case 'backspace': {
      if (s.cursor === 0) return s;
      const before = s.expression.slice(0, s.cursor - 1);
      const after = s.expression.slice(s.cursor);
      return { ...s, expression: before + after, cursor: s.cursor - 1, past: push(s, snapshotOf(s)), future: [] };
    }
    case 'clear': {
      if (!s.expression && !s.committed) return s;
      return {
        ...s,
        expression: '',
        cursor: 0,
        error: '',
        past: push(s, snapshotOf(s)),
        future: [],
      };
    }
    case 'allclear': {
      if (!s.expression && !s.committed && !s.error) return s;
      return {
        ...s,
        expression: '',
        cursor: 0,
        committed: '',
        error: '',
        past: push(s, snapshotOf(s)),
        future: [],
      };
    }
    case 'commit': {
      if (!s.expression) return s;
      return {
        ...s,
        expression: a.result,
        cursor: a.result.length,
        committed: a.result,
        error: '',
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
  liveError: string;
  liveErrorCode: string;
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
    if (!normalized) return { value: '', error: '' };
    return engine.evaluate(normalized, { angle: state.angle });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalized, state.angle, state.historyVersion]);
  const liveResult = live.value && !live.error ? live.value : '';
  const liveError = live.error ?? '';
  const liveErrorCode = live.errorCode ?? '';

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
    if (!normalized) return;
    if (liveError) {
      dispatch({ kind: 'commit', result: state.expression });
      return;
    }
    history.record(state.expression, liveResult);
    dispatch({ kind: 'history-bump' });
    dispatch({ kind: 'commit', result: liveResult });
  }, [normalized, liveError, liveResult, state.expression]);

  const recall = useCallback(
    (expression: string, result: string) => {
      dispatch({ kind: 'insert', text: expression });
      setTimeout(() => {
        dispatch({ kind: 'commit', result });
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
