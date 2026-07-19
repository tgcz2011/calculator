// Programmer mode UI. Hex/dec/oct/bin input + bitwise ops on a fixed word
// size (BYTE / WORD / DWORD / QWORD). Per the engine contract:
// - options.radix + options.wordSize routes to the BigInt evaluator
// - result.value = primary (signed dec for radix 10, else unsigned in input radix)
// - result.radix = unpadded all-radix reps; UI pads per wordSize
//
// ponytail: don't try to share useCalculator's reducer - radix/wordSize state
// is mode-local, and the engine.evaluate path differs (options-driven BigInt
// vs mathjs). Self-contained state keeps the mode's contract crisp.

import { type ReactNode, useEffect, useReducer, useState } from 'react';
import { engine, type Radix, type WordSize, type RadixRepr } from '../engine';
import { history } from '../history/api';
import { Key } from './Key';
import { Chip, ChipSegment } from './Chip';
import { Panel } from './Panel';

const RADIXES: { id: Radix; label: string; prefix: string }[] = [
  { id: 16, label: 'HEX', prefix: '0x' },
  { id: 10, label: 'DEC', prefix: '' },
  { id: 8, label: 'OCT', prefix: '0o' },
  { id: 2, label: 'BIN', prefix: '0b' },
];

const WORD_SIZES: { id: WordSize; label: string }[] = [
  { id: 8, label: 'BYTE' },
  { id: 16, label: 'WORD' },
  { id: 32, label: 'DWORD' },
  { id: 64, label: 'QWORD' },
];

const HEX_DIGITS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
const DEC_DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const OCT_DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7'];
const BIN_DIGITS = ['0', '1'];

function padHex(s: string, wordSize: WordSize): string {
  const width = wordSize / 4;
  return s.toUpperCase().padStart(width, '0');
}

function padBin(s: string, wordSize: WordSize): string {
  return s.padStart(wordSize, '0');
}

function padOct(s: string, wordSize: WordSize): string {
  // Octal: ~3 bits per digit, no clean alignment. Pad to wordSize/3*1 rounded up.
  const width = Math.ceil((wordSize / 3) * 1);
  return s.padStart(width, '0');
}

function fmtRadix(repr: RadixRepr, radix: Radix, wordSize: WordSize): string {
  switch (radix) {
    case 16: return padHex(repr.hex, wordSize);
    case 10: return repr.dec;
    case 8: return padOct(repr.oct, wordSize);
    case 2: return padBin(repr.bin, wordSize);
  }
}

function lastNumberToken(expr: string): string {
  // For radix switching: extract the most recent contiguous token of digits/letters
  // at the end of the expression so we can reformat via toRadix.
  const m = /([0-9A-Fa-f]+)\s*$/.exec(expr);
  return m ? m[1] : '';
}

interface UiState {
  expr: string;
  lastResult: RadixRepr | null;
  lastResultRadix: Radix;
  lastResultWord: WordSize;
}

type Action =
  | { kind: 'insert'; text: string }
  | { kind: 'backspace' }
  | { kind: 'clear' }
  | { kind: 'allclear' }
  | { kind: 'commit'; repr: RadixRepr }
  | { kind: 'replace'; expr: string };

function reducer(s: UiState, a: Action): UiState {
  switch (a.kind) {
    case 'insert': return { ...s, expr: s.expr + a.text };
    case 'backspace': return { ...s, expr: s.expr.slice(0, -1) };
    case 'clear': return { ...s, expr: '' };
    case 'allclear': return { ...s, expr: '', lastResult: null };
    // ponytail: keep expr as the user's input after `=`. Re-evaluating with
    // current radix gives the right primary (e.g. "FF+1" -> 0x100 padded).
    // Setting expr to dec was a footgun: in HEX the new expr "256" was
    // re-parsed as hex 0x256 = 598, making the display lie about the answer.
    case 'commit': return { ...s, expr: s.expr, lastResult: a.repr };
    case 'replace': return { ...s, expr: a.expr };
  }
}

