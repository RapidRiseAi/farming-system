#!/usr/bin/env bash
set -euo pipefail

if [[ -f .env.local ]]; then
  # shellcheck disable=SC1091
  set -a; source .env.local; set +a
elif [[ -f .env ]]; then
  # shellcheck disable=SC1091
  set -a; source .env; set +a
fi

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "Error: SUPABASE_DB_URL is not set (in environment, .env.local, or .env)." >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "Error: psql is not installed or not on PATH." >&2
  exit 1
fi

shopt -s nullglob
migrations=(supabase/migrations/*.sql)

if (( ${#migrations[@]} == 0 )); then
  echo "No migrations found in supabase/migrations/."
  exit 0
fi

for migration in "${migrations[@]}"; do
  echo "Applying ${migration}"
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$migration"
done

echo "All migrations applied."
