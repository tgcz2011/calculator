# Releasing the Calculator app

> **Owner rule (2026-07-22, project owner message).** Every change — feature, fix, polish, even one-character typo — gets its own GitHub release. The version scheme is four-segment: **`大改版.小改版.重大问题修复.小问题修复`**. This file is the canonical source for the convention; `AGENTS.md` and `spec.md` reference back to it.

## 1. Version scheme (4 segments)

```
MAJOR . MINOR . HOTFIX . PATCH
大改版 . 小改版 . 重大问题修复 . 小问题修复
```

| Segment | English | Chinese | Bump when… | Examples |
|---|---|---|---|---|
| 1st | MAJOR | 大改版 | breaking change, milestone, full UI rewrite, engine/history/sync contract removed or rewritten | TGC-23 deletes the top TabBar (was a major navigation change) |
| 2nd | MINOR | 小改版 | new feature, new mode, new picker tile, new option in existing flow | adding the Loan calculator tile |
| 3rd | HOTFIX | 重大问题修复 | critical bug affecting many users or producing wrong output (silent miscalculation, sync data loss, orientation lock that bricks the app) | a crash on cold-start, a sync blob that overwrites with stale data |
| 4th | PATCH | 小问题修复 | small bug, typo, i18n string, copy tweak, e2e flake that's actually a real race | an aria-label that screen readers mispronounce |

Every segment starts at 0. When you bump one segment, **all segments to its right reset to 0**:

- `0.0.0.3` → `0.0.0.4` (small bug fix)
- `0.0.0.3` → `0.0.1.0` (hot bug fix; PATCH resets to 0)
- `0.0.0.3` → `0.1.0.0` (new feature; HOTFIX and PATCH reset)
- `0.0.0.3` → `1.0.0.0` (breaking change; everything resets)

**One change → one bump → one release.** Do not bundle unrelated fixes into the same version bump. If two PRs land close together, tag them separately (`0.0.0.4` then `0.0.0.5`) so each commit maps to exactly one release and rollback is per-change.

## 2. Pre-release checklist

Before tagging, every release must satisfy:

1. **`npm run typecheck`** — `tsc --noEmit` with 0 errors.
2. **`npm run smoke`** — `scripts/smoke.ts` covers engine + history + tax + loan + kin + currency; 225+ assertions must pass.
3. **`npm run build`** — vite build → `dist/`.
4. **`npx playwright test`** — 4 projects (iPhone 13 / Pixel 7 / iPad gen7 / Desktop Chrome) must be green. Use `npm run e2e:install` once before the first run on a fresh machine.
5. **`git status`** clean, `HEAD` on the branch you're tagging, no uncommitted changes.

If any of those fail, fix the issue and rerun. **Do not release a broken state** — the GitHub release artifact is what the project owner downloads to review every feature closure (`unzip && open dist/index.html`).

## 3. Tag + release procedure

The repo ships with `scripts/release.sh` for the standard mainline flow. It reads `version` from `package.json`, refuses to run if the tag already exists (local or origin), builds `dist/`, zips it, tags, pushes the tag, and creates the GitHub release with the zip as the sole asset.

### 3a. Standard mainline release

```bash
# 1. On main, working tree clean, HEAD == origin/main.
git checkout main
git pull --ff-only

# 2. Bump version in package.json (one segment only — see §1).
$EDITOR package.json   # change "version": "0.0.0.3" -> "0.0.0.4"

# 3. Commit the bump on its own (no other changes bundled in).
git add package.json
git commit -m "chore(release): bump version to 0.0.0.4"
git push origin main

# 4. Run the one-shot script. It refuses if the tag exists or the
#    working tree is dirty — fail-fast guard, not a workflow step.
./scripts/release.sh
```

The script prints the new tag, the zip filename, and the `gh release create` output (which contains the GitHub URL).

### 3b. Feature-branch pre-release (opt-in)

If a feature lands on a non-`main` branch and the owner wants a downloadable artifact before merge (e.g. for a UI review on device), tag that branch directly. This bypasses the script's `must be on main` guard:

```bash
# On the feature branch, working tree clean, build + zip first.
npm run build
git tag -a "v0.1.0.0-rc1" -m "Release candidate v0.1.0.0-rc1 (feature branch)"
git push origin "v0.1.0.0-rc1"
gh release create "v0.1.0.0-rc1" \
  --target "$(git rev-parse HEAD)" \
  --title "v0.1.0.0-rc1" \
  --prerelease \
  --notes "Pre-release from feature branch …" \
  "./calculator-v0.1.0.0-rc1.zip"
```

Pre-releases must use a tag with `-rcN`, `-betaN`, or `-alphaN` suffix (SemVer-compatible). Don't tag a feature branch with the bare version number — that would block the post-merge mainline tag of the same version.

## 4. Why one change per release

- **Rollback granularity.** If `0.0.0.5` ships a regression, the owner can pinpoint the offending commit from the tag → commit → PR chain, revert that single PR, and tag `0.0.0.6` with the revert.
- **Audit clarity.** Every release is one PR. The diff between any two versions is exactly the changes in that PR. No "what's in 0.1.0.0?" archaeology.
- **Download size.** Each zip is one focused change. Owners reviewing closure of an issue download one zip, not a grab-bag of 12 features.
- **Script simplicity.** `scripts/release.sh` reads `package.json`, refuses to run if the tag exists, builds, zips, tags, creates. One version → one tag → one shot. No list of changes to enumerate in release notes (the commit log already has them).

## 5. Engine / history / sync contract changes

Locked contracts in `AGENTS.md` (`src/engine/index.ts`, `src/history/api.ts`, `src/sync/`) **never** silently change:

- **Adding** a parameter (backwards compatible) → MINOR bump (2nd segment).
- **Removing** a parameter or changing the return shape → MAJOR bump (1st segment).
- **Fixing** wrong-output behavior without changing the signature → HOTFIX (3rd segment).
- **Renaming** a field → MAJOR bump.

The same rule applies to `src/components/CalculatorPicker.tsx`'s `CalculatorTileDef` shape, the i18n key namespace, and the e2e `testId` contract (changing a `data-testid` breaks the public e2e contract — MAJOR).