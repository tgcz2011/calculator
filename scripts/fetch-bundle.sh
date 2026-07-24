#!/usr/bin/env bash
# ponytail (TGC-29): the GeoGebra GWT bundle (~27MB after optimization) is
# gitignored under public/geogebra/ — it's a build artifact owned by
# General(high)'s branch (agent/general-high/c00e61fe), not by this repo.
# Vite copies `public/` into `dist/` at build time, so the bundle MUST
# be present in the working tree BEFORE `npm run build` for it to land
# in any artifact (web zip, Tauri bundle, Capacitor assets). Without
# this script, native builds (Tauri macOS/Windows/Linux, Capacitor
# iOS/Android) ran on a tree without the bundle and produced artifacts
# where GeoGebra's `/geogebra/deployggb.js` 404s at runtime — TGC-29
# native regression.
#
# This script is the single source of truth for "how do we get the
# bundle into the tree". Called by build.sh (every target) and
# release.sh (mainline tag) so the bundle is baked in consistently.
#
# Contract:
#  - Reads BUNDLE_BRANCH (default: origin/agent/general-high/c00e61fe)
#    and BUNDLE_TARGET (default: public/geogebra). Resolves them
#    from env or git, fetches origin, replaces the existing
#    public/geogebra/ with the branch's tracked content. After this
#    script returns, public/geogebra/ is exactly what the source
#    branch tracks — no stale draft .cache.js, no orphan lang files.
#  - Refuses to run outside a git repo, refuses if origin isn't
#    reachable (no silent partial state). On success prints a
#    one-line summary (file count + total size) so the calling build
#    log has proof the bundle landed.
#  - Captures the bundle SHA + file count + size to
#    .geogebra-bundle.sha (repo root, gitignored — survives vite
#    wiping dist/). build.sh's post-build step copies this into
#    dist/BUNDLE_SHA.txt so the released artifact self-documents
#    which bundle commit shipped.
#  - Safe to re-run. Safe to run when public/geogebra/ doesn't yet
#    exist (creates it).
set -euo pipefail

BUNDLE_BRANCH="${BUNDLE_BRANCH:-origin/agent/general-high/c00e61fe}"
BUNDLE_TARGET="${BUNDLE_TARGET:-public/geogebra}"
SHA_STAMP="${SHA_STAMP:-.geogebra-bundle.sha}"

# Resolve repo root from this script's location so it works whether
# called from build.sh, release.sh, or a one-off shell.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "error: fetch-bundle.sh must run inside the calculator git repo" >&2
  exit 1
fi

# 1. Verify origin is reachable so we don't half-overwrite on network
#    failure. `git ls-remote --heads origin` is cheap and surfaces
#    auth/network errors immediately.
if ! git ls-remote --heads origin "${BUNDLE_BRANCH#origin/}" >/dev/null 2>&1; then
  echo "error: cannot reach '${BUNDLE_BRANCH}' on origin — refusing to clobber local ${BUNDLE_TARGET}/" >&2
  exit 1
fi

# 2. Make sure origin/<branch> exists locally. `git fetch origin
#    <branch>` is the narrow form (faster than a full fetch) and
#    updates the remote-tracking ref without touching working tree.
git fetch origin "${BUNDLE_BRANCH#origin/}" >/dev/null

# 3. Resolve the actual SHA so the caller can stamp it.
BUNDLE_SHA="$(git rev-parse "${BUNDLE_BRANCH}")"

# 4. Verify the bundle commit actually has a public/geogebra/ tree
#    (catches "branch moved / wrong ref" before we wipe the local
#    dir). exit code 1 if the path doesn't exist on that ref.
if ! git cat-file -e "${BUNDLE_SHA}:${BUNDLE_TARGET}" 2>/dev/null; then
  echo "error: ${BUNDLE_BRANCH} (${BUNDLE_SHA}) has no ${BUNDLE_TARGET} path — refusing" >&2
  exit 1
fi

# 5. Atomic replace. `git checkout <ref> -- <path>` only writes the
#    files tracked by <ref>; it does NOT delete files in the
#    destination that aren't on <ref>. Since this script's whole
#    point is "the working tree's public/geogebra/ must be exactly
#    what's on the bundle branch", we wipe the dir first so stale
#    files from a previous bundle SHA (e.g. old draft .cache.js,
#    pruned lang files) don't survive. Critically, public/geogebra/
#    is gitignored — wiping it doesn't touch any tracked file.
if [ -d "${BUNDLE_TARGET}" ]; then
  rm -rf "${BUNDLE_TARGET}"
fi
mkdir -p "${BUNDLE_TARGET}"

# git checkout writes tracked files into the destination tree.
git checkout "${BUNDLE_SHA}" -- "${BUNDLE_TARGET}"

# 6. Sanity check + summary. Count files + total bytes so the build
#   log has hard evidence the bundle landed.
FILE_COUNT="$(find "${BUNDLE_TARGET}" -type f | wc -l | tr -d ' ')"
TOTAL_SIZE="$(du -sh "${BUNDLE_TARGET}" | awk '{print $1}')"

# 7. Drop the SHA stamp at the repo root (gitignored — see
#    .gitignore). build.sh's post-build step copies this into
#    dist/BUNDLE_SHA.txt so the released artifact self-documents
#    which bundle commit shipped. Atomic write: temp + mv.
TMP_SHA="$(mktemp "${SHA_STAMP}.XXXXXX")"
printf 'geogebra_bundle_branch=%s\ngeogebra_bundle_sha=%s\nfile_count=%s\ntotal_size=%s\n' \
  "${BUNDLE_BRANCH}" "${BUNDLE_SHA}" "${FILE_COUNT}" "${TOTAL_SIZE}" > "${TMP_SHA}"
mv "${TMP_SHA}" "${SHA_STAMP}"

echo ">> fetch-bundle: ${BUNDLE_BRANCH}@${BUNDLE_SHA:0:12} -> ${BUNDLE_TARGET}/ (${FILE_COUNT} files, ${TOTAL_SIZE})"
echo ">> fetch-bundle: stamp -> ${SHA_STAMP}"