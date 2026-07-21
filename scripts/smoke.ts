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

console.log('programmer mode (BigInt, QWORD-exact):');
// radix parse + primary value in input radix
check('HEX FF+1 = 100 (hex)', engine.evaluate('FF + 1', { radix: 16 }).value === '100');
check('HEX FF+1 radix.dec = 256', engine.evaluate('FF + 1', { radix: 16 }).radix?.dec === '256');
check('DEC 255+1 = 256', engine.evaluate('255 + 1', { radix: 10 }).value === '256');
check('BIN 1010+1 = 1011', engine.evaluate('1010 + 1', { radix: 2 }).value === '1011');
check('OCT 17+1 = 20', engine.evaluate('17 + 1', { radix: 8 }).value === '20');
// QWORD 64-bit precision (beyond 2^53, mathjs doubles would lose it)
check('QWORD 2^63 hex = 8000000000000000', engine.evaluate('1 << 3F', { radix: 16, wordSize: 64 }).value === '8000000000000000');
check('QWORD 2^64-1 dec = -1 (signed)', engine.evaluate('FFFFFFFFFFFFFFFF', { radix: 16, wordSize: 64 }).radix?.dec === '-1');
check('QWORD 2^64-1 hex = FFFFFFFFFFFFFFFF', engine.evaluate('FFFFFFFFFFFFFFFF', { radix: 16, wordSize: 64 }).radix?.hex === 'FFFFFFFFFFFFFFFF');
// word width wraparound
check('BYTE FF+1 wraps to 0', engine.evaluate('FF + 1', { radix: 16, wordSize: 8 }).value === '0');
check('BYTE FF+1 radix.dec = 0', engine.evaluate('FF + 1', { radix: 16, wordSize: 8 }).radix?.dec === '0');
// bitwise
check('HEX FF & 0F = 0F', engine.evaluate('FF & 0F', { radix: 16 }).value === 'F');
check('HEX FF | 100 = 1FF', engine.evaluate('FF | 100', { radix: 16 }).value === '1FF');
check('HEX FF ^ 0F = F0', engine.evaluate('FF ^ 0F', { radix: 16 }).value === 'F0');
check('BYTE ~0 = FF', engine.evaluate('~0', { radix: 16, wordSize: 8 }).value === 'FF');
// shifts: arithmetic vs logical on -1 (all ones) in QWORD
check('QWORD ~0 >> 4 arithmetic = FFFFFFFFFFFFFFFF', engine.evaluate('~0 >> 4', { radix: 16, wordSize: 64 }).value === 'FFFFFFFFFFFFFFFF');
check('QWORD ~0 >>> 4 logical = 0FFFFFFFFFFFFFFF', engine.evaluate('~0 >>> 4', { radix: 16, wordSize: 64 }).value === 'FFFFFFFFFFFFFFF');
check('BYTE FF << 4 wraps = F0', engine.evaluate('FF << 4', { radix: 16, wordSize: 8 }).value === 'F0');
// signed integer division (truncate toward zero)
check('DEC 7/2 = 3', engine.evaluate('7 / 2', { radix: 10 }).value === '3');
check('DEC 7%2 = 1', engine.evaluate('7 % 2', { radix: 10 }).value === '1');
check('DEC -7/2 = -3 (trunc toward zero)', engine.evaluate('-7 / 2', { radix: 10 }).value === '-3');
check('DEC -1 radix.hex QWORD = FFFFFFFFFFFFFFFF', engine.evaluate('-1', { radix: 10, wordSize: 64 }).radix?.hex === 'FFFFFFFFFFFFFFFF');
// precedence: shifts below +/-, & below shift, like C
check('precedence 1+1<<1 = 4 (not 3)', engine.evaluate('1 + 1 << 1', { radix: 10 }).value === '4');
check('precedence FF & F0 | 0F = FF', engine.evaluate('FF & F0 | 0F', { radix: 16 }).value === 'FF');
// parens
check('parens (FF+F)*2 = 21C', engine.evaluate('(FF + F) * 2', { radix: 16 }).value === '21C');
// errors
check('prog div zero -> DIV_ZERO', engine.evaluate('1 / 0', { radix: 10 }).errorCode === 'DIV_ZERO');
check('prog invalid digit -> INVALID_DIGIT', engine.evaluate('8', { radix: 2 }).errorCode === 'INVALID_DIGIT');
check('prog unbalanced paren -> PAREN', engine.evaluate('(FF + 1', { radix: 16 }).errorCode === 'PAREN');
check('prog missing operand -> MISSING_OPERAND', engine.evaluate('FF +', { radix: 16 }).errorCode === 'MISSING_OPERAND');
// programmer path does NOT disturb scientific path (no shared global state)
check('scientific still works after programmer calls', engine.evaluate('sin(30)', { angle: 'deg' }).value === '0.5');
// setProgrammer / getProgrammer defaults
engine.setProgrammer({ radix: 8, wordSize: 16 });
check('getProgrammer echoes set state', engine.getProgrammer().radix === 8 && engine.getProgrammer().wordSize === 16);
check('default wordSize fills in when only radix passed', engine.evaluate('777 + 1', { radix: 8 }).value === '1000'); // octal 777+1 = 0o1000
check('default radix fills in when only wordSize passed', engine.evaluate('10 + 1', { wordSize: 16 }).value === '11'); // default radix 8: 0o10+1 = 0o11
engine.setProgrammer({ radix: 16, wordSize: 64 });
// toRadix pure helper (for UI radix switch without re-eval)
const r = engine.toRadix('-1', 64);
check('toRadix(-1,64) hex = FFFFFFFFFFFFFFFF', r.hex === 'FFFFFFFFFFFFFFFF');
check('toRadix(-1,64) dec = -1', r.dec === '-1');
const r2 = engine.toRadix('255', 8);
check('toRadix(255,8) hex = FF, bin = 11111111', r2.hex === 'FF' && r2.bin === '11111111');

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

