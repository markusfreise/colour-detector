#!/usr/bin/env bash
# One-time setup on the markus-freise.de host (run there over SSH).
# Usage: bash bootstrap-server.sh /path/to/web-root/colour-detective
# Idempotent, fail-closed.
set -euo pipefail
SLUG="colour-detector"
WEB_ROOT="${1:?usage: bootstrap-server.sh <web-root>/colour-detective}"
REPO_DIR="$HOME/$SLUG"
REMOTE="${REMOTE:-https://github.com/markusfreise/$SLUG.git}"   # private repo: use a deploy key + SSH URL
LOG_FILE="$HOME/$SLUG-deploy.log"

for bin in git rsync php; do command -v "$bin" >/dev/null || { echo "✗ $bin missing"; exit 1; }; done
if [ -s "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh" >/dev/null; fi
command -v npm >/dev/null || { echo "✗ node/npm missing (install via nvm)"; exit 1; }
php -r 'exit(function_exists("exec") && !in_array("exec", array_map("trim", explode(",", ini_get("disable_functions")))) ? 0 : 1);' \
  || echo "! PHP exec() looks disabled for CLI – check it is enabled for the web PHP too"

if [ -d "$REPO_DIR/.git" ]; then echo "✓ checkout exists: $REPO_DIR"; else git clone --branch main "$REMOTE" "$REPO_DIR"; fi
mkdir -p "$WEB_ROOT"

if [ -f "$WEB_ROOT/webhook-config.php" ]; then
  echo "✓ webhook-config.php exists – not touching it"
  SECRET="(unchanged)"
else
  SECRET="$(openssl rand -hex 32)"
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

✓ Deployed to $WEB_ROOT

Now add the webhook on GitHub (repo → Settings → Webhooks → Add webhook):
  Payload URL:   https://markus-freise.de/colour-detective/webhook.php
  Content type:  application/json
  Secret:        $SECRET
  Events:        Just the push event
INFO
