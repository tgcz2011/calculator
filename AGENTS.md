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

- Engine: `src/engine/index.ts` - `evaluate(expr, options?)`, `setAngleMode`, `getAngleMode`, `setProgrammer`, `getProgrammer`, `toRadix`
  - Basic/scientific: `evaluate(expr, { angle })` -> `{ value, error?, errorCode? }`
  - Programmer (P1): `evaluate(expr, { radix, wordSize })` -> `{ value, error?, errorCode?, radix? }`. Presence of `radix`/`wordSize` routes to the BigInt evaluator (QWORD-exact). `radix` = input radix for bare literals (2/8/10/16); `wordSize` = 8/16/32/64. `value` = result in input radix (signed for dec); `radix` = `{ hex, dec, oct, bin }` all-radix reps (unpadded - UI pads). Operators: `+ - * / % & | ^ ~ << >> >>>` (C precedence; `/` = signed integer division truncating toward zero; `>>` arithmetic, `>>>` logical). Error codes: `INVALID_DIGIT` / `DIV_ZERO` / `SYNTAX` / `PAREN` / `MISSING_OPERAND` (plus the basic/scientific codes).
  - `toRadix(decimal, wordSize?)` = pure conversion of a decimal string to all-radix reps (for UI radix switch without re-eval).
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
