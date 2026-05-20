#!/bin/bash
set -euo pipefail

### Push a version tag to trigger the GitHub Actions release workflow.
### The workflow builds main.js/styles.css in CI, attests artifacts, and publishes the release.
###
### Before tagging, update version in:
# manifest.json
# versions.json
# package.json

TAG="${1:?Usage: ./release.sh <version>}"
NOTES="${2:-Release $TAG}"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Working tree is not clean. Commit or stash changes before releasing."
  exit 1
fi

pnpm build
git add -A
git commit -m "version bump: $TAG; $NOTES" || true
git tag "$TAG"
git push origin HEAD
git push origin "$TAG"