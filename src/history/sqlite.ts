// SQLite backend for history. Only loaded on native (Capacitor or Tauri) via dynamic import
// from api.ts. Web never imports this module -> native deps stay out of the web bundle.
//
// ponytail: in-memory mirror hydrates once at boot, then sync record/list/clear operate
// against the cache while writes fire-and-forget to SQLite. Keeps the canonical sync
// HistoryAPI contract intact even though SQLite IPC is async.

import type { HistoryAPI, HistoryEntry } from './api';

const MAX_ENTRIES = 500;

interface SqliteBackend {
  exec(sql: string, params?: unknown[]): Promise<void>;
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
}

export class SqliteHistory implements HistoryAPI {
  private cache: HistoryEntry[] = [];
  readonly ready: Promise<void>;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private db: SqliteBackend) {
    this.ready = this.init();
  }

  private async init(): Promise<void> {
    await this.db.exec(
      'CREATE TABLE IF NOT EXISTS history (id TEXT PRIMARY KEY, expression TEXT NOT NULL, result TEXT NOT NULL, ts INTEGER NOT NULL)'
    );
    const rows = await this.db.query<{ id: string; expression: string; result: string; ts: number }>(
      'SELECT id, expression, result, ts FROM history ORDER BY ts DESC LIMIT ?',
      [MAX_ENTRIES]
    );
    this.cache = rows.map((r) => ({
      id: r.id,
      expression: r.expression,
      result: r.result,
      timestamp: r.ts
    }));
  }

  record(expression: string, result: string): HistoryEntry {
    const entry: HistoryEntry = {
      id: crypto.randomUUID(),
      expression,
      result,
      timestamp: Date.now()
    };
    this.cache.unshift(entry);
    if (this.cache.length > MAX_ENTRIES) this.cache.length = MAX_ENTRIES;
    // ponytail: serialize writes to preserve order; fire-and-forget from caller's POV.
    this.writeChain = this.writeChain
      .then(() =>
        this.db.exec(
          'INSERT INTO history (id, expression, result, ts) VALUES (?, ?, ?, ?)',
          [entry.id, entry.expression, entry.result, entry.timestamp]
        )
      )
      .catch(() => {
        // best-effort: a failed write doesn't corrupt the in-memory cache.
      });
    return entry;
  }

  list(): HistoryEntry[] {
    return this.cache;
  }

  clear(): void {
    this.cache = [];
    this.writeChain = this.writeChain
      .then(() => this.db.exec('DELETE FROM history'))
      .catch(() => {});
  }

  replaceAll(entries: HistoryEntry[]): void {
    // ponytail: bulk replace preserving each entry's id + timestamp. The sync
    // merge path passes entries with stable ids from mergeHistories; re-running
    // record() would mint fresh ids and break CRDT dedup. Cap + replace cache
    // synchronously, then DELETE + bulk INSERT through the write chain so
    // ordering is preserved relative to any in-flight writes.
    const capped = entries.slice(0, MAX_ENTRIES);
    this.cache = capped.slice();
    this.writeChain = this.writeChain
      .then(() => this.db.exec('DELETE FROM history'))
      .then(() => {
        // ponytail: one statement per row — both backends (Capacitor + Tauri)
        // accept params; batching via multi-statement is backend-specific.
        const work: Promise<void> = capped.reduce(
          (acc, e) => acc.then(() => this.db.exec(
            'INSERT INTO history (id, expression, result, ts) VALUES (?, ?, ?, ?)',
            [e.id, e.expression, e.result, e.timestamp]
          )),
          Promise.resolve()
        );
        return work;
      })
      .catch(() => {
        // best-effort: a failed bulk write doesn't corrupt the in-memory cache.
      });
  }
}

// ponytail: one Capacitor connection reused for app lifetime. @capacitor-community/sqlite
// is harmless to import on Tauri/web (it no-ops without the native bridge), but this file
// is dynamically imported only on Capacitor so the dep never loads elsewhere.
export class CapacitorSqliteBackend implements SqliteBackend {
  private conn: any;
  private openP: Promise<void>;

  constructor() {
    this.openP = (async () => {
      const mod = await import('@capacitor-community/sqlite');
      const SQLiteConnection = mod.SQLiteConnection;
      const CapacitorSQLite = mod.CapacitorSQLite;
      const sqlite = new SQLiteConnection(CapacitorSQLite);
      this.conn = await sqlite.createConnection('calc', false, 'no-encryption', 1, false);
      await this.conn.open();
    })();
  }

  private async ready(): Promise<void> {
    await this.openP;
  }

  async exec(sql: string, params?: unknown[]): Promise<void> {
    await this.ready();
    if (params && params.length) {
      await this.conn.run(sql, params);
    } else {
      await this.conn.execute(sql);
    }
  }

  async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
    await this.ready();
    const res = params && params.length ? await this.conn.query(sql, params) : await this.conn.query(sql, []);
    return (res?.values ?? []) as T[];
  }
}

// ponytail: Tauri plugin-sql. @tauri-apps/plugin-sql is harmless to import elsewhere
// (it checks __TAURI_INTERNALS__), but this file is dynamically imported only on Tauri.
export class TauriSqliteBackend implements SqliteBackend {
  private db: any;
  private openP: Promise<void>;

  constructor() {
    this.openP = (async () => {
      const mod = await import('@tauri-apps/plugin-sql');
      const Database = mod.default;
      this.db = await Database.load('sqlite:calc.db');
    })();
  }

  private async ready(): Promise<void> {
    await this.openP;
  }

  async exec(sql: string, params?: unknown[]): Promise<void> {
    await this.ready();
    await this.db.execute(sql, params ?? []);
  }

  async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
    await this.ready();
    const rows = await this.db.select(sql, params ?? []);
    return (rows as T[]) ?? [];
  }
}
