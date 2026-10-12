#!/bin/bash
# usage: run.sh <repo path> <out dir>   renders the test photos with that checkout's library and measures them
# The photos are prepared once with: python3 photos.py <repo path>
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
[ -d "$HERE/photos" ] || python3 "$HERE/photos.py" "$1"
node "$HERE/render.mjs" "$1" "$2"
python3 "$HERE/sheets.py" "$2"
