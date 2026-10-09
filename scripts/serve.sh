#!/usr/bin/env bash
# Local static server for developing the sound map. Note: the AMap key must
# whitelist http://localhost:8000 (and 127.0.0.1:8000) for the map to load.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/src/soundmap"

echo "Serving http://127.0.0.1:8000/  (Ctrl+C to stop)"
python -m http.server 8000 --bind 127.0.0.1
