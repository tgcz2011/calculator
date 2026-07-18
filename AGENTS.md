# AGENTS.md - Calculator repo

## Build commands (run from repo root)

- `npm install` - install deps
- `npm run dev` - Vite dev server (web, http://localhost:5173)
- `npm run typecheck` - tsc, must be 0 errors
- `npm run smoke` - contract smoke test (engine + history, no framework, tsx)
- `npm run build` - tsc + vite build -> dist/
- `npm run preview` - serve built dist/

## Native build

- `./scripts/build.sh check` - fast web verification
- `./scripts/build.sh web` - PWA bundle
- `./scripts/build.sh ios` - Capacitor iOS/iPadOS (needs Xcode + CocoaPods)
- `./scripts/build.sh android` - Capacitor Android (needs Android Studio)
- `./scripts/build.sh macos` - Tauri macOS (needs Rust)
- `npx tauri dev` / `npx tauri build` - Tauri desktop
- `npx cap add ios` / `npx cap add android` - generate native projects (one-time)

## Locked contracts (do NOT change signatures)

- Engine: `src/engine/index.ts` - `evaluate(expr, options?)`, `setAngleMode`, `getAngleMode`
- History: `src/history/api.ts` - `record`, `list`, `clear` (sync), `initHistory()` (await at boot)

Minimax-M3 owns UI (`src/App.tsx`, `src/components/`, `src/modes/`, `src/styles/`).
General owns scaffold + engine + history backends + native + build pipeline.

## Tauri Rust check

```
cd src-tauri && cargo check
```
Verifies Rust + plugin-sql registration compiles. Icons only needed for `tauri build` (release), not `cargo check`.

## CocoaPods (iOS)

If `pod` not installed: `sudo gem install cocoapods`. Required before `npx cap add ios`.
