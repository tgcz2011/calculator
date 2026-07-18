// ponytail: contract smoke test. No framework - just assert. Runs via `tsx scripts/smoke.ts`.
// Exercises engine (the hard logic) + history LocalStorage backend (with a minimal LS shim).
// SQLite backends need native runtimes; they're covered by manual native build verification.

import assert from 'node:assert';
import { engine } from '../src/engine/index';

// --- localStorage shim for Node so LocalStorageHistory can be tested headless ---
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear()
};
// crypto.randomUUID() is available natively in Node 20+.

// Force web platform path in api.ts by NOT setting Capacitor/__TAURI_INTERNALS__ markers.
const { history, initHistory } = await import('../src/history/api');
await initHistory();

let passed = 0;
function check(name: string, cond: boolean) {
  assert.ok(cond, `FAIL: ${name}`);
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log('engine contract:');
check('add 1+2=3', engine.evaluate('1+2').value === '3');
check('mul 2*3=6', engine.evaluate('2*3').value === '6');
check('div 10/4=2.5', engine.evaluate('10/4').value === '2.5');
check('precedence 2+3*4=14', engine.evaluate('2+3*4').value === '14');
check('parens (2+3)*4=20', engine.evaluate('(2+3)*4').value === '20');
check('factorial 5!=120', engine.evaluate('5!').value === '120');
check('power 2^10=1024', engine.evaluate('2^10').value === '1024');
check('sqrt 16=4', engine.evaluate('sqrt(16)').value === '4');
check('unicode sqrt √(16)=4', engine.evaluate('√(16)').value === '4');
check('ln(e)=1', engine.evaluate('ln(e)').value === '1');
check('log10(1000)=3', engine.evaluate('log10(1000)').value === '3');
check('pi unicode', engine.evaluate('π').value === '3.1415926535898');
check('trailing zeros stripped', engine.evaluate('2.5+2.5').value === '5');
check('div zero -> Infinity', engine.evaluate('1/0').value === 'Infinity');

console.log('angle mode (DEG default):');
check('sin(30) deg = 0.5', engine.evaluate('sin(30)', { angle: 'deg' }).value === '0.5');
check('cos(60) deg = 0.5', engine.evaluate('cos(60)', { angle: 'deg' }).value === '0.5');
check('tan(45) deg = 1', engine.evaluate('tan(45)', { angle: 'deg' }).value === '1');
check('asin(0.5) deg = 30', engine.evaluate('asin(0.5)', { angle: 'deg' }).value === '30');

console.log('angle mode (RAD):');
check('sin(π/2) rad = 1', engine.evaluate('sin(pi/2)', { angle: 'rad' }).value === '1');
check('cos(0) rad = 1', engine.evaluate('cos(0)', { angle: 'rad' }).value === '1');

console.log('global angle mode:');
engine.setAngleMode('deg');
check('getAngleMode deg', engine.getAngleMode() === 'deg');
check('sin(30) global deg', engine.evaluate('sin(30)').value === '0.5');
engine.setAngleMode('rad');
check('sin(pi/2) global rad', engine.evaluate('sin(pi/2)').value === '1');
engine.setAngleMode('deg');

console.log('error handling:');
check('unclosed paren errors', !!engine.evaluate('(1+2').error);
check('missing operand errors', !!engine.evaluate('1+').error);
check('unknown symbol errors', !!engine.evaluate('foo(1)').error);
check('empty expr -> empty value', engine.evaluate('').value === '');
check('errorCode UNCLOSED on trailing operator', engine.evaluate('1+').errorCode === 'UNCLOSED');
check('errorCode PAREN on unbalanced paren', engine.evaluate('(1+2').errorCode === 'PAREN');
check('errorCode NOT_FUNCTION on undefined fn', engine.evaluate('foo(1)').errorCode === 'NOT_FUNCTION');
check('errorCode absent on success', engine.evaluate('1+2').errorCode === undefined);
check('options-only: global setAngleMode(rad) does not leak into evaluate with angle:deg',
  (() => { engine.setAngleMode('rad'); const r = engine.evaluate('sin(30)', { angle: 'deg' }).value === '0.5'; engine.setAngleMode('deg'); return r; })()
);
check('default angle used when options absent', engine.getAngleMode() === 'deg' && engine.evaluate('sin(30)').value === '0.5');

console.log('history contract (LocalStorage):');
history.clear();
check('empty list', history.list().length === 0);
const e1 = history.record('1+2', '3');
check('record returns entry', e1.expression === '1+2' && e1.result === '3');
check('id is string', typeof e1.id === 'string');
check('timestamp is number', typeof e1.timestamp === 'number');
check('list has 1', history.list().length === 1);
history.record('4*5', '20');
history.record('6/2', '3');
check('list has 3', history.list().length === 3);
check('most recent first', history.list()[0].expression === '6/2');
history.clear();
check('clear empties list', history.list().length === 0);

console.log(`\n${passed} passed, 0 failed`);
