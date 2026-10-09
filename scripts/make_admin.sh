#!/usr/bin/env bash
# First-admin bootstrap: sets role='admin' on an existing account.
# Run AFTER the teacher signs up in the app (the signup lands with role
# 'pending' and grants nothing until this runs).
#
# Usage: bash scripts/make_admin.sh <email>
set -euo pipefail

EMAIL="${1:-}"
[ -n "$EMAIL" ] || { echo "ERROR: usage: bash scripts/make_admin.sh <email>" >&2; exit 1; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV="$ROOT/scripts/.env"
[ -f "$ENV" ] || { echo "ERROR: scripts/.env missing — copy scripts/.env.example and fill it in." >&2; exit 1; }
set -a; . "$ENV"; set +a

# Escape single quotes for safe SQL-literal interpolation ('' = one quote).
SAFE_EMAIL="${EMAIL//\'/\'\'}"

psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -c \
  "update public.profiles p set role='admin' from auth.users u where p.id = u.id and u.email = '$SAFE_EMAIL';"

ROWS=$(psql "$SUPABASE_DB_URL" -Atc \
  "select count(*) from public.profiles p join auth.users u on p.id = u.id where u.email = '$SAFE_EMAIL' and p.role = 'admin';")
[ "$ROWS" = "1" ] || { echo "ERROR: no profile found for $EMAIL (did they sign up first?)" >&2; exit 1; }

echo "OK: $EMAIL is now admin."
