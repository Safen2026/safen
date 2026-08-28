#!/usr/bin/env bash
# Runs every SQL assertion file against the local rehearsal database.
#
# `supabase db query -f` cannot be used here: it submits the whole file as one
# prepared statement and fails with "cannot insert multiple commands into a
# prepared statement". psql inside the running container handles multi-statement
# files and returns a real exit code (3 on error), so failures are detectable.
set -uo pipefail

CONTAINER="${SAFEN_DB_CONTAINER:-supabase_db_safen}"
LOG="$(mktemp)"
fail=0

for f in supabase/tests/[0-9]*.sql; do
  printf '%-42s' "$(basename "$f")"
  if docker exec -i "$CONTAINER" psql -U postgres -d postgres \
       -v ON_ERROR_STOP=1 -q -f - < "$f" >"$LOG" 2>&1; then
    echo "PASS"
  else
    echo "FAIL"
    sed 's/^/    /' "$LOG"
    fail=1
  fi
done

rm -f "$LOG"
exit "$fail"