// --- sync tests (crypto + merge + webdav + full round-trip) ---
// ponytail: reuses the assert+check runner above. No framework. WebDAV is
// exercised against an in-memory fake server (fetch mock) so no network. Crypto
// uses real Web Crypto (Node 20+ has globalThis.crypto.subtle).

const { encryptBlob, decryptBlob, SyncCryptoError } = await import('../src/sync/crypto');
const { mergeHistories, SYNC_MAX_ENTRIES } = await import('../src/sync/merge');
const { WebDavSyncProvider, WebDavSyncError } = await import('../src/sync/webdav');
const { JIANGUOYUN_PRESET } = await import('../src/sync/types');
const { SyncManager } = await import('../src/sync/manager');

console.log('sync crypto (AES-GCM, server-blind):');
{
  const blob = await encryptBlob('{"hello":"world"}', 'correct horse battery staple');
  check('blob is base64 string', typeof blob === 'string' && blob.length > 0 && /^[A-Za-z0-9+/=]+$/.test(blob));
  check('blob differs from plaintext', !blob.includes('hello'));
  const pt = await decryptBlob(blob, 'correct horse battery staple');
  check('decrypt round-trip', pt === '{"hello":"world"}');
  // wrong passphrase -> throws
  let threw = false;
  try { await decryptBlob(blob, 'wrong passphrase'); } catch (e) {
    threw = e instanceof SyncCryptoError && e.code === 'wrong_pass';
  }
  check('wrong passphrase throws', threw);
  // tampered blob -> throws
  let tampered = false;
  try {
    const bad = blob.slice(0, -4) + 'AAAA';
    await decryptBlob(bad, 'correct horse battery staple');
  } catch (e) {
    tampered = e instanceof SyncCryptoError;
  }
  check('tampered blob throws', tampered);
  // two encrypts of same plaintext differ (random salt+iv)
  const b2 = await encryptBlob('{"hello":"world"}', 'correct horse battery staple');
  check('same plaintext -> different blobs (random salt/iv)', blob !== b2);
  // decrypt b2 with same passphrase still works
  check('decrypt second blob', (await decryptBlob(b2, 'correct horse battery staple')) === '{"hello":"world"}');
}

