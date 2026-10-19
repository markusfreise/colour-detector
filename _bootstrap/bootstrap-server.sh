#!/usr/bin/env bash
# One-time setup on the public host (Mittwald), run there over SSH once the checkout exists.
# The checkout is the one this script lives in.
# Usage: bash bootstrap-server.sh <web-root> [public-url]
#   e.g. bash ~/html/_sites/colour-detector/_bootstrap/bootstrap-server.sh ~/html/_sites/watercolourlove https://watercolourlove.de
# Idempotent, fail-closed: writes webhook-config.php only if it is missing, then runs the first deploy.
set -euo pipefail
SLUG="colour-detector"
WEB_ROOT="${1:?usage: bootstrap-server.sh <web-root> [public-url]}"
URL="${2:-https://watercolourlove.de}"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_FILE="$HOME/$SLUG-deploy.log"

for bin in git rsync php flock; do command -v "$bin" >/dev/null || { echo "FAILED: $bin missing"; exit 1; }; done
if [ -s "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh" >/dev/null; fi
command -v npm >/dev/null || { echo "FAILED: node/npm missing (install via nvm)"; exit 1; }
php -r 'exit(function_exists("exec") && !in_array("exec", array_map("trim", explode(",", ini_get("disable_functions")))) ? 0 : 1);' \
  || echo "Achtung: PHP exec() looks disabled for CLI - check it is enabled for the web PHP too"

[ -d "$REPO_DIR/.git" ] || { echo "FAILED: no checkout at $REPO_DIR - clone the repo there first (deploy key, branch main)"; exit 1; }
[ -d "$WEB_ROOT" ] || { echo "FAILED: web root $WEB_ROOT does not exist"; exit 1; }
grep -qE '^VITE_ACCOUNT_API=.+' "$REPO_DIR/.env.production.local" 2>/dev/null \
  || { echo "FAILED: $REPO_DIR/.env.production.local must set VITE_ACCOUNT_API (and VITE_GA_ID if wanted)"; exit 1; }

if [ -f "$WEB_ROOT/webhook-config.php" ]; then
  echo "OK: webhook-config.php exists - not touching it"
  SECRET="(unchanged, see $WEB_ROOT/webhook-config.php)"
else
  SECRET="$(php -r 'echo bin2hex(random_bytes(32));')"
  cat > "$WEB_ROOT/webhook-config.php" <<PHP
<?php
return [
    'secret'   => '$SECRET',
    'repo_dir' => '$REPO_DIR',
    'branch'   => 'main',
    'log_file' => '$LOG_FILE',
];
PHP
  chmod 640 "$WEB_ROOT/webhook-config.php"
fi

bash "$REPO_DIR/deploy/deploy.sh" "$REPO_DIR" "$WEB_ROOT" main | tee -a "$LOG_FILE"

cat <<INFO

OK: deployed to $WEB_ROOT

Now add the webhook on GitHub (repo -> Settings -> Webhooks -> Add webhook):
  Payload URL:   $URL/webhook.php
  Content type:  application/json
  Secret:        $SECRET
  Events:        Just the push event
INFO
