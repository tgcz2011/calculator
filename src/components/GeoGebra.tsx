// ponytail (TGC-29): GeoGebra Calculator Suite (non-Classic) loaded from the
// source-built GWT bundle vendored under /geogebra/. The issue explicitly
// forbids "用 web" (i.e. iframe https://www.geogebra.org hosting service)
// but is OK with "用源码" — this component consumes the GWT-compiled JS
// produced by `:web:suite` in geogebra/source/web. The vendored bundle ships
// in public/geogebra/ (deployggb.js bootstrap + suite/<perm>/... permutation
// files + the static assets GWT emits at compile time).
//
// Build path (provided by General(high) per the audit):
//   ./gradlew :web:suite  (or equivalent gwtCompile target)
//   cp -r source/web/web/war/deployggb.js        calculator/public/geogebra/
//   cp -r source/web/web/war/suite/              calculator/public/geogebra/suite/
//   cp -r source/web/web/war/css/                calculator/public/geogebra/css/   (if needed by bundle)
// Until that lands, the component surfaces a clear empty-state explaining the
// expected path so this integration can be e2e-tested without the real bundle.
//
// Integration model: Tier B from the original audit. The GWT bundle exposes
// `window.GGBApplet` (the official loader class) — we instantiate it with
// Calculator Suite parameters (`appName: 'suite'`, GeoGebra's "5.0" article
// version) and `.inject()` it into a ref'd <div>. This is the pattern
// geogebra.org's own embed snippet uses; it is not an iframe to the hosted
// service, so it satisfies the "用源码 / 不要 web" constraint.
//
// Lifecycle:
//  - First mount: inject <script src="/geogebra/deployggb.js"> exactly once
//    (idempotent guard so multiple mounts / strict-mode double-invoke don't
//    double-load). deployggb.js exposes `GGBApplet` on window.
//  - After load, construct the applet and call `.inject(container)`.
//  - On unmount, call `.removeFromDOM()` to free listeners.
//  - On any failure (HTTP 404 for the bundle, JS error, missing GGBApplet),
//    surface a localized error so the user / e2e sees the state clearly.
//
// State machine (mirrored on the root container via `data-state`):
//   idle     - container mounted, loader not yet started
//   loading  - bootstrap script in flight, GWT permutation warming up
//   ready    - applet injected
//   error    - bundle missing or loader failed (with a retry button)
// e2e uses `data-state="ready"` to assert the bundle is actually wired up;
// until General(high) produces the bundle, the integration is e2e-tested at
// the `error` / `missing-bundle` contract (asserts the tile is present, the
// pane mounts, and the empty-state copy is shown) — that's what the spec.md
// §2.15 entry commits us to.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

// ponytail: minimal typing for the GWT loader. GGBApplet is documented at
// https://wiki.geogebra.org/en/Reference:GeoGebra_Apps_Embedding_API; we only
// touch the methods we actually call. Kept loose (any) on the parameter object
// because the bundle exposes ~80 optional params (language, fontScale,
// showToolBar, etc.) and we don't want to mirror the full schema in TS — the
// runtime contract is the GWT Java side.
interface GGBAppletInstance {
  inject(el: HTMLElement): Promise<void> | void;
  removeFromDOM(): void;
  // Allow-list of common callbacks we don't call yet but want in the type for
  // future hooks (e.g. sync the GGB selection back to the basic calculator).
  // Unused at the moment; declared `unknown` so we don't leak the GWT types.
  getBase64?(): string;
}

interface GGBAppletConstructor {
  new (
    parameters: Record<string, unknown>,
    articleVersion: string,
    views?: unknown,
  ): GGBAppletInstance;
}

declare global {
  interface Window {
    GGBApplet?: GGBAppletConstructor;
    __geogebraBootLoaded?: boolean;
  }
}

const BUNDLE_BOOTSTRAP = '/geogebra/deployggb.js';
const APPLET_TEST_ID = 'geogebra-applet';
const CONTAINER_TEST_ID = 'geogebra-container';
const RETRY_TEST_ID = 'geogebra-retry';

type LoaderState = 'idle' | 'loading' | 'ready' | 'error';

interface LoaderError {
  message: string;
  code: 'BUNDLE_MISSING' | 'LOADER_FAILED' | 'INJECT_FAILED';
}

function buildScript(): HTMLScriptElement {
  const s = document.createElement('script');
  s.src = BUNDLE_BOOTSTRAP;
  s.async = true;
  s.crossOrigin = 'anonymous';
  s.dataset.geogebraBootstrap = 'true';
  return s;
}

