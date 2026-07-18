// History merge: union by id, last-write-wins by timestamp, capped at MAX_ENTRIES.
// Pure function - no I/O, no crypto - so it's trivially unit-testable.
//
// ponytail: LWW by timestamp is the simplest correct CRDT for append-mostly
// history with monotonic clocks. Edge cases (clock skew across devices) are
// bounded by the entry's timestamp being set by Date.now() on the originating
// device; a skewed clock mis-orders entries but never loses them. If a user
// clears history on device A while device B records, the clear wins locally on
// A and the next B sync re-introduces B's entries - acceptable for a
// calculator history (not a trust boundary). Upgrade path: vector clocks if
// this ever becomes a real conflict surface (it won't).

import type { HistoryEntry } from '../history/api';

export const SYNC_MAX_ENTRIES = 500;

/**
 * Merge two history lists. Returns entries sorted newest-first, deduped by id
 * (highest timestamp wins for dupes), capped at SYNC_MAX_ENTRIES.
 */
export function mergeHistories(local: readonly HistoryEntry[], remote: readonly HistoryEntry[]): HistoryEntry[] {
  const byId = new Map<string, HistoryEntry>();
  for (const e of local) {
    const prev = byId.get(e.id);
    if (!prev || e.timestamp > prev.timestamp) byId.set(e.id, e);
  }
  for (const e of remote) {
    const prev = byId.get(e.id);
    if (!prev || e.timestamp > prev.timestamp) byId.set(e.id, e);
  }
  const merged = Array.from(byId.values()).sort((a, b) => b.timestamp - a.timestamp);
  if (merged.length > SYNC_MAX_ENTRIES) merged.length = SYNC_MAX_ENTRIES;
  return merged;
}
