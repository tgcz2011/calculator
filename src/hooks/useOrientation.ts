// ponytail: screen orientation hook. Tracks the current orientation via
// matchMedia('(orientation: ...)') and exposes lock/unlock/toggle that wrap
// the Screen Orientation API. The API only works in fullscreen PWA / native
// contexts — on a regular browser tab, lock() requests fullscreen first, then
// attempts the lock. iOS Safari doesn't support screen.orientation.lock at
// all; there, lock() returns false and the caller can show a rotate hint.
//
// Scientific mode uses lock('landscape') on enter to force landscape; other
// modes call unlock() so the user can rotate freely. The toggle button in the
// top bar calls toggle() so users can manually flip orientation in any mode.

import { useCallback, useEffect, useState } from 'react';

export type Orientation = 'portrait' | 'landscape';

// ponytail: the standard TS DOM lib types ScreenOrientation without the lock()
// / unlock() methods (they live behind the ScreenOrientationLock feature flag).
// We cast through unknown to a minimal interface that has them, so the hook
// compiles without overriding the global Screen type.
interface ScreenOrientationLockAPI {
  lock(orientation: 'portrait' | 'landscape'): Promise<void>;
  unlock(): void;
}

export interface UseOrientationResult {
  orientation: Orientation;
  /** Lock to the target orientation. Returns true on success, false if
   *  unsupported or fullscreen was denied. Caller should show a hint on false. */
  lock(target: Orientation): Promise<boolean>;
  /** Release any orientation lock. No-op if nothing was locked. */
  unlock(): void;
  /** Toggle between portrait and landscape. Returns lock() result. */
  toggle(): Promise<boolean>;
}

function getLockAPI(): ScreenOrientationLockAPI | null {
  if (typeof screen === 'undefined') return null;
  const o = (screen as unknown as { orientation?: ScreenOrientationLockAPI }).orientation;
  return o ?? null;
}

export function useOrientation(): UseOrientationResult {
  const [orientation, setOrientation] = useState<Orientation>(() => {
    if (typeof window === 'undefined') return 'portrait';
    return window.matchMedia('(orientation: landscape)').matches ? 'landscape' : 'portrait';
  });

  useEffect(() => {
    const mq = window.matchMedia('(orientation: landscape)');
    const handler = () => setOrientation(mq.matches ? 'landscape' : 'portrait');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const lock = useCallback(async (target: Orientation): Promise<boolean> => {
    const api = getLockAPI();
    if (!api) return false;
    try {
      await api.lock(target);
      return true;
    } catch {
      // lock() throws if not in fullscreen. Try requesting fullscreen first.
      try {
        await document.documentElement.requestFullscreen();
        await api.lock(target);
        return true;
      } catch {
        // Fullscreen denied or lock unsupported (iOS Safari).
        return false;
      }
    }
  }, []);

  const unlock = useCallback(() => {
    const api = getLockAPI();
    try {
      api?.unlock();
    } catch {
      // ignore — nothing was locked
    }
  }, []);

  const toggle = useCallback(async (): Promise<boolean> => {
    const target: Orientation = orientation === 'landscape' ? 'portrait' : 'landscape';
    return lock(target);
  }, [orientation, lock]);

  return { orientation, lock, unlock, toggle };
}
