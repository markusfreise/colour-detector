#!/usr/bin/env bash
# Local setup on the Mac. Idempotent, fail-closed: existing things are skipped, errors abort.
set -euo pipefail
SLUG="colour-detector"
REMOTE="git@github.com:markusfreise/${SLUG}.git"
TARGET="$HOME/Sites/$SLUG"
ASSETS="$HOME/Library/CloudStorage/Dropbox-Personal/Coding/$SLUG"

if [ -d "$TARGET/.git" ]; then
  echo "✓ repo already at $TARGET"
else
  git clone "$REMOTE" "$TARGET"
fi
cd "$TARGET"
git fetch origin
if git show-ref --verify --quiet refs/heads/develop; then
  echo "✓ develop exists locally"
elif git ls-remote --exit-code --heads origin develop >/dev/null; then
  git checkout -b develop origin/develop
else
  git checkout -b develop
  git push -u origin develop
fi
git checkout develop

mkdir -p "$ASSETS"
if [ -L _project-assets ]; then echo "✓ _project-assets symlink exists"; else ln -s "$ASSETS" _project-assets; fi

npm install
npm test
echo
echo "Ready:  cd $TARGET && npm run dev   →  http://localhost:5173"