export function Programmer() {
  const [radix, setRadix] = useState<Radix>(16);
  const [wordSize, setWordSize] = useState<WordSize>(64);
  const [state, dispatch] = useReducer(reducer, {
    expr: '',
    lastResult: null,
    lastResultRadix: 16,
    lastResultWord: 64,
  });
  const [error, setError] = useState<string>('');

  // Sync defaults to engine so anyone calling evaluate without options lands here.
  useEffect(() => {
    engine.setProgrammer({ radix, wordSize });
  }, [radix, wordSize]);

  const live = state.expr
    ? engine.evaluate(state.expr, { radix, wordSize })
    : null;
  const liveError = live?.error ?? '';
  const liveRepr = live?.radix;

  function onInsert(text: string) {
    setError('');
    dispatch({ kind: 'insert', text });
  }

  function onBackspace() {
    setError('');
    dispatch({ kind: 'backspace' });
  }

  function onClear() {
    setError('');
    dispatch({ kind: 'clear' });
  }

  function onAllClear() {
    setError('');
    dispatch({ kind: 'allclear' });
  }

  function onEquals() {
    const r = engine.evaluate(state.expr, { radix, wordSize });
    if (r.error) {
      setError(r.error);
      return;
    }
    if (r.radix) {
      history.record(state.expr, r.value);
      dispatch({ kind: 'commit', repr: r.radix });
    }
  }

  // Switching radix while an expression exists: re-evaluate as a pure conversion
  // of the last token. Empty expr -> just toggle chip; result remains.
  function onSwitchRadix(next: Radix) {
    setRadix(next);
    if (state.lastResult) {
      // Commit-then-switch: re-emit lastResult as decimal so subsequent ops work.
      // The new radix's display will be `radix(lastResult, next, wordSize)` via fmtRadix.
      dispatch({ kind: 'commit', repr: state.lastResult });
    } else if (state.expr) {
      const token = lastNumberToken(state.expr);
      if (token) {
        // ponytail: toRadix() takes a DECIMAL string. The token was typed in the
        // current radix, so convert it to dec first (e.g. "10" in HEX -> 16).
        // Without this, "10" HEX would become 0xA when reformatted to DEC.
        const dec = parseInt(token, radix);
        if (Number.isFinite(dec)) {
          const r = engine.toRadix(dec.toString(), wordSize);
          const mapped = padByRadix(r, next, wordSize);
          const newExpr = state.expr.slice(0, state.expr.length - token.length) + mapped;
          dispatch({ kind: 'replace', expr: newExpr });
        }
      }
    }
  }

  function onSwitchWordSize(next: WordSize) {
    setWordSize(next);
    // Re-evaluate in the new word size to re-mask (e.g. 0xFF at QWORD stays FFFFFFFFFFFFFFFF at WORD).
    if (state.expr) {
      const r = engine.evaluate(state.expr, { radix, wordSize: next });
      if (r.radix && !r.error) {
        dispatch({ kind: 'commit', repr: r.radix });
      }
    }
  }

  const allowedDigits =
    radix === 16 ? new Set<string>([...DEC_DIGITS, ...HEX_DIGITS])
    : radix === 10 ? new Set<string>(DEC_DIGITS)
    : radix === 8 ? new Set<string>(OCT_DIGITS)
    : new Set<string>(BIN_DIGITS);

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--s-2)',
        padding: 'var(--s-2) var(--s-3) 0',
        overflow: 'auto',
        minHeight: 0,
      }}
      data-testid="programmer-mode"
    >
      <ChipRow label="进制" testIdPrefix="prog-radix">
        {RADIXES.map((r) => (
          <Chip
            key={r.id}
            role="radio"
            active={radix === r.id}
            onClick={() => onSwitchRadix(r.id)}
            testId={`prog-radix-${r.label.toLowerCase()}`}
            fill
          >
            {r.label}
          </Chip>
        ))}
      </ChipRow>

      <ChipRow label="字宽" testIdPrefix="prog-word">
        {WORD_SIZES.map((w) => (
          <Chip
            key={w.id}
            role="radio"
            active={wordSize === w.id}
            onClick={() => onSwitchWordSize(w.id)}
            testId={`prog-word-${w.id}`}
            fill
          >
            {w.label}
          </Chip>
        ))}
      </ChipRow>

      <Display
        radix={radix}
        wordSize={wordSize}
        liveRepr={liveRepr}
        liveValue={live?.value ?? ''}
        error={error || liveError}
        expr={state.expr}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {radix === 16 && (
          <Row>
            {HEX_DIGITS.map((d) => (
              <Key key={d} label={d} variant="num" size="compact" onClick={() => onInsert(d)} testId={`prog-key-${d}`} />
            ))}
          </Row>
        )}
        <Row>
          <Key label="<<" variant="fn" size="compact" onClick={() => onInsert('<<')} testId="prog-key-shl" />
          <Key label=">>" variant="fn" size="compact" onClick={() => onInsert('>>')} testId="prog-key-shr" />
          <Key label="%" variant="fn" size="compact" onClick={() => onInsert('%')} testId="prog-key-pct" />
          <Key label="AC" variant="danger" size="compact" onClick={onAllClear} testId="prog-key-ac" />
        </Row>
        <Row>
          <Key label="AND" variant="fn" size="compact" onClick={() => onInsert('&')} testId="prog-key-and" />
          <Key label="OR" variant="fn" size="compact" onClick={() => onInsert('|')} testId="prog-key-or" />
          <Key label="XOR" variant="fn" size="compact" onClick={() => onInsert('^')} testId="prog-key-xor" />
          <Key label="NOT" variant="fn" size="compact" onClick={() => onInsert('~')} testId="prog-key-not" />
        </Row>
        <Row>
          <Key label="(" variant="fn" size="compact" onClick={() => onInsert('(')} testId="prog-key-lparen" />
          <Key label=")" variant="fn" size="compact" onClick={() => onInsert(')')} testId="prog-key-rparen" />
          <Key label="C" variant="danger" size="compact" onClick={onClear} testId="prog-key-clear" />
          <Key label="⌫" variant="fn" size="compact" onClick={onBackspace} testId="prog-key-bs" />
        </Row>
        <Row>
          <Key label="7" variant="num" size="compact" mono disabled={!allowedDigits.has('7')} onClick={() => onInsert('7')} testId="prog-key-7" />
          <Key label="8" variant="num" size="compact" mono disabled={!allowedDigits.has('8')} onClick={() => onInsert('8')} testId="prog-key-8" />
          <Key label="9" variant="num" size="compact" mono disabled={!allowedDigits.has('9')} onClick={() => onInsert('9')} testId="prog-key-9" />
          <Key label="÷" variant="op" size="compact" onClick={() => onInsert('/')} testId="prog-key-div" />
        </Row>
        <Row>
          <Key label="4" variant="num" size="compact" mono disabled={!allowedDigits.has('4')} onClick={() => onInsert('4')} testId="prog-key-4" />
          <Key label="5" variant="num" size="compact" mono disabled={!allowedDigits.has('5')} onClick={() => onInsert('5')} testId="prog-key-5" />
          <Key label="6" variant="num" size="compact" mono disabled={!allowedDigits.has('6')} onClick={() => onInsert('6')} testId="prog-key-6" />
          <Key label="×" variant="op" size="compact" onClick={() => onInsert('*')} testId="prog-key-mul" />
        </Row>
        <Row>
          <Key label="1" variant="num" size="compact" mono disabled={!allowedDigits.has('1')} onClick={() => onInsert('1')} testId="prog-key-1" />
          <Key label="2" variant="num" size="compact" mono disabled={!allowedDigits.has('2')} onClick={() => onInsert('2')} testId="prog-key-2" />
          <Key label="3" variant="num" size="compact" mono disabled={!allowedDigits.has('3')} onClick={() => onInsert('3')} testId="prog-key-3" />
          <Key label="−" variant="op" size="compact" onClick={() => onInsert('-')} testId="prog-key-sub" />
        </Row>
        <Row>
          <Key label="0" variant="num" size="compact" mono disabled={!allowedDigits.has('0')} onClick={() => onInsert('0')} testId="prog-key-0" />
          <Key label="±" variant="fn" size="compact" onClick={() => onInsert('~')} testId="prog-key-neg" />
          <Key label="=" variant="op" size="compact" onClick={onEquals} testId="prog-key-eq" />
          <Key label="+" variant="op" size="compact" onClick={() => onInsert('+')} testId="prog-key-add" />
        </Row>
      </div>
    </div>
  );
}

