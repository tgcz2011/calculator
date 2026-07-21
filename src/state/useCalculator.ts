import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { engine, type AngleMode } from '../engine';
import { history } from '../history/api';

export type Mode = 'basic' | 'scientific' | 'history' | 'programmer' | 'units' | 'date' | 'chemistry' | 'advanced' | 'loan' | 'tax' | 'kin';

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
  /** True when the displayed live result is the sticky last-good value
   *  (current eval is a deferred error like UNCLOSED/PAREN/MISSING_OPERAND).
   *  UI uses this to visually mark the result as stale. Value is unchanged. */
  liveSticky: boolean;
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
  /** Apple-style percent: rewrites the trailing number based on the operator
   *  preceding it. See M1 in the UX fixes spec. */
  percent: () => void;
  /** Apple-style negate: empty -> `-`; otherwise evaluates `-(expr)` and
   *  replaces the expression with the result. No-op when the expression
   *  ends with an operator. */
  negate: () => void;
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

  // ponytail (UX): keep the last *successful* live result sticky while the user
  // is mid-typing an expression. Old behavior: typing "5" showed "5" as the
  // live result; pressing "+" made the expression "5+", which evaluates to a
  // MISSING_OPERAND error, so the result vanished on the spot — felt
  // discontinuous ("结果会突然消失"). New behavior: when the current live eval
  // is a deferred error (UNCLOSED/PAREN/MISSING_OPERAND — i.e. "expression
  // isn't finished yet, not wrong"), keep showing the last good value so the
  // result stays coherent while the user types the next operand. Real errors
  // (UNKNOWN_SYMBOL/NOT_FUNCTION) and committed errors still clear it.
  const lastGoodLiveRef = useRef('');
  useEffect(() => {
    if (live.value && !live.error) lastGoodLiveRef.current = live.value;
  }, [live.value, live.error]);

  // ponytail: deferred codes (UNCLOSED / PAREN / MISSING_OPERAND) are filtered
  // out of the *live* error slot so typing doesn't yell at the user. They
  // resurface only when `equals()` evaluates and stashes them in committedError.
  const liveResult =
    live.value && !live.error
      ? live.value
      : live.error && live.errorCode && DEFERRED_ERROR_CODES.has(live.errorCode)
        ? lastGoodLiveRef.current  // sticky: keep last good result while typing
        : '';
  const liveError =
    live.error && live.errorCode && DEFERRED_ERROR_CODES.has(live.errorCode)
      ? ''
      : live.error;
  const liveErrorCode =
    live.error && live.errorCode && DEFERRED_ERROR_CODES.has(live.errorCode)
      ? ''
      : live.errorCode;
  // ponytail (M8): the displayed live value is "sticky" (last good value)
  // when the current eval is a deferred error AND we have a last good value
  // to show. UI uses this flag to dim the result so the user knows the value
  // isn't fresh. The value itself is unchanged.
  const liveSticky =
    !!live.error &&
    !!live.errorCode &&
    DEFERRED_ERROR_CODES.has(live.errorCode) &&
    !!lastGoodLiveRef.current;

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

  // ponytail (M1): Apple-style percent. The keypad used to insert `/100`
  // verbatim, which gave `50+10%` = 50.1 instead of Apple's 55
  // (= 50 + 10% of 50). This rewrites the trailing number based on the
  // operator preceding it:
  //   - empty / ends with operator: no-op (can't apply % to nothing)
  //   - single number `50`        -> `(50/100)`              = 0.5
  //   - `...+num` / `...-num`     -> `${expr}*(left)/100`   (left = evaluated LHS)
  //   - `...*num` / `.../num`     -> `${expr}/100`          (50*10% = 5)
  //   - anything else             -> fall back to `${expr}/100` (old behavior)
  // We dispatch `commit` (not `insert`) because we're replacing the entire
  // expression text — the spec's "rewrite" / "replace" wording. `commit`'s
  // `committed` slot is only used as a "is there anything to clear?" flag,
  // so overloading it here is safe.
  const percent = useCallback(() => {
    const expr = state.expression;
    if (!expr) return;
    // Strip trailing whitespace so the regex tests are robust.
    const trimmed = expr.replace(/\s+$/, '');
    if (!trimmed) return;
    const last = trimmed[trimmed.length - 1];
    if ('+-*/×÷'.includes(last)) return; // ends with operator -> no-op

    // Single number? `50` -> `(50/100)`.
    const single = trimmed.match(/^(\d+(?:\.\d+)?)$/);
    if (single) {
      dispatch({ kind: 'commit', result: `(${single[1]}/100)`, error: '', errorCode: '' });
      return;
    }

    // Ends with `op number`?
    const m = trimmed.match(/^(.*?)([+\-*/×÷])\s*(\d+(?:\.\d+)?)$/);
    if (m) {
      const [, left, op] = m;
      if (op === '+' || op === '-') {
        // Evaluate the LHS so e.g. `50+10+20` -> `50+10+20*(60)/100` = 72.
        const leftNorm = normalize(left);
        const leftRes = engine.evaluate(leftNorm, { angle: state.angle });
        if (leftRes.error || !leftRes.value) {
          // Couldn't evaluate LHS — fall back to old `/100` behavior.
          dispatch({ kind: 'commit', result: `${trimmed}/100`, error: '', errorCode: '' });
          return;
        }
        dispatch({
          kind: 'commit',
          result: `${trimmed}*(${leftRes.value})/100`,
          error: '',
          errorCode: '',
        });
        return;
      }
      // `*` or `/`: Apple treats `50*10%` as `50*0.1` = 5 = `50*10/100`.
      dispatch({ kind: 'commit', result: `${trimmed}/100`, error: '', errorCode: '' });
      return;
    }

    // Otherwise (e.g. ends with `)` or `!`): fall back to old `/100` behavior.
    dispatch({ kind: 'commit', result: `${trimmed}/100`, error: '', errorCode: '' });
  }, [state.expression, state.angle]);

  // ponytail (M2): Apple-style negate. The keypad used to insert `*(-1)`
  // verbatim, which silently failed on empty expressions (no visible error
  // — MISSING_OPERAND is deferred). Now:
  //   - empty expr           -> insert `-` (negative sign prefix)
  //   - ends with operator   -> no-op (can't negate nothing)
  //   - otherwise            -> evaluate `-(expr)` and replace expression
  //                            with the result. If evaluation fails, no-op.
  const negate = useCallback(() => {
    const expr = state.expression;
    if (!expr) {
      dispatch({ kind: 'insert', text: '-' });
      return;
    }
    const trimmed = expr.replace(/\s+$/, '');
    if (!trimmed) {
      dispatch({ kind: 'insert', text: '-' });
      return;
    }
    const last = trimmed[trimmed.length - 1];
    if ('+-*/×÷'.includes(last)) return; // ends with operator -> no-op

    const r = engine.evaluate(`-(${normalized})`, { angle: state.angle });
    if (r.error || !r.value) return; // eval failed -> no-op (don't corrupt expr)
    dispatch({ kind: 'commit', result: r.value, error: '', errorCode: '' });
  }, [state.expression, state.angle, normalized]);

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
    liveSticky,
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
    percent,
    negate,
  };
}