import type { AngleMode } from '../engine';
import { KeypadButton } from './KeypadButton';

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

const SCI_FUNCS: Array<{ label: string; insert: string; aria: string }> = [
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
        <div style={{ display: 'flex', marginBottom: 'var(--s-1)' }}>
          {SCI_FUNCS.map((k) => (
            <KeypadButton
              key={k.label}
              label={k.label}
              variant="fn"
              onClick={() => props.onInsert(k.insert)}
              ariaLabel={k.aria}
            />
          ))}
        </div>
      )}
      <Row>
        <KeypadButton label="AC" variant="fn" onClick={props.onClear} onHold={props.onAllClear} ariaLabel="All clear" />
        <KeypadButton label="±" variant="fn" onClick={() => props.onInsert('*(-1)')} ariaLabel="Negate" />
        <KeypadButton label="%" variant="fn" onClick={() => props.onInsert('/100')} ariaLabel="Percent" />
        <KeypadButton label="÷" variant="op" onClick={() => props.onInsert('÷')} ariaLabel="Divide" />
      </Row>
      <Row>
        <KeypadButton label="7" variant="num" onClick={() => props.onInsert('7')} />
        <KeypadButton label="8" variant="num" onClick={() => props.onInsert('8')} />
        <KeypadButton label="9" variant="num" onClick={() => props.onInsert('9')} />
        <KeypadButton label="×" variant="op" onClick={() => props.onInsert('×')} ariaLabel="Multiply" />
      </Row>
      <Row>
        <KeypadButton label="4" variant="num" onClick={() => props.onInsert('4')} />
        <KeypadButton label="5" variant="num" onClick={() => props.onInsert('5')} />
        <KeypadButton label="6" variant="num" onClick={() => props.onInsert('6')} />
        <KeypadButton label="−" variant="op" onClick={() => props.onInsert('-')} ariaLabel="Subtract" />
      </Row>
      <Row>
        <KeypadButton label="1" variant="num" onClick={() => props.onInsert('1')} />
        <KeypadButton label="2" variant="num" onClick={() => props.onInsert('2')} />
        <KeypadButton label="3" variant="num" onClick={() => props.onInsert('3')} />
        <KeypadButton label="+" variant="op" onClick={() => props.onInsert('+')} ariaLabel="Add" />
      </Row>
      <Row>
        <KeypadButton label="0" variant="num" double onClick={() => props.onInsert('0')} />
        <KeypadButton label="." variant="num" onClick={() => props.onInsert('.')} />
        <KeypadButton label="=" variant="op" onClick={props.onEquals} ariaLabel="Equals" />
      </Row>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex' }}>{children}</div>;
}
