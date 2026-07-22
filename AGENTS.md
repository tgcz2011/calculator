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

## Release process (project rule, 2026-07-22)

After every change — feature, fix, polish, even one-character typo — publish a GitHub release so the project owner can download and review. The canonical reference for the version scheme and tag-and-release workflow lives in [`RELEASING.md`](./RELEASING.md); this section is the entry point.

**One-shot (mainline release)**

```bash
./scripts/release.sh
```

The script reads `version` from `package.json`, refuses to run if the tag already exists (local or origin), runs `npm run build`, zips `dist/`, tags the commit, pushes the tag, and creates the GitHub release with the zip as the sole asset. See `RELEASING.md` §3 for the full procedure.

**Version scheme (4 segments)** — `大改版.小改版.重大问题修复.小问题修复` (`MAJOR.MINOR.HOTFIX.PATCH`). Every change gets its own bump in the right segment; segments to the right of the bumped one reset to 0. See `RELEASING.md` §1 for the full table and the "one change → one bump → one release" rule.

When in doubt: read the last tag (`git tag --sort=-v:refname | head -1`), open `RELEASING.md`, bump the right segment.
