#!/usr/bin/env bash
#
# Render the CCA Fair booth cards (game card + pitch card) to 300-dpi PNGs.
#
#   game-card.html  -> game-card.png   (A5 portrait, 148 x 210 mm)
#   pitch-card.html -> pitch-card.png  (A6 portrait, 105 x 148 mm)
#
# Authored on logical px canvases (A5/A6 at 96 dpi) and rasterized with a
# device scale factor of 3.125 (300 / 96) to reach 300 dpi.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

FAIR="$ROOT/src/fair"
SCALE=3.125

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
  exit 1
fi

# Build a file:// URL from an MSYS path (/d/WLSA/... -> file:///D:/WLSA/...).
url_for() {
  local p="$1"
  local drive="${p:1:1}"
  drive="$(printf '%s' "$drive" | tr 'a-z' 'A-Z')"
  local u="file:///${drive}:${p:2}"
  echo "${u// /%20}"
}

render() {
  local html="$1" out="$2" w="$3" h="$4"
  if [ ! -f "$html" ]; then
    echo "ERROR: source page not found: $html" >&2
    exit 1
  fi
  echo "Rendering $out  (${w}x${h} logical x $SCALE)..."
  "$CHROME" \
    --headless=new \
    --disable-gpu \
    --hide-scrollbars \
    --force-device-scale-factor="$SCALE" \
    --window-size="${w},${h}" \
    --screenshot="$out" \
    "$(url_for "$html")"
}

echo "Browser : $CHROME"

# A5 portrait (148 x 210 mm) logical @ 96 dpi = 559 x 794
render "$FAIR/game-card.html"  "$ROOT/game-card.png"  559 794
# A6 portrait (105 x 148 mm) logical @ 96 dpi = 397 x 559
render "$FAIR/pitch-card.html" "$ROOT/pitch-card.png" 397 559

echo "Done."
echo "  Game card  : $ROOT/game-card.png"
echo "  Pitch card : $ROOT/pitch-card.png"
