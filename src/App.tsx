import { useEffect, useState, useCallback } from 'react';
import { engine } from './engine';
import { history } from './history/api';
import { useKeyboard, useAndroidBack } from './native/keyboard';
import { isIOS } from './native/platform';

// ponytail: minimal shell proving engine + history contracts end-to-end on all 6 platforms.
// Minimax-M3's full UI (basic/scientific/history modes, design system) supersedes this file.
// Contract surface exercised: engine.evaluate / setAngleMode / getAngleMode, history.record/list/clear.

type Tab = 'calc' | 'history';

export default function App() {
  const [expr, setExpr] = useState('');
  const [tab, setTab] = useState<Tab>('calc');
  const [angle, setAngle] = useState<'deg' | 'rad'>(() => engine.getAngleMode());
  const [, bump] = useState(0);
  const rerender = useCallback(() => bump((n) => n + 1), []);

  useEffect(() => {
    engine.setAngleMode(angle);
  }, [angle]);

  const live = engine.evaluate(expr, { angle });

  const submit = useCallback(() => {
    const r = engine.evaluate(expr, { angle });
    if (r.value && !r.error) {
      history.record(expr, r.value);
      setExpr('');
      rerender();
    }
  }, [expr, angle, rerender]);

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      const k = e.key;
      if (tab !== 'calc') return;
      if (k >= '0' && k <= '9') setExpr((s) => s + k);
      else if (k === '.') setExpr((s) => s + '.');
      else if (k === '+' || k === '-' || k === '*' || k === '/' || k === '(' || k === ')') setExpr((s) => s + k);
      else if (k === '^') setExpr((s) => s + '^');
      else if (k === 'Enter' || k === '=') { e.preventDefault(); submit(); }
      else if (k === 'Backspace') setExpr((s) => s.slice(0, -1));
      else if (k === 'Escape') setExpr('');
    },
    [tab, submit]
  );
  useKeyboard(onKey);
  useAndroidBack(() => setTab('calc'));

  const push = (s: string) => setExpr((cur) => cur + s);

  return (
    <div className="app-shell">
      <div className="display">
        <div className="display-expr">{expr || '0'}</div>
        <div className={'display-result' + (live.error ? ' err' : '')}>
          {live.error ? live.error : live.value || '\u00a0'}
        </div>
      </div>

      <div className="tabbar">
        <button className={'tab' + (tab === 'calc' ? ' on' : '')} onClick={() => setTab('calc')}>计算</button>
        <button className={'tab' + (tab === 'history' ? ' on' : '')} onClick={() => { setTab('history'); rerender(); }}>历史</button>
        <button className="tab angle" onClick={() => setAngle((a) => (a === 'deg' ? 'rad' : 'deg'))}>
          {angle.toUpperCase()}
        </button>
      </div>

      {tab === 'calc' ? (
        <div className="keypad">
          <button className="key fn" onClick={() => push('sin(')}>sin</button>
          <button className="key fn" onClick={() => push('cos(')}>cos</button>
          <button className="key fn" onClick={() => push('tan(')}>tan</button>
          <button className="key fn" onClick={() => push('ln(')}>ln</button>
          <button className="key fn" onClick={() => push('√(')}>\u221a</button>
          <button className="key fn" onClick={() => push('π')}>π</button>
          <button className="key fn" onClick={() => push('e')}>e</button>
          <button className="key fn" onClick={() => push('^')}>x\u02b8</button>

          <button className="key" onClick={() => push('7')}>7</button>
          <button className="key" onClick={() => push('8')}>8</button>
          <button className="key" onClick={() => push('9')}>9</button>
          <button className="key op" onClick={() => push('÷')}>\u00f7</button>

          <button className="key" onClick={() => push('4')}>4</button>
          <button className="key" onClick={() => push('5')}>5</button>
          <button className="key" onClick={() => push('6')}>6</button>
          <button className="key op" onClick={() => push('×')}>\u00d7</button>

          <button className="key" onClick={() => push('1')}>1</button>
          <button className="key" onClick={() => push('2')}>2</button>
          <button className="key" onClick={() => push('3')}>3</button>
          <button className="key op" onClick={() => push('-')}>-</button>

          <button className="key" onClick={() => push('0')}>0</button>
          <button className="key" onClick={() => push('.')}>.</button>
          <button className="key" onClick={submit}>=</button>
          <button className="key op" onClick={() => push('+')}>+</button>

          <button className="key danger wide" onClick={() => setExpr('')}>AC</button>
          <button className="key wide" onClick={() => setExpr((s) => s.slice(0, -1))}>⌫</button>
        </div>
      ) : (
        <div className="history">
          {history.list().length === 0 ? (
            <div className="empty">暂无历史</div>
          ) : (
            <ul className="history-list">
              {history.list().map((h) => (
                <li key={h.id} onClick={() => { setExpr(h.expression); setTab('calc'); }}>
                  <div className="h-expr">{h.expression}</div>
                  <div className="h-result">= {h.result}</div>
                </li>
              ))}
            </ul>
          )}
          <button className="clear" onClick={() => { history.clear(); rerender(); }}>清空历史</button>
        </div>
      )}

      <style>{css}</style>
      {isIOS && <style>{`body { padding-top: env(safe-area-inset-top); }`}</style>}
    </div>
  );
}

