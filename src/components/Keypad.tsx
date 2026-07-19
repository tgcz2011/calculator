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
const SCI_FUNCS: FuncDef[] = [
  { label: 'sin', insert: 'sin(', aria: 'Sine' },
  { label: 'cos', insert: 'cos(', aria: 'Cosine' },
  { label: 'tan', insert: 'tan(', aria: 'Tangent' },
  { label: 'π', insert: 'π', aria: 'Pi' },
  { label: 'ln', insert: 'ln(', aria: 'Natural log' },
  { label: 'log', insert: 'log10(', aria: 'Log base 10' },
  { label: '√', insert: '√(', aria: 'Square root' },
  { label: 'e', insert: 'e', aria: 'Euler number' },
  { label: '(', insert: '(', aria: 'Open parenthesis' },
  { label: ')', insert: ')', aria: 'Close parenthesis' },
  { label: 'x²', insert: '^2', aria: 'Square' },
  { label: 'xʸ', insert: '^', aria: 'Exponent' },
];

export function Keypad(props: Props) {
  return (
    <div
      style={{
        '--key-size': 'clamp(56px, 13vw, 76px)',
        padding: 'var(--s-2) var(--s-3)',
      } as React.CSSProperties}
    >
      {props.scientific && (
        <>
          <Row>
            <Key label={SCI_FUNCS[0].label} variant="fn" onClick={() => props.onInsert(SCI_FUNCS[0].insert)} ariaLabel={SCI_FUNCS[0].aria} />
            <Key label={SCI_FUNCS[1].label} variant="fn" onClick={() => props.onInsert(SCI_FUNCS[1].insert)} ariaLabel={SCI_FUNCS[1].aria} />
            <Key label={SCI_FUNCS[2].label} variant="fn" onClick={() => props.onInsert(SCI_FUNCS[2].insert)} ariaLabel={SCI_FUNCS[2].aria} />
            <Key label={SCI_FUNCS[3].label} variant="fn" onClick={() => props.onInsert(SCI_FUNCS[3].insert)} ariaLabel={SCI_FUNCS[3].aria} />
          </Row>
          <Row>
            <Key label={SCI_FUNCS[4].label} variant="fn" onClick={() => props.onInsert(SCI_FUNCS[4].insert)} ariaLabel={SCI_FUNCS[4].aria} />
            <Key label={SCI_FUNCS[5].label} variant="fn" onClick={() => props.onInsert(SCI_FUNCS[5].insert)} ariaLabel={SCI_FUNCS[5].aria} />
            <Key label={SCI_FUNCS[6].label} variant="fn" onClick={() => props.onInsert(SCI_FUNCS[6].insert)} ariaLabel={SCI_FUNCS[6].aria} />
            <Key label={SCI_FUNCS[7].label} variant="fn" onClick={() => props.onInsert(SCI_FUNCS[7].insert)} ariaLabel={SCI_FUNCS[7].aria} />
          </Row>
          <Row>
            <Key label={SCI_FUNCS[8].label} variant="fn" onClick={() => props.onInsert(SCI_FUNCS[8].insert)} ariaLabel={SCI_FUNCS[8].aria} />
            <Key label={SCI_FUNCS[9].label} variant="fn" onClick={() => props.onInsert(SCI_FUNCS[9].insert)} ariaLabel={SCI_FUNCS[9].aria} />
            <Key label={SCI_FUNCS[10].label} variant="fn" onClick={() => props.onInsert(SCI_FUNCS[10].insert)} ariaLabel={SCI_FUNCS[10].aria} />
            <Key label={SCI_FUNCS[11].label} variant="fn" onClick={() => props.onInsert(SCI_FUNCS[11].insert)} ariaLabel={SCI_FUNCS[11].aria} />
          </Row>
        </>
      )}
      <Row>
        <Key label="AC" variant="fn" onClick={props.onClear} onHold={props.onAllClear} ariaLabel="All clear" />
        <Key label="±" variant="fn" onClick={() => props.onInsert('*(-1)')} ariaLabel="Negate" />
        <Key label="%" variant="fn" onClick={() => props.onInsert('/100')} ariaLabel="Percent" />
        <Key label="÷" variant="op" onClick={() => props.onInsert('÷')} ariaLabel="Divide" />
      </Row>
      <Row>
        <Key label="7" variant="num" onClick={() => props.onInsert('7')} />
        <Key label="8" variant="num" onClick={() => props.onInsert('8')} />
        <Key label="9" variant="num" onClick={() => props.onInsert('9')} />
        <Key label="×" variant="op" onClick={() => props.onInsert('×')} ariaLabel="Multiply" />
      </Row>
      <Row>
        <Key label="4" variant="num" onClick={() => props.onInsert('4')} />
        <Key label="5" variant="num" onClick={() => props.onInsert('5')} />
        <Key label="6" variant="num" onClick={() => props.onInsert('6')} />
        <Key label="−" variant="op" onClick={() => props.onInsert('-')} ariaLabel="Subtract" />
      </Row>
      <Row>
        <Key label="1" variant="num" onClick={() => props.onInsert('1')} />
        <Key label="2" variant="num" onClick={() => props.onInsert('2')} />
        <Key label="3" variant="num" onClick={() => props.onInsert('3')} />
        <Key label="+" variant="op" onClick={() => props.onInsert('+')} ariaLabel="Add" />
      </Row>
      <Row>
        <Key label="0" variant="num" wide onClick={() => props.onInsert('0')} />
        <Key label="." variant="num" onClick={() => props.onInsert('.')} />
        <Key label="=" variant="op" onClick={props.onEquals} ariaLabel="Equals" />
      </Row>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex' }}>{children}</div>;
}