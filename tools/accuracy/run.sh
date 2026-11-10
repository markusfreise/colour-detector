#!/bin/bash
# usage: run.sh <repo path> <out dir>   measures how true the flat pictures of that checkout are to the photos
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
[ -d "$HERE/photos" ] || python3 "$HERE/photos.py" "$1"
node "$HERE/render.mjs" "$1" "$2"
python3 "$HERE/sheets.py" "$2"