console.log('sync merge (union by id, LWW by timestamp, cap):');
{
  const mk = (id: string, expr: string, ts: number) => ({ id, expression: expr, result: 'r', timestamp: ts });
  // union: disjoint ids -> all kept, sorted desc by timestamp
  const a = [mk('1', '1+1', 100), mk('2', '2+2', 200)];
  const b = [mk('3', '3+3', 150)];
  const merged1 = mergeHistories(a, b);
  check('union disjoint ids -> 3 entries', merged1.length === 3);
  check('union sorted desc by timestamp', merged1[0].id === '2' && merged1[1].id === '3' && merged1[2].id === '1');
  // duplicate id -> higher timestamp wins
  const c = [mk('1', '1+1-old', 100)];
  const d = [mk('1', '1+1-new', 300)];
  const merged2 = mergeHistories(c, d);
  check('dup id: higher ts wins', merged2.length === 1 && merged2[0].expression === '1+1-new');
  // reverse order: local has newer
  const merged3 = mergeHistories(d, c);
  check('dup id: local newer wins', merged3.length === 1 && merged3[0].expression === '1+1-new');
  // cap at SYNC_MAX_ENTRIES
  const big = Array.from({ length: SYNC_MAX_ENTRIES + 50 }, (_, i) => mk(String(i), `e${i}`, i));
  const merged4 = mergeHistories(big, []);
  check('merge caps at SYNC_MAX_ENTRIES', merged4.length === SYNC_MAX_ENTRIES);
  check('cap keeps newest', merged4[0].id === String(SYNC_MAX_ENTRIES + 49));
  // empty + empty -> empty
  check('empty merge', mergeHistories([], []).length === 0);
}

console.log('sync webdav preset (坚果云):');
{
  check('jianguoyun endpoint', JIANGUOYUN_PRESET.endpoint === 'https://dav.jianguoyun.com/dav/');
  check('jianguoyun path', JIANGUOYUN_PRESET.path.startsWith('/calc/'));
  check('jianguoyun password hint mentions 应用密码', JIANGUOYUN_PRESET.passwordHint.includes('应用密码'));
  check('jianguoyun password hint warns not login password', JIANGUOYUN_PRESET.passwordHint.includes('非登录密码'));
}

