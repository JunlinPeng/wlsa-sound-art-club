#!/usr/bin/env bash
# Pre-approves the club roster: reads a CSV of emails (one per line, no
# header) and sets role='member' on those accounts. Members must already
# have signed up in the app.
#
# Usage: bash scripts/promote_members.sh [members.csv]
#        (defaults to scripts/data/members.csv)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV="$ROOT/scripts/.env"
CSV="${1:-$ROOT/scripts/data/members.csv}"

[ -f "$ENV" ] || { echo "ERROR: scripts/.env missing — copy scripts/.env.example and fill it in." >&2; exit 1; }
[ -f "$CSV" ] || { echo "ERROR: $CSV not found — create it with one member email per line." >&2; exit 1; }
set -a; . "$ENV"; set +a

OK=0; MISSING=0
while IFS= read -r line; do
  email=$(printf '%s' "$line" | tr -d '\r' | xargs)   # trim whitespace/CR
  [ -z "$email" ] && continue
  [ "${email#\#}" != "$email" ] && continue          # skip # comments

  # Escape single quotes for safe SQL-literal interpolation ('' = one quote).
  safe_email="${email//\'/\'\'}"

  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q -c \
    "update public.profiles p set role='member' from auth.users u where p.id = u.id and u.email = '$safe_email';"

  ROWS=$(psql "$SUPABASE_DB_URL" -Atc \
    "select count(*) from public.profiles p join auth.users u on p.id = u.id where u.email = '$safe_email' and p.role = 'member';")
  if [ "$ROWS" = "1" ]; then
    echo "OK: $email -> member"
    OK=$((OK + 1))
  else
    echo "SKIP: $email has no account yet (they must sign up in the app first)"
    MISSING=$((MISSING + 1))
  fi
done < "$CSV"

echo "Done: $OK promoted, $MISSING skipped."