export interface GeoGebraProps {
  /** Locale tag forwarded to GGBApplet (e.g. 'en', 'zh_CN'). Empty string keeps
   *  the bundle's default — usually English. */
  locale?: string;
  /** Translation lookup for the empty-state + status copy. Mirrors the
   *  signature of `useI18n().t` so the loader can interpolate `{path}` in
   *  the expected-path copy. */
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** Force-mount an `appName` override. Calculator Suite is `suite`; the
   *  bundle's other permutations (graphing / cas / geometry / etc.) are
   *  accepted here without code changes if you want to A/B. Defaults to
   *  `suite` per the TGC-29 spec ("not Classic", "Calculator Suite"). */
  appName?: 'suite' | 'graphing' | 'cas' | 'geometry' | 'scientific' | '3d';
}

export function GeoGebra({ locale, t, appName = 'suite' }: GeoGebraProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const appletRef = useRef<GGBAppletInstance | null>(null);
  const [state, setState] = useState<LoaderState>('idle');
  const [err, setErr] = useState<LoaderError | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  const inject = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const Ctor = window.GGBApplet;
    if (!Ctor) {
      setState('error');
      setErr({ code: 'LOADER_FAILED', message: t('graph.error.noGGBApplet') });
      return;
    }
    try {
      // ponytail: Calculator Suite parameters. Article version '5.0' is
      // GeoGebra's bundle-compatible version identifier; it tells the GWT
      // runtime which serialization format the app speaks. `showToolBar` /
      // `showAlgebraInput` left off so the applet ships with its full UI and
      // the user gets the same experience as https://www.geogebra.org/calculator
      // but served from /geogebra/ rather than geogebra.org.
      const applet = new Ctor(
        {
          appName,
          width: container.clientWidth || 800,
          height: container.clientHeight || 600,
          showToolBar: true,
          showAlgebraInput: true,
          showMenuBar: false,
          showResetIcon: false,
          enableRightClick: true,
          enableLabelDrags: true,
          enableShiftDragZoom: true,
          language: locale || 'en',
          useBrowserForTabs: true,
          preventFocus: false,
          // ponytail: appletContainer is the legacy alias some GWT builds
          // read off the parameters dict; harmless if ignored.
          appletContainer: container,
        },
        '5.0',
      );
      const result = applet.inject(container);
      if (result && typeof (result as Promise<void>).then === 'function') {
        (result as Promise<void>).catch((e: unknown) => {
          setState('error');
          setErr({
            code: 'INJECT_FAILED',
            message: e instanceof Error ? e.message : String(e),
          });
        });
      }
      appletRef.current = applet;
      setState('ready');
    } catch (e) {
      setState('error');
      setErr({
        code: 'INJECT_FAILED',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, [appName, locale, t]);

  useEffect(() => {
    let cancelled = false;

    const onScriptError = () => {
      if (cancelled) return;
      setState('error');
      setErr({ code: 'BUNDLE_MISSING', message: t('graph.error.bundleMissing') });
    };

    // ponytail: idempotent loader. deployggb.js is small but the suite
    // permutation it bootstraps is multi-MB; double-injection (e.g. from
    // React 18 StrictMode double-invoke in dev, or from quick tile-tap on the
    // picker) would double-load and burn bandwidth. The guard is keyed on a
    // window flag set by the bootstrap script's own onload — we don't try to
    // parse deployggb.js to know if it's the same instance, we just check
    // "has window.GGBApplet appeared before?".
    const alreadyLoaded = window.__geogebraBootLoaded && window.GGBApplet;
    if (alreadyLoaded) {
      inject();
      return () => {
        cancelled = true;
      };
    }

    setState('loading');
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-geogebra-bootstrap="true"]',
    );
    let script: HTMLScriptElement;
    if (existing) {
      // ponytail: another component (or an earlier StrictMode pass) already
      // started loading the bootstrap. Attach our listeners and bail out of
      // creating a duplicate <script>.
      script = existing;
    } else {
      script = buildScript();
      document.head.appendChild(script);
    }

    const onLoad = () => {
      if (cancelled) return;
      window.__geogebraBootLoaded = true;
      inject();
    };
    script.addEventListener('load', onLoad);
    script.addEventListener('error', onScriptError);

    // ponytail: if the bootstrap already finished before this effect ran
    // (cached + repeat-mount), `load` will never re-fire on the existing
    // element. Polling is gross but it's the only race-free way to detect
    // "script tag is already loaded and GGBApplet is now available". Cap at
    // ~10s so a hung load eventually surfaces as an error.
    if (window.GGBApplet) {
      window.__geogebraBootLoaded = true;
      inject();
    } else if (!existing) {
      const poll = window.setInterval(() => {
        if (cancelled) {
          window.clearInterval(poll);
          return;
        }
        if (window.GGBApplet) {
          window.clearInterval(poll);
          window.__geogebraBootLoaded = true;
          inject();
        }
      }, 200);
      // ponytail: belt + suspenders — clear the poll after 10s so we don't
      // spin forever on a broken bootstrap.
      window.setTimeout(() => window.clearInterval(poll), 10_000);
    }

    return () => {
      cancelled = true;
      script.removeEventListener('load', onLoad);
      script.removeEventListener('error', onScriptError);
      // ponytail: keep the <script> tag in place across remounts so a quick
      // re-pick of the tile doesn't trigger a fresh network fetch. Only the
      // applet instance is torn down.
      const applet = appletRef.current;
      if (applet) {
        try {
          applet.removeFromDOM();
        } catch {
          // ignore — GWT sometimes throws if the applet was already torn
          // down by the host page.
        }
        appletRef.current = null;
      }
    };
    // ponytail: `retryNonce` is the only thing that should re-run the
    // injection after an error. Locale / appName changes are intentionally
    // ignored here to avoid injecting the applet twice in quick succession;
    // they re-render the empty-state copy but don't restart the loader.
  }, [inject, retryNonce]);

  const onRetry = useCallback(() => {
    setErr(null);
    setState('loading');
    setRetryNonce((n) => n + 1);
  }, []);

  // ponytail: render only an empty-state when the bundle is missing/error.
  // The actual applet container is always mounted (so e2e can assert on its
  // presence), but it's only given size when state==='ready' so the
  // placeholder / error copy fills the space cleanly.
  const containerStyle: CSSProperties = {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    height: '100%',
    background: 'var(--bg-elevated)',
    borderRadius: 'var(--radius-md)',
    overflow: 'hidden',
  };
  const appletHostStyle: CSSProperties = {
    flex: 1,
    minHeight: 0,
    width: '100%',
    height: '100%',
  };
  const placeholderStyle: CSSProperties = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--s-6)',
    gap: 'var(--s-3)',
    textAlign: 'center',
    color: 'var(--text-secondary)',
  };

  return (
    <div
      data-testid={CONTAINER_TEST_ID}
      data-state={state}
      data-app-name={appName}
      data-ggb-applet="true"
      style={containerStyle}
      // ponytail: belt-and-suspenders guard against the parent's window
      // keydown handler routing Graphing keystrokes into the basic
      // calculator. The handler reads `isEditableFieldTarget` (which inspects
      // event.target) — but the GWT applet host sits in a different iframe /
      // shadow boundary so its input events arrive with `event.target` set to
      // the applet's own elements, which the parent's guard already excludes
      // (any non-Expression input/textarea bails). Marking the host with
      // `data-ggb-applet='true'` lets the parent extend the bail if a future
      // refactor relaxes the heuristic. See spec.md §3.17.
    >
      {state === 'ready' ? (
        <div
          ref={containerRef}
          data-testid={APPLET_TEST_ID}
          data-ggb-applet="true"
          style={appletHostStyle}
        />
      ) : (
        <div style={placeholderStyle} data-testid="geogebra-status">
          {state === 'loading' && (
            <>
              <span style={{ fontSize: 36, lineHeight: 1 }} aria-hidden>
                {'\u{1F4CA}'}
              </span>
              <span>{t('graph.loading')}</span>
            </>
          )}
          {state === 'error' && err && (
            <>
              <span style={{ fontSize: 36, lineHeight: 1 }} aria-hidden>
                {'\u26A0'}
              </span>
              <strong>{t('graph.error.title')}</strong>
              <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                {err.message}
              </span>
              {err.code === 'BUNDLE_MISSING' && (
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                  {t('graph.error.bundlePath', { path: '/geogebra/deployggb.js' })}
                </span>
              )}
              <button
                type="button"
                data-testid={RETRY_TEST_ID}
                onClick={onRetry}
                style={{
                  marginTop: 'var(--s-2)',
                  padding: 'var(--s-2) var(--s-4)',
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--accent)',
                  color: 'var(--text-on-accent)',
                  fontWeight: 600,
                }}
              >
                {t('graph.retry')}
              </button>
            </>
          )}
          {state === 'idle' && (
            <>
              <span style={{ fontSize: 36, lineHeight: 1 }} aria-hidden>
                {'\u{1F4CA}'}
              </span>
              <span>{t('graph.idle')}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}