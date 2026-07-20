// ponytail: platform detection in one place. All native branches route through here
// so engine/history/keyboard never re-sniff the environment.

function raw(): 'ios' | 'android' | 'macos' | 'windows' | 'linux' | 'web' {
  if (typeof window === 'undefined') return 'web';
  const cap = (window as any).Capacitor;
  if (cap?.isNativePlatform?.()) {
    const plat: string = cap.getPlatform?.() ?? 'web';
    if (plat === 'ios') return 'ios';
    if (plat === 'android') return 'android';
  }
  if ('__TAURI_INTERNALS__' in window) {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('mac')) return 'macos';
    if (ua.includes('win')) return 'windows';
    return 'linux';
  }
  return 'web';
}

export const platform = raw();
export const isWeb = platform === 'web';
export const isIOS = platform === 'ios';
export const isAndroid = platform === 'android';
export const isMobileNative = isIOS || isAndroid;
export const isTauri = platform === 'macos' || platform === 'windows' || platform === 'linux';
export const isCapacitor = isIOS || isAndroid;
export const isDesktop =
  isTauri ||
  (!isMobileNative && typeof window !== 'undefined' && !!window.matchMedia?.('(min-width: 768px)').matches);
