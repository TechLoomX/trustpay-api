#!/usr/bin/env bash
# Applies the real migrations (supabase/migrations/*.sql) plus the CI-only
# role/auth/grants shims (see scripts/ci/*-shim.sql for why they're needed)
# against a bare Postgres instance, in the right order. Used by both the
# `migrations` and `integration` CI jobs so there's one place this sequence
# is defined.
#
# Usage: DATABASE_URL=postgresql://... ./scripts/ci/apply-migrations.sh
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must be set}"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "Applying CI-only roles/auth shim..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$repo_root/scripts/ci/00-roles-and-auth-shim.sql"

for f in "$repo_root"/supabase/migrations/*.sql; do
  echo "Applying $(basename "$f")..."
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done

echo "Applying CI-only grants shim..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$repo_root/scripts/ci/99-grants-shim.sql"

echo "Migrations applied."
