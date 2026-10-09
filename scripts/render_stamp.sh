#!/usr/bin/env bash
#
# Render the WLSA Sound Art Club stamp (2 cm, headphones) to a PNG preview.
#
# The canonical deliverable is `src/stamp/stamp.svg` — a true vector SVG with a
# physical size of 20 mm (2 cm), ready for a stamp maker. This script renders a
# 1200 x 1200 px PNG preview from `src/stamp/stamp.html` for on-screen viewing.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

SRC="$ROOT/src/stamp/stamp.html"
OUT="$ROOT/stamp.png"
SVG_OUT="$ROOT/stamp.svg"

SIZE=1200

# The vector stamp is the source of truth; publish a copy to the project root
# so the deliverable sits alongside the other generated assets.
cp "$ROOT/src/stamp/stamp.svg" "$SVG_OUT"

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
  echo "ERROR: source page not found: $SRC" >&2
  exit 1
fi

# Build a file:// URL from the MSYS path (/d/WLSA/... -> file:///D:/WLSA/...).
DRIVE="${SRC:1:1}"
DRIVE="$(printf '%s' "$DRIVE" | tr 'a-z' 'A-Z')"
SRC_URL="file:///${DRIVE}:${SRC:2}"
SRC_URL="${SRC_URL// /%20}"

echo "Browser : $CHROME"
echo "Source  : $SRC"
echo "Rendering $OUT  (${SIZE}x${SIZE} px preview)..."

"$CHROME" \
  --headless=new \
  --disable-gpu \
  --hide-scrollbars \
  --window-size="${SIZE},${SIZE}" \
  --screenshot="$OUT" \
  "$SRC_URL"

echo "Done."
echo "  Stamp preview : $OUT"
echo "  (Vector source of truth: src/stamp/stamp.svg — 20 mm diameter)"
