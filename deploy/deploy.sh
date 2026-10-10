#!/usr/bin/env bash
# Pull, build and publish Colour Detector.
# Usage: deploy.sh <repo_dir> <web_root> [branch]
# Started by webhook.php; can also be run by hand over SSH.
set -euo pipefail

REPO_DIR="${1:?repo dir missing}"
WEB_ROOT="${2:?web root missing}"
BRANCH="${3:-main}"

# Shared hosts often keep node outside the default PATH (e.g. via nvm).
export PATH="$HOME/.nvm/current/bin:$HOME/bin:/usr/local/bin:$PATH"
if [ -s "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh" >/dev/null; fi

exec 9>"$REPO_DIR/.deploy.lock"
if ! flock -n 9; then
  echo "$(date -Is) another deploy is running – skipping"
  exit 0
fi

echo "=== $(date -Is) deploy $BRANCH ==="
cd "$REPO_DIR"
git fetch --prune origin "$BRANCH"
git reset --hard "origin/$BRANCH"
echo "commit: $(git rev-parse --short HEAD) $(git log -1 --pretty=%s)"

npm ci --no-audit --no-fund
npm run build

# Publish: replace the web root contents, but keep the webhook and its config.
rsync -a --delete \
  --exclude 'webhook.php' \
  --exclude 'webhook-config.php' \
  dist/ "$WEB_ROOT/"
cp deploy/webhook.php "$WEB_ROOT/webhook.php"

echo "=== $(date -Is) done ==="