console.log('sync webdav client (PROPFIND/GET/PUT/DELETE against fake server):');
{
  // in-memory WebDAV server: Map<urlPath, bodyString>
  const store = new Map<string, string>();
  const cfg = {
    endpoint: JIANGUOYUN_PRESET.endpoint,
    username: 'me@example.com',
    password: 'app-password-xyz',
    path: JIANGUOYUN_PRESET.path,
  };
  const authHeader = 'Basic ' + btoa(`${cfg.username}:${cfg.password}`);
  const fakeFetch = async (url: string, init: any) => {
    // strip endpoint prefix to get path
    const path = url.startsWith(cfg.endpoint) ? url.slice(cfg.endpoint.length - 1) : url; // keep leading /
    const method = init?.method ?? 'GET';
    const reqAuth = init?.headers?.Authorization ?? init?.headers?.authorization;
    if (reqAuth !== authHeader) {
      return { ok: false, status: 401, statusText: 'Unauthorized', text: async () => 'auth' } as any;
    }
    if (method === 'PROPFIND') {
      if (store.has(path)) return { ok: true, status: 207, statusText: 'Multi-Status', text: async () => '' } as any;
      return { ok: false, status: 404, statusText: 'Not Found', text: async () => '' } as any;
    }
    if (method === 'GET') {
      const body = store.get(path);
      if (body === undefined) return { ok: false, status: 404, statusText: 'Not Found', text: async () => '' } as any;
      return { ok: true, status: 200, statusText: 'OK', text: async () => body } as any;
    }
    if (method === 'PUT') {
      // parent must exist (path = /calc/sync.bin; parent = /calc)
      const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
      // ponytail: fake server treats root '/' as always-existing collection.
      if (parent && parent !== '/' && !store.has(parent + '/') && !store.has(path)) {
        return { ok: false, status: 409, statusText: 'Conflict', text: async () => '' } as any;
      }
      store.set(path, init.body);
      return { ok: true, status: 204, statusText: 'No Content', text: async () => '' } as any;
    }
    if (method === 'MKCOL') {
      store.set(path.endsWith('/') ? path : path + '/', '');
      return { ok: true, status: 201, statusText: 'Created', text: async () => '' } as any;
    }
    if (method === 'DELETE') {
      if (!store.has(path)) return { ok: false, status: 404, statusText: 'Not Found', text: async () => '' } as any;
      store.delete(path);
      return { ok: true, status: 204, statusText: 'No Content', text: async () => '' } as any;
    }
    return { ok: false, status: 405, statusText: 'Method Not Allowed', text: async () => '' } as any;
  };
  const provider = new WebDavSyncProvider(cfg, fakeFetch as any);

  // PROPFIND on non-existent path -> exists() false
  check('PROPFIND non-existent -> false', await provider.exists() === false);
  // pull on non-existent -> null (no error)
  check('pull non-existent -> null', (await provider.pull()) === null);
  // push creates parent via 409 -> MKCOL -> PUT retry
  await provider.push('hello-blob');
  check('push wrote blob to server', store.get(cfg.path) === 'hello-blob');
  // now exists -> true
  check('PROPFIND existing -> true', await provider.exists() === true);
  // pull -> the blob
  check('pull returns blob', (await provider.pull()) === 'hello-blob');
  // overwrite via second push
  await provider.push('hello-v2');
  check('push overwrites', store.get(cfg.path) === 'hello-v2');
  // clear -> DELETE
  await provider.clear();
  check('clear removes blob', !store.has(cfg.path));
  check('clear on missing is no-op (no throw)', await provider.clear().then(() => true));
  // auth failure surfaces as error
  const badProvider = new WebDavSyncProvider({ ...cfg, password: 'wrong' }, fakeFetch as any);
  let authThrew = false;
  try { await badProvider.pull(); } catch (e) { authThrew = e instanceof WebDavSyncError && e.status === 401; }
  check('wrong password -> 401 WebDavSyncError', authThrew);
}

