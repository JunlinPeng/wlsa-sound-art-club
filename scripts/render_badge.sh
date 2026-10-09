#!/usr/bin/env bash
#
# Render the WLSA Sound Art Club round badge (for plush-toy / patch printing).
#
# The canonical deliverable is `src/badge/badge.svg` — a self-contained vector
# (curved "WLSA SOUND ART CLUB" name + orange headphones icon). This script
# publishes a copy to the project root and renders a 1600 x 1600 px PNG preview.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

SRC="$ROOT/src/badge/badge.svg"
SVG_OUT="$ROOT/badge.svg"
OUT="$ROOT/badge.png"

SIZE=1600

# The vector badge is the source of truth; publish a copy to the project root.
cp "$SRC" "$SVG_OUT"

# --- Locate a Chromium-based browser -------------------------------------
CHROME=""
for c in \
  "/c/Program Files/Google/Chrome/Application/chrome.exe" \
  "/c/Program Files (x86)/Google/Chrome/Application/chrome.exe" \
  "/c/Program Files/Microsoft/Edge/Application/msedge.exe" \
  "/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
  "$HOME/AppData/Local/Google/Chrome/Application/chrome.exe"; do
  if [ -f "$c" ]; then CHROME="$c"; break; fi
done

if [ -z "$CHROME" ]; then
  echo "ERROR: no Chromium browser (Chrome/Edge) found." >&2
  echo "       Install one, or edit CHROME in $0." >&2
  exit 1
fi

if [ ! -f "$SRC" ]; then
  echo "ERROR: source design not found: $SRC" >&2
  exit 1
fi

# Build a file:// URL from the MSYS path (/d/WLSA/... -> file:///D:/WLSA/...).
DRIVE="${SRC:1:1}"
DRIVE="$(printf '%s' "$DRIVE" | tr 'a-z' 'A-Z')"
SRC_URL="file:///${DRIVE}:${SRC:2}"
SRC_URL="${SRC_URL// /%20}"

echo "Browser : $CHROME"
echo "Source  : $SRC"
echo "Rendering $OUT  (${SIZE}x${SIZE} px)..."

"$CHROME" \
  --headless=new \
  --disable-gpu \
  --hide-scrollbars \
  --window-size="${SIZE},${SIZE}" \
  --screenshot="$OUT" \
  "$SRC_URL"

echo "Done."
echo "  Badge PNG    : $OUT"
echo "  Vector source: $SVG_OUT"
