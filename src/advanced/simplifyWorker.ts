// Web Worker that runs mathjs `simplify` off the main thread so the UI can
// time out (500ms) a pathological input that would otherwise hang the
// heuristic simplifier. The main-thread wrapper (simplifyAsync in cas.ts)
// posts {id, expr}, awaits the reply, and on timeout terminates this worker
// and falls back to the sync path. Vite bundles this file as a module worker
// via `new Worker(new URL('./simplifyWorker.ts', import.meta.url), {type:'module'})`.

import { create, all } from 'mathjs';

const math = create(all);

interface Req { id: number; expr: string; }
interface Res { id: number; ok: boolean; tex?: string; text?: string; error?: string; errorCode?: string; }

function post(res: Res): void {
  (self as unknown as Worker).postMessage(res);
}

self.onmessage = (e: MessageEvent<Req>) => {
  const { id, expr } = e.data;
  if (expr.length > 400) {
    post({ id, ok: false, error: '表达式过长，无法化简', errorCode: 'DOMAIN' });
    return;
  }
  try {
    const simplified = math.simplify(expr);
    post({
      id,
      ok: true,
      tex: simplified.toTex({ parenthesis: 'auto', implicit: 'hide' }),
      text: simplified.toString(),
    });
  } catch (err) {
    post({ id, ok: false, error: String((err as Error).message ?? err), errorCode: 'ENGINE' });
  }
};