console.log('sync manager (full round-trip, two devices via shared WebDAV):');
{
  // shared fake server
  const store = new Map<string, string>();
  const mkCfg = () => ({
    endpoint: JIANGUOYUN_PRESET.endpoint,
    username: 'me@example.com',
    password: 'app-password-xyz',
    path: JIANGUOYUN_PRESET.path,
  });
  const authHeader = 'Basic ' + btoa('me@example.com:app-password-xyz');
  const fakeFetch = async (url: string, init: any) => {
    const path = url.startsWith(JIANGUOYUN_PRESET.endpoint) ? url.slice(JIANGUOYUN_PRESET.endpoint.length - 1) : url;
    const method = init?.method ?? 'GET';
    if ((init?.headers?.Authorization) !== authHeader) return { ok: false, status: 401, statusText: 'Unauthorized', text: async () => '' } as any;
    if (method === 'PROPFIND') return { ok: store.has(path), status: store.has(path) ? 207 : 404, statusText: '', text: async () => '' } as any;
    if (method === 'GET') {
      const b = store.get(path);
      return b === undefined ? { ok: false, status: 404, statusText: '', text: async () => '' } as any : { ok: true, status: 200, statusText: '', text: async () => b } as any;
    }
    if (method === 'PUT') { store.set(path, init.body); return { ok: true, status: 204, statusText: '', text: async () => '' } as any; }
    if (method === 'DELETE') { store.delete(path); return { ok: true, status: 204, statusText: '', text: async () => '' } as any; }
    return { ok: false, status: 405, statusText: '', text: async () => '' } as any;
  };
  // device A local store
  let localA: import('../src/history/api').HistoryEntry[] = [
    { id: 'a1', expression: '1+1', result: '2', timestamp: 1000 },
    { id: 'a2', expression: '2+2', result: '4', timestamp: 2000 },
  ];
  // device B local store (has one different entry + one dup with older ts)
  let localB: import('../src/history/api').HistoryEntry[] = [
    { id: 'b1', expression: '5+5', result: '10', timestamp: 1500 },
    { id: 'a2', expression: '2+2-OLD', result: '4', timestamp: 500 },
  ];
  const mgrA = new SyncManager(new WebDavSyncProvider(mkCfg(), fakeFetch as any), {
    getLocal: () => localA, setLocal: (e) => { localA = e; }, passphrase: 'shared-secret',
  });
  const mgrB = new SyncManager(new WebDavSyncProvider(mkCfg(), fakeFetch as any), {
    getLocal: () => localB, setLocal: (e) => { localB = e; }, passphrase: 'shared-secret',
  });

  // A syncs first: pushes encrypted blob with A's 2 entries
  const rA = await mgrA.sync();
  check('A sync ok', rA.ok);
  check('A pushed 2 entries', rA.pushed === 2);
  // server now holds an encrypted blob (not plaintext)
  const onWire = store.get(JIANGUOYUN_PRESET.path);
  check('server has blob', typeof onWire === 'string' && onWire.length > 0);
  check('blob is not plaintext (no expression strings)', !onWire!.includes('1+1') && !onWire!.includes('expression'));

  // B syncs: pulls A's blob, merges (union a1,a2,b1; a2 newer wins), pushes back merged
  const rB = await mgrB.sync();
  check('B sync ok', rB.ok);
  check('B merged to 3 entries (union)', localB.length === 3);
  check('B has a1', localB.some(e => e.id === 'a1'));
  check('B has a2 (newer version)', localB.some(e => e.id === 'a2' && e.expression === '2+2'));
  check('B has b1', localB.some(e => e.id === 'b1'));
  check('B no stale a2-OLD', !localB.some(e => e.expression === '2+2-OLD'));
  // B's merged set is sorted desc by timestamp (a2=2000, b1=1500, a1=1000)
  check('B sorted desc by timestamp', localB[0].id === 'a2' && localB[1].id === 'b1' && localB[2].id === 'a1');

  // A syncs again: pulls B's push (3 entries), merges -> 3 entries (no new)
  const rA2 = await mgrA.sync();
  check('A re-sync ok', rA2.ok);
  check('A now has 3 entries (picked up b1)', localA.length === 3);
  check('A has b1', localA.some(e => e.id === 'b1'));

  // schedulePush debounces + coalesces; flushAndCancel drains the chain
  localA.push({ id: 'a3', expression: '7+7', result: '14', timestamp: 3000 });
  mgrA.schedulePush();
  localA.push({ id: 'a4', expression: '8+8', result: '16', timestamp: 3100 });
  mgrA.schedulePush();  // coalesces with previous
  const flushRes = await mgrA.flushAndCancel();
  check('debounced push flushed ok', flushRes.ok);
  // server now has 4 entries (a1,a2,a3,a4,b1)
  const rB2 = await mgrB.sync();
  check('B picks up 2 new entries from A', localB.length === 5 && rB2.ok);

  // wrong passphrase on pull -> SyncCryptoError surfaced as error result (not throw)
  const mgrBad = new SyncManager(new WebDavSyncProvider(mkCfg(), fakeFetch as any), {
    getLocal: () => [], setLocal: () => {}, passphrase: 'wrong-pass',
  });
  const rBad = await mgrBad.sync();
  check('wrong passphrase sync -> not ok', !rBad.ok && !!rBad.error);

  // clearRemote wipes server
  const rClear = await mgrA.clearRemote();
  check('clearRemote ok', rClear.ok);
  check('server blob gone after clear', !store.has(JIANGUOYUN_PRESET.path));
  // subsequent pull -> null
  const providerOnly = new WebDavSyncProvider(mkCfg(), fakeFetch as any);
  check('pull after clear -> null', (await providerOnly.pull()) === null);
}

