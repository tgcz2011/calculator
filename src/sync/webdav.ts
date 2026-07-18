// WebDAV SyncProvider. RFC 4918 subset: PROPFIND (existence check), GET (pull),
// PUT (push), DELETE (clear). Basic Auth with the app password. The provider
// moves an opaque base64 string - it never sees plaintext (crypto is the
// manager's job) and never interprets the blob.
//
// ponytail: fetch is injected (default globalThis.fetch) so tests pass an
// in-memory fake server. No WebDAV client library - the four verbs we need are
// plain HTTP with one custom method (PROPFIND) and one custom header (Depth).
// Adding webdav-client for 4 calls would be more deps than code.
//
// 坚果云 notes:
// - endpoint root is https://dav.jianguoyun.com/dav/ (note trailing slash).
// - collections (folders) must exist before PUT; we MKCOL the parent best-effort
//   on 409 Conflict. 坚果云 allows MKCOL on the dav root subtree.
// - app password only; account password is rejected by their WebDAV gateway.

import type { SyncProvider, WebDavConfig } from './types';

export type FetchLike = typeof globalThis.fetch;

export class WebDavSyncError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'WebDavSyncError';
  }
}

function basicAuth(username: string, password: string): string {
  // btoa is available in browsers, Tauri webview, Capacitor WKWebView, Node 16+.
  return 'Basic ' + btoa(`${username}:${password}`);
}

function joinUrl(endpoint: string, path: string): string {
  // endpoint may or may not end with '/'; path always starts with '/'.
  return endpoint.endsWith('/') ? endpoint + path.slice(1) : endpoint + path;
}

export class WebDavSyncProvider implements SyncProvider {
  readonly id = 'webdav';
  readonly label: string;

  constructor(
    private config: WebDavConfig,
    private fetchFn: FetchLike = globalThis.fetch,
  ) {
    this.label = config.endpoint.includes('jianguoyun.com') ? '坚果云' : 'WebDAV';
  }

  /** PROPFIND Depth:0 - existence check. Returns true if path exists (file or collection). */
  async exists(): Promise<boolean> {
    const res = await this.fetchFn(joinUrl(this.config.endpoint, this.config.path), {
      method: 'PROPFIND',
      headers: {
        Authorization: basicAuth(this.config.username, this.config.password),
        Depth: '0',
        'Content-Type': 'application/xml; charset=utf-8',
      },
      body: '<?xml version="1.0"?><propfind xmlns="DAV:"><prop/></propfind>',
    });
    // 207 Multi-Status = exists. 404 = doesn't. Anything else = error.
    if (res.status === 207) return true;
    if (res.status === 404) return false;
    throw new WebDavSyncError(`PROPFIND failed: ${res.status} ${res.statusText}`, res.status);
  }

  /** GET - pull the blob body. Returns null if path doesn't exist. */
  async pull(): Promise<string | null> {
    const res = await this.fetchFn(joinUrl(this.config.endpoint, this.config.path), {
      method: 'GET',
      headers: { Authorization: basicAuth(this.config.username, this.config.password) },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new WebDavSyncError(`GET failed: ${res.status} ${res.statusText}`, res.status);
    return res.text();
  }

  /** PUT - push the blob, creating parent collection if missing (409 -> MKCOL -> retry). */
  async push(blob: string): Promise<void> {
    const url = joinUrl(this.config.endpoint, this.config.path);
    const headers = {
      Authorization: basicAuth(this.config.username, this.config.password),
      'Content-Type': 'application/octet-stream',
    };
    let res = await this.fetchFn(url, { method: 'PUT', headers, body: blob });
    if (res.status === 409) {
      // Parent collection missing. MKCOL it (best-effort, 405/301 = already exists).
      await this.mkcolParent();
      res = await this.fetchFn(url, { method: 'PUT', headers, body: blob });
    }
    if (!res.ok && res.status !== 204) {
      throw new WebDavSyncError(`PUT failed: ${res.status} ${res.statusText}`, res.status);
    }
  }

  /** DELETE - remove the blob. 404 = already gone, treat as success. */
  async clear(): Promise<void> {
    const res = await this.fetchFn(joinUrl(this.config.endpoint, this.config.path), {
      method: 'DELETE',
      headers: { Authorization: basicAuth(this.config.username, this.config.password) },
    });
    if (res.status === 404 || res.status === 204 || res.ok) return;
    throw new WebDavSyncError(`DELETE failed: ${res.status} ${res.statusText}`, res.status);
  }

  /** MKCOL the parent path of the sync file. Idempotent. */
  private async mkcolParent(): Promise<void> {
    const path = this.config.path;
    const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    if (!parent) return;
    const res = await this.fetchFn(joinUrl(this.config.endpoint, parent + '/'), {
      method: 'MKCOL',
      headers: { Authorization: basicAuth(this.config.username, this.config.password) },
    });
    // 201 created, 405 method not allowed (exists), 301 exists - all fine.
    if (!res.ok && res.status !== 405 && res.status !== 301) {
      throw new WebDavSyncError(`MKCOL parent failed: ${res.status} ${res.statusText}`, res.status);
    }
  }
}
