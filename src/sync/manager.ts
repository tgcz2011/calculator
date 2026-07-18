// SyncManager owns the crypto + merge + transport orchestration. Providers
// move opaque encrypted strings; the manager decrypts, merges with local,
// re-encrypts, pushes. A debounced push hook lets history.record/clear trigger
// a coalesced push without becoming async (history API stays sync).
//
// ponytail: full pull-merge-push on every change is wasteful for a 5KB blob,
// but it's correct and the round-trip is one PROPFIND + one GET + one PUT on a
// fast WebDAV server. Debounce (2s, coalescing) cuts the wasteful part. If
// throughput ever matters, switch pushOnly() to encrypt-local-and-PUT (skip
// pull/merge) and let the next full sync reconcile - but that opens a
// last-write-wins race on rapid multi-device edits. Not worth it for a
// calculator history.

import type { HistoryEntry } from '../history/api';
import type { SyncProvider, SyncPayload } from './types';
import { decryptBlob, encryptBlob, SyncCryptoError } from './crypto';
import { mergeHistories } from './merge';

const PUSH_DEBOUNCE_MS = 2000;
const PAYLOAD_KIND = 'calc-history' as const;

export interface SyncResult {
  readonly ok: boolean;
  readonly error?: string;
  readonly pulled?: number;
  readonly pushed?: number;
  readonly merged?: number;
}

export interface SyncManagerOpts {
  /** Called to read the current local history snapshot. */
  getLocal: () => HistoryEntry[];
  /** Called to replace local history after a merge. Must update the backing store too. */
  setLocal: (entries: HistoryEntry[]) => void;
  /** Passphrase for the E2E blob. User-supplied; never persisted by this module. */
  passphrase: string;
}

export class SyncManager {
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private pushInFlight: Promise<SyncResult> = Promise.resolve({ ok: true });
  private pendingPush: (() => Promise<void>) | null = null;
  private lastSyncAt = 0;

  constructor(
    private provider: SyncProvider,
    private opts: SyncManagerOpts,
  ) {}

  /**
   * Full sync: pull remote, decrypt, merge with local, write merged back to
   * local + remote. Use on boot, on manual sync, or on schedule. Idempotent.
   */
  async sync(): Promise<SyncResult> {
    try {
      const remoteEntries = await this.pullAndDecrypt();
      const local = this.opts.getLocal();
      const merged = mergeHistories(local, remoteEntries);
      // Only write local if it actually changed (avoid churn on no-op syncs).
      if (!sameSet(merged, local)) {
        this.opts.setLocal(merged);
      }
      // Always push the merged snapshot (cheap if nothing changed - server may
      // dedupe by content hash, or we just overwrite; both fine).
      await this.encryptAndPush(merged);
      this.lastSyncAt = Date.now();
      return {
        ok: true,
        pulled: remoteEntries?.length ?? 0,
        pushed: merged.length,
        merged: merged.length,
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Debounced push-only (skip pull/merge). Hook for history.record/clear: the
   * local cache is already updated synchronously, we just need to ship the new
   * snapshot. Coalesces rapid writes (e.g. tapping = repeatedly) into one PUT.
   * A full sync() on next boot reconciles any multi-device divergence.
   */
  schedulePush(): void {
    // Capture the latest local snapshot lazily at fire time, not at schedule
    // time - record/clear may keep mutating before the debounce window elapses.
    this.pendingPush = () => this.encryptAndPush(this.opts.getLocal());
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null;
      const fn = this.pendingPush;
      this.pendingPush = null;
      if (!fn) return;
      // Chain to avoid interleaved PUTs; last write wins in the chain anyway.
      this.pushInFlight = this.pushInFlight
        .then(() => fn())
        .then(() => ({ ok: true }) as SyncResult)
        .catch((err) => ({ ok: false, error: err instanceof Error ? err.message : String(err) }) as SyncResult);
    }, PUSH_DEBOUNCE_MS);
  }

  /**
   * Cancel any pending debounced push. If a push was pending, fire it
   * immediately and return its promise; otherwise return the last in-flight
   * result. Call on logout / config change.
   */
  flushAndCancel(): Promise<SyncResult> {
    if (this.pushTimer) {
      clearTimeout(this.pushTimer);
      this.pushTimer = null;
    }
    const fn = this.pendingPush;
    this.pendingPush = null;
    if (fn) {
      this.pushInFlight = this.pushInFlight
        .then(() => fn())
        .then(() => ({ ok: true }) as SyncResult)
        .catch((err) => ({ ok: false, error: err instanceof Error ? err.message : String(err) }) as SyncResult);
    }
    return this.pushInFlight;
  }

  /** Clear remote state. Local history is NOT touched (caller's job). */
  async clearRemote(): Promise<SyncResult> {
    try {
      await this.provider.clear();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  get lastSync(): number {
    return this.lastSyncAt;
  }

  private async pullAndDecrypt(): Promise<HistoryEntry[]> {
    const blob = await this.provider.pull();
    if (blob === null || blob === '') return [];
    const plaintext = await decryptBlob(blob, this.opts.passphrase);
    const payload = JSON.parse(plaintext) as SyncPayload;
    if (payload.kind !== PAYLOAD_KIND) {
      throw new SyncCryptoError(`unexpected payload kind: ${payload.kind}`, 'malformed');
    }
    return payload.entries ?? [];
  }

  private async encryptAndPush(entries: HistoryEntry[]): Promise<void> {
    const payload: SyncPayload = {
      kind: PAYLOAD_KIND,
      version: 1,
      entries,
      updatedAt: entries.length ? entries[0].timestamp : Date.now(),
    };
    const plaintext = JSON.stringify(payload);
    const blob = await encryptBlob(plaintext, this.opts.passphrase);
    await this.provider.push(blob);
  }
}

function sameSet(a: readonly HistoryEntry[], b: readonly HistoryEntry[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].timestamp !== b[i].timestamp) return false;
  }
  return true;
}