console.log('date math:');
{
  // Mirror the helpers in src/components/DateTime.tsx. Anchoring at UTC noon dodges DST edges.
  function parseIso(s: string): Date {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)!;
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
  }
  function diffDays(a: Date, b: Date): number {
    return Math.round((a.getTime() - b.getTime()) / 86400000);
  }
  function addDays(d: Date, n: number): Date {
    return new Date(d.getTime() + n * 86400000);
  }
  function formatIso(d: Date): string {
    const y = d.getUTCFullYear();
    const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = d.getUTCDate().toString().padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  check('diff A - B = 14 days', diffDays(parseIso('2025-01-15'), parseIso('2025-01-01')) === 14);
  check('diff A - B = -14 days (reversed)', diffDays(parseIso('2025-01-01'), parseIso('2025-01-15')) === -14);
  check('add 30 days to 2025-01-01 = 2025-01-31', formatIso(addDays(parseIso('2025-01-01'), 30)) === '2025-01-31');
  check('add -15 to 2025-03-01 = 2025-02-14', formatIso(addDays(parseIso('2025-03-01'), -15)) === '2025-02-14');
  check('cross month: +1 to 2025-01-31 = 2025-02-01', formatIso(addDays(parseIso('2025-01-31'), 1)) === '2025-02-01');
  check('cross year: +1 to 2025-12-31 = 2026-01-01', formatIso(addDays(parseIso('2025-12-31'), 1)) === '2026-01-01');
  check('leap year: 2024-02-28 +1 = 2024-02-29', formatIso(addDays(parseIso('2024-02-28'), 1)) === '2024-02-29');
  check('non-leap: 2025-02-28 +1 = 2025-03-01', formatIso(addDays(parseIso('2025-02-28'), 1)) === '2025-03-01');
  check('weekday of 2025-01-01 is Wednesday (UTC)', parseIso('2025-01-01').getUTCDay() === 3);
}

console.log('units + currency:');
{
  const { create, all } = await import('mathjs');
  const unitMath = create(all);
  const rates = { USD: 1, EUR: 0.92, GBP: 0.78, JPY: 156.40, CNY: 7.24 } as Record<string, number>;

  function fmt(s: string) {
    return s.replace(/\s*[A-Za-zµ]+\s*$/, '').trim();
  }

  check('5 km = 5000 m', fmt(unitMath.evaluate('5 km to m').toString()) === '5000');
  check('1 km = 1000 m', fmt(unitMath.evaluate('1 km to m').toString()) === '1000');
  check('100 kg ~= 220.46 lb', Math.abs(Number(fmt(unitMath.evaluate('100 kg to lb').toString())) - 220.462) < 0.1);
  check('0 celsius = 32 fahrenheit', fmt(unitMath.evaluate('0 celsius to fahrenheit').toString()) === '32');
  check('100 celsius ~= 212 fahrenheit', Math.abs(Number(fmt(unitMath.evaluate('100 celsius to fahrenheit').toString())) - 212) < 0.01);
  check('0 kelvin = -273.15 celsius', Math.abs(Number(fmt(unitMath.evaluate('0 kelvin to celsius').toString())) + 273.15) < 1e-6);
  check('1 l ~= 0.2642 gal (US liquid)', Math.abs(Number(fmt(unitMath.evaluate('1 l to gal').toString())) - 0.2642) < 0.01);
  check('1 KiB = 1024 byte', fmt(unitMath.evaluate('1 KiB to byte').toString()) === '1024');

  // Currency: rate = units-of-currency per 1 USD; convert = n * rateTo / rateFrom
  function curr(n: number, from: string, to: string): number {
    return (n * rates[to]) / rates[from];
  }
  check('USD currency rate = 1', rates.USD === 1);
  check('100 USD -> 92 EUR', Math.abs(curr(100, 'USD', 'EUR') - 92) < 1e-6);
  check('100 USD -> 724 CNY', Math.abs(curr(100, 'USD', 'CNY') - 724) < 1e-6);
  check('100 CNY -> 13.81 USD', Math.abs(curr(100, 'CNY', 'USD') - 13.81) < 0.01);
  check('100 EUR -> 100 EUR (no-op)', Math.abs(curr(100, 'EUR', 'EUR') - 100) < 1e-6);
}

