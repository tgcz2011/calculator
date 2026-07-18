#!/usr/bin/env bash
# ponytail: one pipeline script, all platforms. Each target is independently runnable;
# skip the ones whose toolchain isn't on this machine. Web is always available.
set -euo pipefail

TARGET="${1:-web}"
cd "$(dirname "$0")/.."

case "$TARGET" in
  web|pwa)
    echo ">> building web PWA (dist/)"
    npm run typecheck
    npm run smoke
    npm run build
    echo ">> web PWA bundle: dist/  (serve with: npm run preview)"
    ;;
  ios|ipados)
    echo ">> building Capacitor iOS/iPadOS"
    npm run build
    [ -d ios ] || npm run cap:add:ios
    npm run cap:ios
    echo ">> open Xcode; select target; Run on iPhone/iPad simulator"
    ;;
  android)
    echo ">> building Capacitor Android"
    npm run build
    [ -d android ] || npm run cap:add:android
    npm run cap:android
    echo ">> open Android Studio; Run on emulator"
    ;;
  macos|windows|linux|desktop)
    echo ">> building Tauri desktop ($TARGET)"
    npm run build
    npx tauri build
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
