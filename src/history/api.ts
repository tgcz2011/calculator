// Canonical history contract. Locked by Leader: UI depends on this exact shape.
// Implementation swaps between LocalStorage (web/Tauri-webview) and SQLite (native) without UI changes.

export interface HistoryEntry {
  id: string;
  expression: string;
  result: string;
  timestamp: number;
}
export interface HistoryAPI {
  record(expression: string, result: string): HistoryEntry;
  list(): HistoryEntry[];
  clear(): void;
}

// ponytail: optional sync push hook. When a SyncManager is registered (via
// setSyncPush), record/clear schedule a debounced push. Until then, sync is
// dormant and history behaves exactly as before. Kept here (not in a separate
// module) so the sync trigger is atomically co-located with the write - no
// chance of a record slipping through without the push firing.
type SyncPushFn = () => void;
let syncPush: SyncPushFn | null = null;

/** Register a sync push trigger. Pass null to disable. */
export function setSyncPush(fn: SyncPushFn | null): void {
  syncPush = fn;
}

const MAX_ENTRIES = 500;
const LS_KEY = 'calc:history';

// ponytail: LocalStorage is sync, durable enough for web + Tauri webview fallback.
// Tauri's webview persists LS to the app data dir, so desktop gets durable storage
// even before the SQLite plugin is wired (P1 upgrade path).
class LocalStorageHistory implements HistoryAPI {
  private read(): HistoryEntry[] {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
    } catch {
      return [];
    }
  }
  private write(entries: HistoryEntry[]): void {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(entries));
    } catch {
      // quota / private mode: silently drop. History is best-effort, not a trust boundary.
    }
  }
  record(expression: string, result: string): HistoryEntry {
    const entry: HistoryEntry = {
      id: crypto.randomUUID(),
      expression,
      result,
      timestamp: Date.now()
    };
    const next = [entry, ...this.read()].slice(0, MAX_ENTRIES);
    this.write(next);
    return entry;
  }
  list(): HistoryEntry[] {
    return this.read();
  }
  clear(): void {
    this.write([]);
  }
}

// ponytail: impl starts as LocalStorage (works everywhere, sync, immediate). On native,
// initHistory() swaps in a SQLite backend hydrated from disk; sync contract preserved via
// in-memory mirror. Web never imports the SQLite module (dynamic import behind platform check).
let impl: HistoryAPI = new LocalStorageHistory();
let initP: Promise<void> = Promise.resolve();

const isCapacitor =
  typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.() === true;
const isTauri =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

if (isCapacitor) {
  initP = (async () => {
    const { SqliteHistory, CapacitorSqliteBackend } = await import('./sqlite');
    const sql = new SqliteHistory(new CapacitorSqliteBackend());
    impl = sql;
    await sql.ready;
  })();
} else if (isTauri) {
  initP = (async () => {
    const { SqliteHistory, TauriSqliteBackend } = await import('./sqlite');
    const sql = new SqliteHistory(new TauriSqliteBackend());
    impl = sql;
    await sql.ready;
  })();
}

export const history: HistoryAPI = {
  // ponytail: single syncPush chokepoint. Fires after both LocalStorage and
  // SQLite backends (impl is swapped in initHistory), so native path is covered
  // without threading the hook into the SQLite class.
  record: (e, r) => { const x = impl.record(e, r); syncPush?.(); return x; },
  list: () => impl.list(),
  clear: () => { impl.clear(); syncPush?.(); }
};

// App boot awaits this before rendering so native SQLite cache is hydrated before first list().
export function initHistory(): Promise<void> {
  return initP;
}