console.log('chemistry balancer:');
{
  const { balanceReaction } = await import('../src/chemistry/balancer');
  const coeffs = (r: ReturnType<typeof balanceReaction>) =>
    r.compounds!.map((c) => c.coefficient);

  const r1 = balanceReaction('H2 + O2 -> H2O');
  check('H2+O2->H2O ok', r1.ok);
  check('coeffs [2,1,2]', JSON.stringify(coeffs(r1)) === '[2,1,2]');
  check('equation string', r1.equation === '2 H2 + O2 -> 2 H2O');
  check('conservation all balanced', r1.conservation!.every((c) => c.balanced));

  const r2 = balanceReaction('Fe2+ + Cu -> Fe + Cu2+');
  check('redox Fe2+ ok', r2.ok && JSON.stringify(coeffs(r2)) === '[1,1,1,1]');
  check('redox charge balanced', r2.chargeBalance!.balanced);

  const r3 = balanceReaction('Ca(OH)2 + HCl -> CaCl2 + H2O');
  check('parens Ca(OH)2 coeffs [1,2,1,2]', r3.ok && JSON.stringify(coeffs(r3)) === '[1,2,1,2]');

  const r4 = balanceReaction('C3H8 + O2 -> CO2 + H2O');
  check('combustion coeffs [1,5,3,4]', r4.ok && JSON.stringify(coeffs(r4)) === '[1,5,3,4]');

  const r5 = balanceReaction('CuSO4·5H2O -> CuSO4 + H2O');
  check('hydrate coeffs [1,1,5]', r5.ok && JSON.stringify(coeffs(r5)) === '[1,1,5]');

  const r6 = balanceReaction('Na+ + Cl- -> NaCl');
  check('ions coeffs [1,1,1]', r6.ok && JSON.stringify(coeffs(r6)) === '[1,1,1]');

  const r7 = balanceReaction('(NH4)2SO4 -> NH3 + H2SO4');
  check('nested parens coeffs [1,2,1]', r7.ok && JSON.stringify(coeffs(r7)) === '[1,2,1]');

  const r8 = balanceReaction('2 H2 + O2 = 2 H2O');
  check('= arrow + user coeffs ignored', r8.ok && JSON.stringify(coeffs(r8)) === '[2,1,2]');
  check('= arrow preserved', r8.arrow === '=');

  // Hard redox case (large coefficients) - exact rational arithmetic must not
  // mis-snap. Float null-space + rounding would give wrong ints here.
  const r9 = balanceReaction('KMnO4 + HCl -> KCl + MnCl2 + H2O + Cl2');
  check('redox KMnO4 coeffs [2,16,2,2,8,5]', r9.ok && JSON.stringify(coeffs(r9)) === '[2,16,2,2,8,5]');
  check('redox KMnO4 conservation', r9.conservation!.every((c) => c.balanced));

  // SO4^2- caret charge notation
  const r10 = balanceReaction('BaCl2 + Na2SO4 -> BaSO4 + NaCl');
  check('double displacement coeffs [1,1,1,2]', r10.ok && JSON.stringify(coeffs(r10)) === '[1,1,1,2]');

  // Error paths
  check('ambiguous -> AMBIGUOUS', !balanceReaction('C + O2 -> CO + CO2').ok && balanceReaction('C + O2 -> CO + CO2').errorCode === 'AMBIGUOUS');
  check('no solution -> NO_SOLUTION', balanceReaction('H2 -> O2').errorCode === 'NO_SOLUTION');
  check('no arrow -> SYNTAX', balanceReaction('H2 + O2').errorCode === 'SYNTAX');
  check('empty -> EMPTY', balanceReaction('').errorCode === 'EMPTY');
  check('missing arrow -> SYNTAX', balanceReaction('H2 O2').errorCode === 'SYNTAX');
}

