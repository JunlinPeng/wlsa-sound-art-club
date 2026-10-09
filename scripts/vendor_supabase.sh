#!/usr/bin/env bash
# Vendors a pinned supabase-js UMD build into src/soundmap/vendor/ so the site
# has NO runtime CDN dependency (jsDelivr/unpkg are unreliable in China).
# Downloads the npm tarball from registry.npmjs.org, verifies its sha512
# integrity against the registry metadata, and extracts dist/umd/supabase.js
# (the UMD bundle — note: newer releases name it supabase.js, not supabase.min.js).
#
# Usage: bash scripts/vendor_supabase.sh [version]   (default 2.45.4)
set -euo pipefail

VERSION="${1:-2.45.4}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/src/soundmap/vendor/supabase.min.js"
TMP="$ROOT/.tmp/vendor-supabase"
TGZ="$TMP/supabase-js-$VERSION.tgz"

mkdir -p "$TMP" "$(dirname "$DEST")"

echo "Fetching registry metadata for @supabase/supabase-js@$VERSION ..."
META=$(curl -fsSL "https://registry.npmjs.org/@supabase/supabase-js/$VERSION")
TARBALL_URL=$(printf '%s' "$META" | python -c "import json,sys; print(json.load(sys.stdin)['dist']['tarball'])")
INTEGRITY=$(printf '%s' "$META" | python -c "import json,sys; print(json.load(sys.stdin)['dist']['integrity'])")

echo "Downloading $TARBALL_URL ..."
curl -fsSL "$TARBALL_URL" -o "$TGZ"

echo "Verifying integrity ($INTEGRITY) ..."
ALGO="${INTEGRITY%%-*}"; DIGEST="${INTEGRITY#*-}"
ACTUAL=$(openssl dgst -"$ALGO" -binary "$TGZ" | openssl base64 -A)
[ "$ACTUAL" = "$DIGEST" ] || { echo "ERROR: integrity mismatch on downloaded tarball" >&2; exit 1; }
echo "Integrity OK."

echo "Extracting dist/umd/supabase.js ..."
tar -xzf "$TGZ" -C "$TMP" --strip-components=1 "package/dist/umd/supabase.js"
cp "$TMP/dist/umd/supabase.js" "$DEST"
rm -rf "$TMP"

grep -q "createClient" "$DEST" || { echo "ERROR: createClient not found in the extracted bundle" >&2; exit 1; }
echo "OK: $DEST ($(wc -c < "$DEST") bytes, v$VERSION UMD)"
