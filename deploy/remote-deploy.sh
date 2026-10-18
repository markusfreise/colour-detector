#!/usr/bin/env bash
# Builds what is pushed to GitHub and publishes it to the public host. Runs on batcave (LXC 114),
# started by the deploy webhook; nothing of the working checkout there is used, only its origin.
#
# Usage: remote-deploy.sh <checkout>
# Settings in /etc/watercolourlove/deploy.env (not in the repo):
#   BRANCH=feature/TASK-24-native-app      what to deploy
#   TARGET=user@host:/path/to/web-root/    rsync target, with a slash at the end
#   SSH_KEY=/root/.ssh/id_ed25519_...      key for that host
#   BUILD_ENV=/etc/watercolourlove/build.env   optional, becomes .env.production.local (e.g. VITE_ACCOUNT_API=api)
set -euo pipefail

CHECKOUT="${1:?checkout missing}"
# shellcheck disable=SC1091
. /etc/watercolourlove/deploy.env
: "${BRANCH:?BRANCH missing in deploy.env}" "${TARGET:?TARGET missing in deploy.env}" "${SSH_KEY:?SSH_KEY missing in deploy.env}"
BUILD=/var/tmp/watercolourlove-build

exec 9>/var/tmp/watercolourlove-deploy.lock
if ! flock -n 9; then
  echo "$(date -Is) another deploy is running - skipped"
  exit 0
fi

echo "=== $(date -Is) deploy $BRANCH ==="
[ -f "$SSH_KEY" ] || { echo "FAILED: the key $SSH_KEY is missing"; exit 1; }
git -C "$CHECKOUT" fetch --quiet origin "$BRANCH"
echo "commit: $(git -C "$CHECKOUT" log -1 --pretty='%h %s' "origin/$BRANCH")"
rm -rf "$BUILD"
mkdir -p "$BUILD"
git -C "$CHECKOUT" archive "origin/$BRANCH" | tar -x -C "$BUILD"
cd "$BUILD"
[ -z "${BUILD_ENV:-}" ] || cp "$BUILD_ENV" .env.production.local
npm ci --no-audit --no-fund --silent
npm test --silent 2>&1 | grep -E "Tests|FAIL" || true
npm run build --silent

SSH="ssh -i $SSH_KEY -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new"
# The build replaces the web root; the server's own files there stay (.htaccess, the API's config).
rsync -a --delete -e "$SSH" --exclude '.htaccess' --exclude 'api/' dist/ "$TARGET"
rsync -a --delete -e "$SSH" --exclude 'config.php' --exclude 'README.md' --exclude 'tests/' server/ "${TARGET}api/"
rm -rf "$BUILD"
echo "=== $(date -Is) done ==="
