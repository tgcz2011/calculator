// Sync module public surface. Factory helpers + re-exports.
//
// ponytail: no global singleton here. The app decides when to construct a
// SyncManager (after the user configures sync in settings) and registers it
// with history/api.ts via setSyncPush. Until then, sync is dormant and history
// works exactly as before.

import type { HistoryEntry } from '../history/api';
import type { SyncProvider, WebDavConfig } from './types';
import { WebDavSyncProvider } from './webdav';
import { ICloudSyncProvider } from './icloud';
import { SyncManager, type SyncManagerOpts } from './manager';

export type { SyncProvider, WebDavConfig, WebDavPreset, SyncPayload } from './types';
export { JIANGUOYUN_PRESET, GENERIC_WEBDAV_PRESET, ALL_WEBDAV_PRESETS } from './types';
export { WebDavSyncProvider, WebDavSyncError, type FetchLike } from './webdav';
export { ICloudSyncProvider } from './icloud';
export { SyncManager, type SyncManagerOpts, type SyncResult } from './manager';
export { encryptBlob, decryptBlob, SyncCryptoError } from './crypto';
export { mergeHistories, SYNC_MAX_ENTRIES } from './merge';

/** Build the WebDAV provider from a persisted config. */
export function createWebDavProvider(config: WebDavConfig): WebDavSyncProvider {
  return new WebDavSyncProvider(config);
}

/** Build the iCloud provider (stub - throws on use until native bridge lands). */
export function createICloudProvider(): ICloudSyncProvider {
  return new ICloudSyncProvider();
}

/** Convenience: build a manager from a provider + passphrase + local accessors. */
export function createSyncManager(
  provider: SyncProvider,
  opts: SyncManagerOpts,
): SyncManager {
  return new SyncManager(provider, opts);
}

export type { HistoryEntry };
