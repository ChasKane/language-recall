#!/bin/bash
set -euo pipefail

### Release helper: bumps versions, builds, commits, tags, and pushes.
### Pushing the tag (lines 29-30) triggers .github/workflows/release.yml, which
### builds main.js/styles.css in CI, attests artifacts, and publishes the GitHub release.
###
### Usage: ./release.sh <version> ["optional release notes"]

TAG="${1:?Usage: ./release.sh <version> [release notes]}"
NOTES="${2:-Release $TAG}"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Working tree is not clean. Commit or stash changes before releasing."
  exit 1
fi

# Sync package.json, manifest.json, and versions.json to TAG.
npm pkg set version="$TAG"
npm_package_version="$TAG" node version-bump.mjs

pnpm build
git add -A
git commit -m "version bump: $TAG; $NOTES" || true
git tag "$TAG"
git push origin HEAD
git push origin "$TAG"
