// iCloud SyncProvider - stub. The sync blob contract (opaque encrypted string)
// maps 1:1 to NSUbiquitousKeyValueStore on iOS/macOS and CloudKit on Web (via
// a native bridge). The interface is proven by WebDavSyncProvider; this stub
// throws on use until the native bridge lands.
//
// ponytail: P2 - requires a Capacitor plugin (or Tauri plugin on macOS) that
// exposes NSUbiquitousKeyValueStore.setString/getString. The bridge is
// straightforward but needs Xcode to validate, which is blocked on the human
// owner providing the native toolchain (see issue metadata `waiting_on`).
// The E2E crypto + merge logic is identical to WebDAV, so when the bridge
// lands this provider is ~30 lines of glue.

import type { SyncProvider } from './types';

export class ICloudSyncProvider implements SyncProvider {
  readonly id = 'icloud';
  readonly label = 'iCloud';

  async pull(): Promise<string | null> {
    throw new Error('iCloud sync: requires native bridge (P2 - see issue waiting_on)');
  }
  async push(): Promise<void> {
    throw new Error('iCloud sync: requires native bridge (P2 - see issue waiting_on)');
  }
  async clear(): Promise<void> {
    throw new Error('iCloud sync: requires native bridge (P2 - see issue waiting_on)');
  }
}