function Display({
  radix,
  wordSize,
  liveRepr,
  liveValue,
  error,
  expr,
}: {
  radix: Radix;
  wordSize: WordSize;
  liveRepr: RadixRepr | undefined;
  liveValue: string;
  error: string;
  expr: string;
}) {
  const primary = liveRepr
    ? fmtRadix(liveRepr, radix, wordSize)
    : liveValue;

  return (
    <Panel testId="prog-display">
      <div
        style={{
          fontSize: 12,
          color: 'var(--text-tertiary)',
          fontFamily: 'var(--font-mono)',
          textAlign: 'right',
          minHeight: '1em',
          overflowWrap: 'anywhere',
        }}
        data-testid="prog-expr"
      >
        {expr || '\u00a0'}
      </div>
      <div
        style={{
          fontSize: 'clamp(20px, 5vw, 36px)',
          fontWeight: 300,
          letterSpacing: '-0.02em',
          color: error ? 'var(--danger)' : 'var(--text)',
          fontFamily: 'var(--font-mono)',
          textAlign: 'right',
          overflowWrap: 'anywhere',
          lineHeight: 1.1,
        }}
        data-testid="prog-primary"
        data-radix={radix}
        data-word-size={wordSize}
        data-error-code={error ? 'ENGINE' : undefined}
      >
        {error ? error : primary || '\u00a0'}
      </div>
      {liveRepr && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            marginTop: 4,
            paddingTop: 'var(--s-2)',
            borderTop: '0.5px solid var(--hairline)',
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            color: 'var(--text-secondary)',
          }}
          data-testid="prog-radix-table"
        >
          {RADIXES.map((r) => (
            <div
              key={r.id}
              style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}
              data-radix={r.id}
            >
              <span style={{ color: r.id === radix ? 'var(--accent)' : 'var(--text-tertiary)', fontWeight: 600, minWidth: 32 }}>
                {r.label}
              </span>
              <span
                style={{
                  color: r.id === radix ? 'var(--text)' : 'var(--text-secondary)',
                  overflowWrap: 'anywhere',
                  textAlign: 'right',
                  flex: 1,
                }}
                data-testid={`prog-radix-${r.label.toLowerCase()}-value`}
              >
                {fmtRadix(liveRepr, r.id, wordSize)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function ChipRow({
  label,
  testIdPrefix,
  children,
}: {
  label: string;
  testIdPrefix: string;
  children: ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
      <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, letterSpacing: '0.04em', minWidth: 28 }}>
        {label}
      </span>
      <ChipSegment role="radiogroup" ariaLabel={label} testId={`${testIdPrefix}-row`} layout="fill" shape="card">
        {children}
      </ChipSegment>
    </div>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', gap: 4 }}>{children}</div>;
}

function padByRadix(repr: RadixRepr, radix: Radix, wordSize: WordSize): string {
  return fmtRadix(repr, radix, wordSize);
}