const css = `
.app-shell { display: flex; flex-direction: column; height: 100%; max-width: 480px; margin: 0 auto; padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); }
.display { background: var(--bg-display); color: var(--fg-display); padding: 32px 20px 20px; text-align: right; min-height: 140px; display: flex; flex-direction: column; justify-content: flex-end; }
.display-expr { font-size: 24px; opacity: 0.7; min-height: 30px; word-break: break-all; }
.display-result { font-size: 56px; font-weight: 200; min-height: 68px; word-break: break-all; }
.display-result.err { color: var(--danger); font-size: 28px; }
.tabbar { display: flex; gap: 8px; padding: 12px 16px; background: var(--bg-elevated); }
.tab { flex: 1; padding: 10px; border: none; border-radius: var(--radius-sm); background: transparent; color: var(--fg-secondary); font-size: 15px; cursor: pointer; transition: all var(--dur) var(--ease-apple); }
.tab.on { background: var(--accent); color: #fff; }
.tab.angle { flex: 0 0 64px; background: var(--operator-bg); color: var(--operator-fg); font-weight: 600; }
.keypad { flex: 1; display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; padding: 12px 16px 24px; background: var(--bg); }
.key { border: none; border-radius: var(--radius-md); background: var(--key-bg); color: var(--fg); font-size: 26px; font-weight: 400; padding: 18px 0; cursor: pointer; transition: transform var(--dur) var(--ease-apple), filter var(--dur) var(--ease-apple); box-shadow: var(--shadow); }
.key:active { transform: scale(0.96); filter: brightness(0.92); }
.key.fn { font-size: 17px; color: var(--accent); }
.key.op { background: var(--operator-bg); color: var(--operator-fg); font-weight: 500; }
.key.danger { color: var(--danger); }
.key.wide { grid-column: span 2; }
.history { flex: 1; overflow-y: auto; padding: 12px 16px; }
.history-list { list-style: none; margin: 0; padding: 0; }
.history-list li { padding: 14px 16px; border-radius: var(--radius-sm); background: var(--bg-elevated); margin-bottom: 8px; cursor: pointer; transition: transform var(--dur) var(--ease-apple); box-shadow: var(--shadow); }
.history-list li:active { transform: scale(0.98); }
.h-expr { color: var(--fg-secondary); font-size: 14px; }
.h-result { font-size: 22px; font-weight: 300; }
.empty { text-align: center; color: var(--fg-secondary); padding: 60px 0; }
.clear { width: 100%; padding: 14px; border: none; border-radius: var(--radius-sm); background: var(--danger); color: #fff; font-size: 16px; cursor: pointer; margin-top: 12px; }
`;
