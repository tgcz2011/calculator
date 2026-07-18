// ponytail: unified keyboard bridge. DOM keydown works in every webview (Capacitor iOS/Android
// HW keyboard, Tauri desktop, web PWA). The only platform-specific bit is Android back button,
// handled via Capacitor App plugin. One hook, one back-button subscription - no per-platform forks.
import { useEffect } from 'react';
import { isCapacitor, isAndroid } from './platform';

export interface KeyHandler {
  (e: KeyboardEvent): void;
}

export function useKeyboard(handler: KeyHandler): void {
  useEffect(() => {
    const listener = (e: KeyboardEvent) => handler(e);
    window.addEventListener('keydown', listener, { passive: false });
    return () => window.removeEventListener('keydown', listener);
  }, [handler]);
}

// Android hardware back button. Returns a disposer so callers can opt out.
// ponytail: default behavior is "do nothing" (don't exit app on stray back press);
// pass onBack to customize (e.g. close history panel before exiting).
export function useAndroidBack(onBack?: () => void): void {
  useEffect(() => {
    if (!isCapacitor || !isAndroid) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    (async () => {
      try {
        const { App } = await import('@capacitor/app');
        const handle = await App.addListener('backButton', () => {
          if (onBack) onBack();
          // If onBack doesn't preventDefault, default = no-op (don't exit).
        });
        cleanup = () => handle.remove();
      } catch {
        // plugin missing -> no back-button handling. Non-fatal.
      }
    })();
    return () => {
      disposed = true;
      cleanup?.();
      void disposed;
    };
  }, [onBack]);
}

// ponytail: lifecycle hooks for native pause/resume. Lets UI pause heavy work when backgrounded.
export function useNativeLifecycle(onPause?: () => void, onResume?: () => void): void {
  useEffect(() => {
    if (!isCapacitor) return;
    let cleanups: (() => void)[] = [];
    (async () => {
      try {
        const { App } = await import('@capacitor/app');
        const a = await App.addListener('pause', () => onPause?.());
        const b = await App.addListener('resume', () => onResume?.());
        cleanups = [() => a.remove(), () => b.remove()];
      } catch {
        // non-fatal
      }
    })();
    return () => cleanups.forEach((c) => c());
  }, [onPause, onResume]);
}
