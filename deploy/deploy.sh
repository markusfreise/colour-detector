#!/usr/bin/env bash
# Pull, build and publish Watercolourlove on the public host (Mittwald).
# Usage: deploy.sh <repo_dir> <web_root> [branch]
# Started by webhook.php on a push to main; can also be run by hand over SSH.
#
# The checkout lives outside the web root. It is built there and only the finished build is copied
# into the web root, so a failed build leaves the live site as it was. The web root keeps what
# belongs to the server: .htaccess, the webhook and its config, the API's config.php.
# The build settings are in <repo_dir>/.env.production.local (not in the repo); it must set
# VITE_ACCOUNT_API, else the deploy stops.
set -euo pipefail

REPO_DIR="${1:?repo dir missing}"
WEB_ROOT="${2:?web root missing}"
BRANCH="${3:-main}"

# Shared hosts often keep node outside the default PATH (e.g. via nvm).
export PATH="$HOME/.nvm/current/bin:$HOME/bin:/usr/local/bin:$PATH"
if [ -s "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh" >/dev/null; fi

exec 9>"$REPO_DIR/.deploy.lock"
if ! flock -n 9; then
  echo "$(date -Is) another deploy is running - skipped"
  exit 0
fi

echo "=== $(date -Is) deploy $BRANCH ==="
cd "$REPO_DIR"
# The public host has accounts: a build without them opens the app to anybody with nothing locked.
grep -qE '^VITE_ACCOUNT_API=.+' .env.production.local 2>/dev/null || { echo "FAILED: no VITE_ACCOUNT_API in $REPO_DIR/.env.production.local - the app would open without signing in, nothing locked"; exit 1; }
git fetch --prune origin "$BRANCH"
git reset --hard "origin/$BRANCH"
echo "commit: $(git rev-parse --short HEAD) $(git log -1 --pretty=%s)"

npm ci --no-audit --no-fund --silent
npm test --silent 2>&1 | grep -E "Tests|FAIL" || true
npm run build --silent

# Publish: replace the web root contents, but keep the server's own files.
rsync -a --delete \
  --exclude '.htaccess' \
  --exclude 'webhook.php' \
  --exclude 'webhook-config.php' \
  --exclude 'api/' \
  dist/ "$WEB_ROOT/"
# The account API next to the app; its configuration stays on the server.
# The app itself (dist/api/app/) is not a public file: the account API sends it to signed-in
# users only, from api/bundle/.
mkdir -p "$WEB_ROOT/api"
rsync -a --delete --exclude 'config.php' --exclude 'README.md' --exclude 'tests/' --exclude 'bundle/' server/ "$WEB_ROOT/api/"
rsync -a --delete dist/api/app/ "$WEB_ROOT/api/bundle/"
cp deploy/webhook.php "$WEB_ROOT/webhook.php"

echo "=== $(date -Is) done ==="