console.log('advanced CAS (mathjs + katex):');
{
  const { derivative, taylorSeries, numericRoots, numericIntegral, numericLimit,
    matrixOperation, truthTable, simplifySync, toTex, renderKatex } = await import('../src/advanced/cas');

  const d1 = derivative('x^3', 'x', 1);
  check('d/dx x^3 = 3x^2', d1.ok && d1.text === '3 * x ^ 2');
  const d2 = derivative('x^3', 'x', 3);
  check('d3/dx3 x^3 = 6', d2.ok && /6/.test(d2.text!));
  const d3 = derivative('sin(x^2)', 'x', 1);
  check('d/dx sin(x^2) has cos', d3.ok && d3.text!.includes('cos'));

  const t1 = taylorSeries('e^x', 'x', 0, 4);
  check('taylor e^x ok', t1.ok && t1.text!.startsWith('1 + 1 * x'));
  const t2 = taylorSeries('sin(x)', 'x', 0, 5);
  check('taylor sin(x) ok', t2.ok && t2.text!.includes('x'));

  const r1 = numericRoots('x^2 - 4 = 0', 'x', -100, 100);
  check('roots x^2-4=0 -> [-2,2]', r1.ok && r1.text === 'x = -2, x = 2');
  const r2 = numericRoots('x^2 + 1 = 0', 'x', -100, 100);
  check('roots x^2+1=0 -> none', r2.ok && r2.text!.includes('未找到'));
  const r3 = numericRoots('sin(x) = 0', 'x', -10, 10);
  check('roots sin(x)=0 finds >=3', r3.ok && (r3.text!.match(/x =/g) || []).length >= 3);

  const i1 = numericIntegral('x^2', 'x', 0, 3);
  check('integral x^2 0..3 = 9', i1.ok && Math.abs(Number(i1.text) - 9) < 1e-4);
  const i2 = numericIntegral('sin(x)', 'x', 0, Math.PI);
  check('integral sin(x) 0..pi = 2', i2.ok && Math.abs(Number(i2.text) - 2) < 1e-3);

  const l1 = numericLimit('sin(x)/x', 'x', 0);
  check('limit sin(x)/x ->0 = 1', l1.ok && Math.abs(Number(l1.text) - 1) < 1e-4);
  const l2 = numericLimit('(1+1/x)^x', 'x', 'inf');
  check('limit (1+1/x)^x ->inf = e', l2.ok && Math.abs(Number(l2.text) - Math.E) < 1e-3);

  const m1 = matrixOperation('det', '1 2; 3 4');
  check('det [[1,2],[3,4]] = -2', m1.ok && m1.scalar === -2);
  const m2 = matrixOperation('inv', '1 2; 3 4');
  check('inv ok', m2.ok && m2.matrix !== undefined);
  const m3 = matrixOperation('eigs', '1 0; 0 2');
  check('eigs diag(1,2)', m3.ok && m3.eigenvalues!.length === 2);
  const m4 = matrixOperation('rref', '1 2 3; 4 5 6');
  check('rref ok', m4.ok && m4.matrix !== undefined);
  const m5 = matrixOperation('solve', '2 1; 1 -1', '5\n-2');
  check('solve Ax=b ok', m5.ok && m5.matrix !== undefined);
  const m6 = matrixOperation('solve', '2 1; 1 -1');
  check('solve missing b -> error', !m6.ok);

  const tt1 = truthTable('A and B');
  check('truth A and B: 4 rows, 1 true', tt1.ok && tt1.rows.length === 4 && tt1.rows.filter((r) => r.result).length === 1);
  const tt2 = truthTable('A xor B');
  check('truth A xor B: 2 true', tt2.ok && tt2.rows.filter((r) => r.result).length === 2);

  const s1 = simplifySync('2*x + 3*x');
  check('simplify 2x+3x = 5x', s1.ok && s1.text === '5 * x');
  const tx1 = toTex('x^2 + 2*x');
  check('toTex ok', tx1.ok && tx1.tex!.includes('x'));
  check('renderKatex produces html', renderKatex(tx1.tex!).includes('katex'));
}

console.log(`\n${passed} passed, 0 failed`);
