# AGENTS.md - Calculator repo

## Spec & development rules (mandatory)

- **Read `spec.md` before starting any work.** It is the single source of truth for every feature / requirement / improvement spec in this project, including the pitfall list (things already hit and fixed - do not re-hit them).
- **Record every new spec in `spec.md`.** Any new feature, requirement, or improvement must get an entry (feature spec under §2, pitfall under §3, constraint under §4) before or alongside its PR.
- Purpose: avoid solving the same problem twice and avoid wasted effort. This rule is project-owner-mandated.

## Build commands (run from repo root)

- `npm install` - install deps
- `npm run dev` - Vite dev server (web, http://localhost:5173)
- `npm run typecheck` - tsc, must be 0 errors
- `npm run smoke` - contract smoke test (engine + history, no framework, tsx)
- `npm run build` - tsc + vite build -> dist/
- `npm run preview` - serve built dist/
- `npm run e2e` - Playwright e2e (4 device projects: iPhone 13, Pixel 7, iPad gen 7, Desktop Chrome)
- `npm run e2e:install` - one-time Playwright browser install (required before first `npm run e2e`)

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
- History: `src/history/api.ts` - `record`, `list`, `clear`, `replaceAll` (sync), `initHistory()` (await at boot). `replaceAll` preserves each entry's id + timestamp (used by sync merge — `record` mints fresh ids and would break CRDT dedup).

Minimax-M3 owns UI (`src/App.tsx`, `src/components/`, `src/styles/`).
General owns scaffold + engine + history backends + native + build pipeline.

## UX / i18n / theme conventions

See [UX-GUIDELINES.md](./UX-GUIDELINES.md) for the canonical reference on:
- Design tokens (color / spacing / radius / motion)
- Display vs. keypad contrast (Apple aesthetic)
- Touch target sizing (44px minimum, compact keys 48-60px)
- Long-press pointer-event pattern (no `onDoubleClick`)
- Sticky last-good live result + deferred error semantics
- i18n rules (all visible text + aria-labels go through `t()`)
- Theme switching + `<meta name="theme-color">` sync for PWA splash
- Compositing-layer gotcha (avoid `opacity < 1` over interactive elements)
- Locale-aware e2e selectors (`getByTestId` preferred; `getByRole` needs zh name)

## Tauri Rust check

```
cd src-tauri && cargo check
```
Verifies Rust + plugin-sql registration compiles. Icons only needed for `tauri build` (release), not `cargo check`.

## CocoaPods (iOS)

If `pod` not installed: `sudo gem install cocoapods`. Required before `npx cap add ios`.

## Release process (project rule, 2026-07-18)

After every feature is fully done (merged to main + tested), publish a GitHub release so the project owner can download and review. Versioning is strict SemVer in `package.json`; tags MUST be unique — the release script refuses to run if the tag already exists (local or origin).

**One-shot**

```bash
./scripts/release.sh
```

What it does:
1. Reads `version` from `package.json` (e.g. `0.2.0`)
2. Refuses to run unless we're on `main`, working tree is clean, and HEAD == `origin/main`
3. Refuses to run if `v<version>` already exists locally or on `origin` (no-repeat guarantee)
4. Runs `npm run build` (typecheck + vite → `dist/`)
5. Zips `dist/` → `calculator-v<version>.zip`
6. `git tag -a v<version>` + `git push origin v<version>`
7. `gh release create v<version> calculator-v<version>.zip` with default notes

**How to bump**

1. Branch off main, edit `package.json` `version` (only that field), commit, open PR, squash-merge to main
2. After merge, on main: `./scripts/release.sh`
3. Verify green: `gh workflow run feature-complete.yml` (per the always-run rule)

**Versioning cheat sheet**

- `0.1.0 -> 0.2.0` — new feature closed (P1 milestone)
- `0.2.0 -> 0.2.1` — engine contract patches, smoke fixes, e2e cleanup (no user-visible behavior change)
- `0.2.x -> 0.3.0` — next feature batch closed
- `0.x.y -> 1.0.0` — first "production-ready" cut (engine contracts declared stable)

`engine`, `history`, and `sync` are public contracts — touching their signatures is a minor bump at minimum.

When in doubt: read the last tag, add a feature/fix, bump the right SemVer digit.
