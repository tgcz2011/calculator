// Cross-platform history sync. SyncProvider is the transport-agnostic contract:
// both iCloud (NSUbiquitousKeyValueStore via native bridge) and WebDAV (fetch +
// Basic Auth) ship an opaque encrypted blob string. The SyncManager owns the
// crypto + merge; providers never see plaintext. This keeps the server blind
// (WebDAV provider) and the contract uniform across transports.
//
// ponytail: providers move one opaque string. No partial sync, no per-entry
// transport protocol - the blob IS the history snapshot. Conflict resolution
// (last-write-wins by timestamp, union by id) lives in the manager, not the
// transport. A 5KB history blob is one round-trip; chunking is YAGNI until it
// isn't.

import type { HistoryEntry } from '../history/api';

export interface SyncProvider {
  /** Stable id for config persistence, e.g. 'webdav' | 'icloud'. */
  readonly id: string;
  /** Human label for UI, e.g. '坚果云' | 'iCloud'. */
  readonly label: string;
  /**
   * Pull the remote encrypted blob. Returns null if no remote state exists yet
   * (first device, or remote was cleared). Throw on transient/auth errors -
   * the manager surfaces them to the caller, never to history writes.
   */
  pull(): Promise<string | null>;
  /** Push the encrypted blob, overwriting any remote state. */
  push(blob: string): Promise<void>;
  /** Delete the remote state. 404 / not-found is a no-op. */
  clear(): Promise<void>;
}

/** WebDAV provider config. Persisted to localStorage by the manager. */
export interface WebDavConfig {
  endpoint: string;  // e.g. 'https://dav.jianguoyun.com/dav/'
  username: string;
  /** App password (坚果云) or account password (generic WebDAV). */
  password: string;
  /** Remote path under endpoint, e.g. '/calc/sync.bin'. */
  path: string;
}

/** Preset for known WebDAV providers - pre-fills config + login hints for UI. */
export interface WebDavPreset {
  readonly id: string;
  readonly label: string;
  readonly endpoint: string;
  readonly path: string;
  readonly usernameHint: string;
  readonly passwordHint: string;
}

/**
 * 坚果云 (Jianguoyun) - mainstream Chinese WebDAV. Users must generate an
 * app-specific password at https://www.jianguoyun.com/d/home#/safety
 * (account password login is rejected by the WebDAV API).
 */
export const JIANGUOYUN_PRESET: WebDavPreset = {
  id: 'jianguoyun',
  label: '坚果云',
  endpoint: 'https://dav.jianguoyun.com/dav/',
  path: '/calc/sync.bin',
  usernameHint: '账号邮箱（登录用的邮箱）',
  passwordHint: '应用密码 - 在 jianguoyun.com 「账户信息 - 安全选项」生成，非登录密码',
};

/** Generic WebDAV (any RFC 4918 server: Nextcloud, Synology, self-hosted, etc). */
export const GENERIC_WEBDAV_PRESET: WebDavPreset = {
  id: 'webdav',
  label: 'WebDAV',
  endpoint: '',
  path: '/calc/sync.bin',
  usernameHint: '用户名',
  passwordHint: '密码',
};

export const ALL_WEBDAV_PRESETS: readonly WebDavPreset[] = [
  JIANGUOYUN_PRESET,
  GENERIC_WEBDAV_PRESET,
];

/** Serialized sync payload (the plaintext inside the encrypted blob). */
export interface SyncPayload {
  readonly kind: 'calc-history';
  readonly version: 1;
  readonly entries: HistoryEntry[];
  /** High-water mark of the most recent entry timestamp included. */
  readonly updatedAt: number;
}
