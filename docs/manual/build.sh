#!/usr/bin/env bash
# Builds the manual: screenshots of the app in English and German, then the HTML pages.
#
#   docs/manual/build.sh             # screenshots and pages (needs `npm run dev` in the repository root)
#   docs/manual/build.sh --pages     # only the pages; the screenshots stay
set -euo pipefail
cd "$(dirname "$0")"

[[ -d node_modules ]] || npm install
npx playwright install chromium >/dev/null

if [[ "${1:-}" != "--pages" ]]; then
  node tools/screenshots.mjs
fi
node tools/build.mjs
