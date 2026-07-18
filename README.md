# Calculator

Apple-style all-platform calculator. React + Vite + TypeScript + math.js engine.
Six platforms from one web bundle: iOS / iPadOS / Android (Capacitor), macOS / Windows / Linux (Tauri), Web (PWA fallback).

## Architecture

```
src/
  engine/index.ts       # math.js engine, canonical evaluate(expr) contract
  history/api.ts        # canonical history contract + platform picker (sync)
  history/sqlite.ts     # SQLite backend (Capacitor + Tauri), in-memory mirror
  native/platform.ts    # platform detection (web/ios/android/macos/...)
  native/keyboard.ts    # unified keyboard + Android back + lifecycle hooks
  styles/tokens.css     # baseline design tokens (Minimax owns full system)
  App.tsx               # minimal shell UI (Minimax's full UI supersedes this)
  main.tsx              # React bootstrap, awaits history hydration
```

## Locked contracts (do not change signatures)

**Engine** (`src/engine/index.ts`):
```ts
interface Engine {
  evaluate(expr: string, options?: { angle: 'deg' | 'rad' }): { value: string; error?: string };
  setAngleMode(mode: 'deg' | 'rad'): void;
  getAngleMode(): 'deg' | 'rad';
}
export const engine: Engine;
```

**History** (`src/history/api.ts`):
```ts
interface HistoryEntry { id: string; expression: string; result: string; timestamp: number; }
interface HistoryAPI {
  record(expression: string, result: string): HistoryEntry;
  list(): HistoryEntry[];
  clear(): void;
}
export const history: HistoryAPI;
export function initHistory(): Promise<void>;  // await at boot before render
```

## Develop

```bash
npm install
npm run dev          # web dev server (http://localhost:5173)
```

## Verify (no native toolchains needed)

```bash
npm run typecheck    # tsc, 0 errors
npm run smoke        # contract smoke test (engine + history)
npm run build        # vite build -> dist/
```

Or: `./scripts/build.sh check`

## Build per platform

```bash
./scripts/build.sh web        # PWA bundle (dist/)
./scripts/build.sh ios        # Capacitor iOS/iPadOS (needs Xcode + CocoaPods)
./scripts/build.sh android    # Capacitor Android (needs Android Studio)
./scripts/build.sh macos      # Tauri macOS desktop (needs Rust)
./scripts/build.sh dev-macos  # Tauri dev with live reload
```

## Native setup (one-time, per platform)

**iOS/iPadOS** (Capacitor): requires Xcode + CocoaPods.
```bash
sudo gem install cocoapods   # if missing
npm run cap:add:ios          # generates ios/ project
npm run cap:ios              # sync + open in Xcode
```

**Android** (Capacitor): requires Android Studio.
```bash
npm run cap:add:android
npm run cap:android
```

**macOS/Win/Linux** (Tauri): requires Rust.
```bash
npx tauri icon ./public/icon.svg   # generate icon set (one-time, before release build)
npx tauri dev                      # or: ./scripts/build.sh dev-macos
npx tauri build                    # release bundle
```

## SQLite history

- Web/PWA: LocalStorage (durable, sync). No native deps.
- iOS/iPadOS/Android (Capacitor): `@capacitor-community/sqlite`. In-memory mirror hydrates at boot; sync contract preserved.
- macOS/Win/Linux (Tauri): `@tauri-apps/plugin-sql` (Rust plugin registered in `src-tauri/src/lib.rs`). Same mirror pattern.

Platform picker lives in `src/history/api.ts`. To swap a backend, edit one file; UI is untouched.
