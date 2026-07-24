#!/usr/bin/env bash
# ponytail: one pipeline script, all platforms. Each target is independently runnable;
# skip the ones whose toolchain isn't on this machine. Web is always available.
set -euo pipefail

TARGET="${1:-web}"
cd "$(dirname "$0")/.."

# ponytail (TGC-29): every build target needs the GeoGebra GWT bundle
# vendored under public/geogebra/ before vite runs (vite copies public/
# into dist/, and Capacitor/Tauri then bake dist/ into native assets).
# Without this, native builds produce artifacts where the applet 404s
# at runtime. Skip only for `check` (typecheck/smoke/build are
# greenfield — bundle isn't required to compile) and `dev-macos`
# (Tauri dev starts vite which can fetch on-the-fly via the public
# dir's gitignore rule and a manual `git checkout ... -- public/geogebra`
# ahead of time).
case "$TARGET" in
  check|dev-macos)
    ;;
  *)
    bash scripts/fetch-bundle.sh
    ;;
esac

case "$TARGET" in
  web|pwa)
    echo ">> building web PWA (dist/)"
    npm run typecheck
    npm run smoke
    npm run build
    # ponytail (TGC-29): vite wipes dist/ at the start of `npm run
    # build` and re-creates it, so the SHA stamp fetch-bundle.sh wrote
    # into dist/ doesn't survive. Re-stamp from .geogebra-bundle.sha
    # (gitignored, written by fetch-bundle.sh BEFORE the build) so the
    # released zip self-documents which bundle commit shipped.
    [ -f .geogebra-bundle.sha ] && cp .geogebra-bundle.sha dist/BUNDLE_SHA.txt && echo ">> bundle stamp -> dist/BUNDLE_SHA.txt"
    echo ">> web PWA bundle: dist/  (serve with: npm run preview)"
    ;;
  ios|ipados)
    echo ">> building Capacitor iOS/iPadOS"
    npm run build
    [ -d ios ] || npm run cap:add:ios
    npm run cap:ios
    [ -f .geogebra-bundle.sha ] && cp .geogebra-bundle.sha dist/BUNDLE_SHA.txt
    echo ">> open Xcode; select target; Run on iPhone/iPad simulator"
    ;;
  android)
    echo ">> building Capacitor Android"
    npm run build
    [ -d android ] || npm run cap:add:android
    npm run cap:android
    [ -f .geogebra-bundle.sha ] && cp .geogebra-bundle.sha dist/BUNDLE_SHA.txt
    echo ">> open Android Studio; Run on emulator"
    ;;
  macos|windows|linux|desktop)
    echo ">> building Tauri desktop ($TARGET)"
    npm run build
    npx tauri build
    [ -f .geogebra-bundle.sha ] && cp .geogebra-bundle.sha dist/BUNDLE_SHA.txt
    ;;
  dev-macos)
    echo ">> Tauri dev (macOS) - live reload"
    npx tauri dev
    ;;
  check)
    echo ">> fast verification (no native toolchains required)"
    npm run typecheck
    npm run smoke
    npm run build
    ;;
  *)
    echo "usage: $0 {web|ios|ipados|android|macos|windows|linux|dev-macos|check}"
    exit 1
    ;;
esac
