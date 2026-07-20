import type { AngleMode } from '../engine';
import { Key } from './Key';

// ponytail: scientific row used to render 12 fn buttons in a single flex line
// with `margin: 4px`, which crushed everything to unreadable widths on phones.
// Now it's a 4-col × 3-row grid that aligns with the main keypad column count -
// the keypad reads as one cohesive grid instead of a header blob + a grid.

interface Props {
  scientific: boolean;
  angle: AngleMode;
  onInsert(t: string): void;
  onBackspace(): void;
  onClear(): void;
  onAllClear(): void;
  onEquals(): void;
  onAngle(m: AngleMode): void;
}

interface FuncDef {
  label: string;
  insert: string;
  aria: string;
}

// 4 cols × 3 rows = 12, matching the main keypad width so the grid stays aligned.
//
// ponytail (TGC-20): `(` and `)` used to live in SCI_FUNCS too, but now the
// basic-mode keypad (always rendered) owns the paren keys — so users in
// scientific mode share the same paren keys instead of seeing two pairs.
// We replaced the duplicates with `1/x` and `n!` so the 12-key grid stays
// balanced.
const SCI_FUNCS: FuncDef[] = [
  { label: 'sin', insert: 'sin(', aria: 'Sine' },
  { label: 'cos', insert: 'cos(', aria: 'Cosine' },
  { label: 'tan', insert: 'tan(', aria: 'Tangent' },
  { label: 'π', insert: 'π', aria: 'Pi' },
  { label: 'ln', insert: 'ln(', aria: 'Natural log' },
  { label: 'log', insert: 'log10(', aria: 'Log base 10' },
  { label: '√', insert: '√(', aria: 'Square root' },
  { label: 'e', insert: 'e', aria: 'Euler number' },
  { label: '1/x', insert: '^(-1)', aria: 'Reciprocal' },
  { label: 'n!', insert: '!', aria: 'Factorial' },
  { label: 'x²', insert: '^2', aria: 'Square' },
  { label: 'xʸ', insert: '^', aria: 'Exponent' },
];

export function Keypad(props: Props) {
  return (
    <div
      style={{
        '--key-size': 'clamp(56px, 13vw, 76px)',
        padding: 'var(--s-2) var(--s-3)',
        // ponytail: scientific mode adds 2 rows of function keys on top of the
        // 6 main rows. On a phone (esp. portrait) that pushed the keypad tall
        // enough to squeeze the display area, and the result overlapped the
        // top row of buttons. Let the keypad scroll instead of overflowing
        // into the display — the display keeps its flex space, the keypad
        // shrinks and scrolls internally if it doesn't fit.
        overflow: 'auto',
        flexShrink: 1,
      } as React.CSSProperties}
    >
      {props.scientific && (
        <div
          style={{
            // ponytail: 6 cols × 2 rows for the 12 scientific functions — denser
            // than the old 4×3 grid of full-size keys, so the scientific keypad
            // is one row shorter and benefits from landscape width. Compact
            // key size keeps each button readable without dominating the layout.
            display: 'grid',
            gridTemplateColumns: 'repeat(6, 1fr)',
            gap: 0,
            marginBottom: 'var(--s-1)',
          }}
        >
          {SCI_FUNCS.map((fn) => (
            <Key
              key={fn.label}
              label={fn.label}
              variant="fn"
              size="compact"
              onClick={() => props.onInsert(fn.insert)}
              ariaLabel={fn.aria}
            />
          ))}
        </div>
      )}
      {/*
        Layout (TGC-20):
          Row 0: AC, (, ), ⌫          (clear / paren-pair / backspace)
          Row 1: ±, %, ÷, ×           (negate, percent, divide, multiply)
          Row 2: 7, 8, 9, −
          Row 3: 4, 5, 6, +
          Row 4: 1, 2, 3, (gap)       (gap = right margin, equals lives in row 5 to keep its standard spot)
          Row 5: 0 (wide), ., =
      */}
      <Row>
        <Key label="AC" variant="fn" onClick={props.onClear} onHold={props.onAllClear} ariaLabel="All clear" />
        <Key label="(" variant="fn" onClick={() => props.onInsert('(')} ariaLabel="Open parenthesis" />
        <Key label=")" variant="fn" onClick={() => props.onInsert(')')} ariaLabel="Close parenthesis" />
        <Key label="⌫" variant="fn" onClick={props.onBackspace} ariaLabel="Backspace" />
      </Row>
      <Row>
        <Key label="±" variant="fn" onClick={() => props.onInsert('*(-1)')} ariaLabel="Negate" />
        <Key label="%" variant="fn" onClick={() => props.onInsert('/100')} ariaLabel="Percent" />
        <Key label="÷" variant="op" onClick={() => props.onInsert('÷')} ariaLabel="Divide" />
        <Key label="×" variant="op" onClick={() => props.onInsert('×')} ariaLabel="Multiply" />
      </Row>
      <Row>
        <Key label="7" variant="num" onClick={() => props.onInsert('7')} />
        <Key label="8" variant="num" onClick={() => props.onInsert('8')} />
        <Key label="9" variant="num" onClick={() => props.onInsert('9')} />
        <Key label="−" variant="op" onClick={() => props.onInsert('-')} ariaLabel="Subtract" />
      </Row>
      <Row>
        <Key label="4" variant="num" onClick={() => props.onInsert('4')} />
        <Key label="5" variant="num" onClick={() => props.onInsert('5')} />
        <Key label="6" variant="num" onClick={() => props.onInsert('6')} />
        <Key label="+" variant="op" onClick={() => props.onInsert('+')} ariaLabel="Add" />
      </Row>
      {/*
        Bottom two rows are a 4×2 CSS grid (not two flex Rows) so the = key
        spans both rows in column 4 (Apple-style tall equals). Previously the
        "1 2 3" row had only 3 keys stretched across 4 columns, so each digit
        was 1/3-width and "3" visually landed in the operator column (under
        − and +). With the grid, 1/2/3 each occupy column 1/2/3 so "3" lines
        up under 6 and 9, and the tall = fills column 4 for both rows. The 0
        key spans columns 1-2 of the second row (wide "0"). */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gridTemplateRows: 'repeat(2, var(--key-size))',
          gap: 0,
        }}
      >
        <Key label="1" variant="num" onClick={() => props.onInsert('1')} style={{ gridColumn: '1', gridRow: '1' }} />
        <Key label="2" variant="num" onClick={() => props.onInsert('2')} style={{ gridColumn: '2', gridRow: '1' }} />
        <Key label="3" variant="num" onClick={() => props.onInsert('3')} style={{ gridColumn: '3', gridRow: '1' }} />
        <Key
          label="="
          variant="op"
          onClick={props.onEquals}
          ariaLabel="Equals"
          testId="key-equals"
          style={{ gridColumn: '4', gridRow: '1 / 3', height: 'auto', minHeight: 'auto' }}
        />
        <Key label="0" variant="num" onClick={() => props.onInsert('0')} style={{ gridColumn: '1 / 3', gridRow: '2', justifyContent: 'flex-start', paddingLeft: 'calc(var(--key-size) * 0.32)' }} />
        <Key label="." variant="num" onClick={() => props.onInsert('.')} style={{ gridColumn: '3', gridRow: '2' }} />
      </div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex' }}>{children}</div>;
}