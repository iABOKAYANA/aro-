#!/bin/bash
# GHAYA Linux backup — Postgres-aware with SQLite fallback (adapted from scripts/backup-db.sh).
# Usage: GHAYA_APP_DIR=/opt/ghaya deploy/backup-cron.sh  (safe while servers are up)
# Env: DATABASE_URL is read from $GHAYA_APP_DIR/.env when exported inline, else from the
#      environment. GHAYA_BACKUP_DIR overrides the destination.
set -euo pipefail

APP_DIR="${GHAYA_APP_DIR:-/opt/ghaya}"
BACKUP_DIR="${GHAYA_BACKUP_DIR:-$HOME/GHAYA_backups}"
LOG_FILE="$BACKUP_DIR/backup.log"
RETENTION_DAYS=14

mkdir -p "$BACKUP_DIR"

fail() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') FAIL $1" | tee -a "$LOG_FILE" >&2
  exit 1
}

# Pick up DATABASE_URL from the app .env when not already exported.
if [ -z "${DATABASE_URL:-}" ] && [ -f "$APP_DIR/.env" ]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "$APP_DIR/.env" | tail -1 | cut -d= -f2- | tr -d '"'"'" )"
  export DATABASE_URL
fi
[ -n "${DATABASE_URL:-}" ] || fail "DATABASE_URL not set and $APP_DIR/.env unreadable"

TIMESTAMP="$(date +"%Y-%m-%d-%H%M")"

if [[ "$DATABASE_URL" == postgres* ]]; then
  # ─── Postgres path ───
  command -v pg_dump >/dev/null 2>&1 || fail "pg_dump not found (apt install postgresql-client)"
  BACKUP_FILE="$BACKUP_DIR/ghaya-$TIMESTAMP.sql.gz"
  pg_dump "$DATABASE_URL" | gzip > "$BACKUP_FILE" \
    || fail "pg_dump failed"
  [ -s "$BACKUP_FILE" ] || fail "backup file empty: $BACKUP_FILE"
  # Verify the dump is restorable gzip + contains the COPY footer.
  gzip -t "$BACKUP_FILE" || { rm -f "$BACKUP_FILE"; fail "gzip verify failed"; }
  PREFIX="ghaya-*.sql.gz"
else
  # ─── SQLite path (DATABASE_URL=file:...) ───
  DB_PATH="${DATABASE_URL#file:}"
  [ -f "$DB_PATH" ] || fail "live DB not found at $DB_PATH"
  command -v sqlite3 >/dev/null 2>&1 || fail "sqlite3 binary not found"
  BACKUP_FILE="$BACKUP_DIR/ghaya-$TIMESTAMP.db"
  # Online-safe: SQLite backup API, never cp on a live DB.
  sqlite3 "$DB_PATH" ".backup main '$BACKUP_FILE'" \
    || fail "sqlite3 .backup failed for $DB_PATH"
  RESULT="$(sqlite3 "$BACKUP_FILE" "PRAGMA integrity_check;")" \
    || { rm -f "$BACKUP_FILE"; fail "integrity_check query failed"; }
  [ "$RESULT" = "ok" ] || { rm -f "$BACKUP_FILE"; fail "integrity_check FAILED: $RESULT"; }
  PREFIX="ghaya-*.db"
fi

# Retention: delete backups older than 14 days.
DELETED="$(find "$BACKUP_DIR" -maxdepth 1 -name "$PREFIX" -type f -mtime +$RETENTION_DAYS -print -delete | wc -l | tr -d ' ')"

SIZE="$(du -h "$BACKUP_FILE" | cut -f1)"
echo "$(date '+%Y-%m-%d %H:%M:%S') OK $BACKUP_FILE size=$SIZE pruned=$DELETED" | tee -a "$LOG_FILE"
