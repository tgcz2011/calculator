# Calculator

Apple-style all-platform calculator. React + Vite + TypeScript + math.js engine.
Six platforms from one web bundle: iOS / iPadOS / Android (Capacitor), macOS / Windows / Linux (Tauri), Web (PWA fallback).

## Architecture

```
src/
  engine/index.ts       # math.js engine — basic + scientific (canonical evaluate contract)
  engine/programmer.ts  # BigInt programmer-mode evaluator (QWORD-exact)
  history/api.ts        # canonical history contract + platform picker (sync)
  history/sqlite.ts     # SQLite backend (Capacitor + Tauri), in-memory mirror
  native/platform.ts    # platform detection (web/ios/android/macos/...)
  native/keyboard.ts    # unified keyboard + Android back + lifecycle hooks
  units/engine.ts       # units + currency conversion (math.js + local rates)
  sync/                 # E2E-encrypted history sync (WebDAV + 坚果云; iCloud placeholder)
  i18n/                 # zh / en locale bundles
  state/useCalculator.ts # reducer + live/committed error model
  hooks/                # useSync / useTheme / useI18n / useKeyboardExtras
  components/           # UI: Keypad, Display, Programmer, Units, DateTime, SyncSettings, ...
  styles/tokens.css     # design tokens (light/dark + system-pref fallback)
  App.tsx               # shell UI + picker + keyboard routing
  main.tsx              # React bootstrap, awaits history hydration
```

## Locked contracts (do not change signatures)

**Engine** (`src/engine/index.ts`) — basic/scientific + programmer mode:
```ts
interface Engine {
  evaluate(expr: string, options?: {
    angle?: 'deg' | 'rad';
    radix?: 2 | 8 | 10 | 16;        // presence routes to the BigInt evaluator
    wordSize?: 8 | 16 | 32 | 64;
  }): { value: string; error?: string; errorCode?: string; radix?: RadixRepr };
  setAngleMode(mode: 'deg' | 'rad'): void;
  getAngleMode(): 'deg' | 'rad';
  setProgrammer(state: Partial<ProgrammerState>): void;
  getProgrammer(): ProgrammerState;
  toRadix(decimal: string, wordSize?: 8 | 16 | 32 | 64): RadixRepr;
}
export const engine: Engine;
```
`errorCode` (absent on success) is a stable code: `UNCLOSED / PAREN / MISSING_OPERAND / UNKNOWN_SYMBOL / NOT_FUNCTION / CONVERT / ENGINE` (basic/scientific) or `INVALID_DIGIT / DIV_ZERO / SYNTAX` (programmer). Programmer mode returns `radix` = all-radix reps (hex/dec/oct/bin, unpadded — UI pads to wordSize).

**History** (`src/history/api.ts`):
```ts
interface HistoryEntry { id: string; expression: string; result: string; timestamp: number; }
interface HistoryAPI {
  record(expression: string, result: string): HistoryEntry;
  list(): HistoryEntry[];
  clear(): void;
  replaceAll(entries: HistoryEntry[]): void;  // bulk replace preserving id+timestamp (sync merge)
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
