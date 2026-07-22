#!/usr/bin/env bash
# ponytail: tag-and-release script. Reads version from package.json, refuses to
# run if tag already exists (no-repeat guarantee), runs the canonical build,
# zips dist/, pushes the tag, and creates the GitHub release with the zip as
# the sole artifact. The owner can download the zip and open index.html to
# review the effect of every feature closure without spinning up a dev server.
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=$(node -p "require('./package.json').version")
TAG="v${VERSION}"
ARTIFACT="calculator-${TAG}.zip"

# State checks. All errors exit before any side effect (no tag, no push, no
# release half-created). The branch check keeps releases on mainline only; if
# we ever need pre-releases, fork this script rather than relaxing it.
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" != "main" ]; then
  echo "error: must be on main (got $BRANCH)" >&2
  exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "error: working tree not clean:" >&2
  git status --short >&2
  exit 1
fi
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  echo "error: HEAD != origin/main; pull first" >&2
  exit 1
fi
if git rev-parse --verify --quiet "refs/tags/${TAG}" >/dev/null; then
  echo "error: tag ${TAG} already exists locally — bump package.json version first" >&2
  exit 1
fi
if git ls-remote --tags origin "${TAG}" 2>/dev/null | grep -q "refs/tags/${TAG}"; then
  echo "error: tag ${TAG} already exists on origin — bump package.json version first" >&2
  exit 1
fi

echo ">> building web PWA (dist/) — version ${VERSION}"
npm run build

echo ">> zipping dist/ -> ${ARTIFACT}"
(cd dist && zip -qr "../${ARTIFACT}" .)

echo ">> tagging ${TAG}"
git tag -a "${TAG}" -m "Release ${TAG}"
git push origin "${TAG}"

echo ">> creating GitHub release with ${ARTIFACT}"
gh release create "${TAG}" \
  --target "$(git rev-parse HEAD)" \
  --title "${TAG}" \
  --notes "Release ${TAG} — Apple-style calculator (Web PWA + iOS/Android/desktop native shells).

- 4-segment version scheme (MAJOR.MINOR.HOTFIX.PATCH); see RELEASING.md.
- Built artifact: ${ARTIFACT} — unzip and open dist/index.html in any modern browser, or sideload via the per-platform builds when available.

See commit log since the previous tag for the full diff." \
  "./${ARTIFACT}"

echo ">> done: ${TAG} (${ARTIFACT})"
