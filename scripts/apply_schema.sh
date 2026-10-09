#!/usr/bin/env bash
# Applies scripts/sql/001_init.sql to Supabase (idempotent) and verifies the
# core tables exist. Reads credentials from scripts/.env.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV="$ROOT/scripts/.env"

[ -f "$ENV" ] || { echo "ERROR: scripts/.env missing — copy scripts/.env.example and fill it in." >&2; exit 1; }
set -a; . "$ENV"; set +a

[ -n "${SUPABASE_DB_URL:-}" ] || { echo "ERROR: SUPABASE_DB_URL not set in scripts/.env" >&2; exit 1; }
command -v psql >/dev/null 2>&1 || { echo "ERROR: psql not found — install PostgreSQL client tools first." >&2; exit 1; }

echo "Applying scripts/sql/001_init.sql ..."
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$ROOT/scripts/sql/001_init.sql"

echo "Verifying tables ..."
TABLES=$(psql "$SUPABASE_DB_URL" -Atc \
  "select count(*) from information_schema.tables where table_schema='public' and table_name in ('profiles','sounds');")
[ "$TABLES" = "2" ] || { echo "ERROR: expected profiles + sounds tables, found $TABLES" >&2; exit 1; }

BUCKET=$(psql "$SUPABASE_DB_URL" -Atc \
  "select count(*) from storage.buckets where id='audio' and public=false;")
[ "$BUCKET" = "1" ] || { echo "ERROR: private storage bucket 'audio' not found" >&2; exit 1; }

echo "OK: schema applied — profiles, sounds, and the private 'audio' bucket are ready."
