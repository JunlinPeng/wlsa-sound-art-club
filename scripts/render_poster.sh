#!/usr/bin/env bash
#
# Render the WLSA Sound Art Club recruitment poster to a 300-dpi A2 PNG.
#
# The design lives on a logical 1587 x 2245 px canvas (A2 at 96 dpi).
# We rasterize with a device scale factor of 3.125 (300 / 96) so the output
# lands at 4961 x 7016 px — A2 at 300 dpi.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

SRC="$ROOT/src/poster/poster.html"
OUT="$ROOT/poster.png"
TMP_DIR="$ROOT/.tmp"
PREVIEW="$TMP_DIR/poster-preview.png"

# Logical A2 @ 96 dpi (CSS px), and the scale factor to reach 300 dpi.
WINDOW_W=1587
WINDOW_H=2245
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
  echo "       Install one, or edit CHROME in $0." >&2
  exit 1
fi

if [ ! -f "$SRC" ]; then
  echo "ERROR: source design not found: $SRC" >&2
  exit 1
fi

mkdir -p "$TMP_DIR"

# Build a file:// URL from the MSYS path (/d/WLSA/... -> file:///D:/WLSA/...).
# The drive letter must be uppercase and spaces percent-encoded, or Chromium
# shows a blank error page instead of loading the file.
DRIVE="${SRC:1:1}"
DRIVE="$(printf '%s' "$DRIVE" | tr 'a-z' 'A-Z')"
SRC_URL="file:///${DRIVE}:${SRC:2}"
SRC_URL="${SRC_URL// /%20}"

echo "Browser : $CHROME"
echo "Source  : $SRC"
echo "Rendering $OUT  (A2 @ 300 dpi, ${WINDOW_W}x${WINDOW_H} logical x $SCALE)..."

"$CHROME" \
  --headless=new \
  --disable-gpu \
  --hide-scrollbars \
  --force-device-scale-factor="$SCALE" \
  --window-size="${WINDOW_W},${WINDOW_H}" \
  --screenshot="$OUT" \
  "$SRC_URL"

echo "Rendering preview: $PREVIEW"
"$CHROME" \
  --headless=new \
  --disable-gpu \
  --hide-scrollbars \
  --force-device-scale-factor=0.63 \
  --window-size="${WINDOW_W},${WINDOW_H}" \
  --screenshot="$PREVIEW" \
  "$SRC_URL"

echo "Done."
echo "  Final   : $OUT"
echo "  Preview : $PREVIEW"
