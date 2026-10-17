#!/bin/bash
# GHAYA daily SQLite backup — online-safe via the SQLite backup API.
# Usage: sh scripts/backup-db.sh  (absolute paths; safe to run while servers are up)
# Env override: GHAYA_BACKUP_DIR=/custom/dir sh scripts/backup-db.sh
set -euo pipefail

PROJECT_ROOT="/Users/macxstore/Desktop/GHAYA/GHAYA_ESTATE_APP"
DB="$PROJECT_ROOT/prisma/dev.db"
BACKUP_DIR="${GHAYA_BACKUP_DIR:-$HOME/GHAYA_backups}"
LOG_FILE="$BACKUP_DIR/backup.log"
RETENTION_DAYS=14

mkdir -p "$BACKUP_DIR"

fail() {
  local msg="$1"
  echo "$(date '+%Y-%m-%d %H:%M:%S') FAIL $msg" | tee -a "$LOG_FILE" >&2
  exit 1
}

command -v sqlite3 >/dev/null 2>&1 || fail "sqlite3 binary not found"
[ -f "$DB" ] || fail "live DB not found at $DB"

TIMESTAMP="$(date +"%Y-%m-%d-%H%M")"
BACKUP_FILE="$BACKUP_DIR/dev-$TIMESTAMP.db"

# Online-safe backup (uses SQLite backup API, not cp on a live DB).
sqlite3 "$DB" ".backup main '$BACKUP_FILE'" \
  || fail "sqlite3 .backup failed for $DB -> $BACKUP_FILE"
[ -f "$BACKUP_FILE" ] || fail "backup file missing after .backup: $BACKUP_FILE"

# Verify integrity of the COPY (never touches live DB).
RESULT="$(sqlite3 "$BACKUP_FILE" "PRAGMA integrity_check;")" \
  || { rm -f "$BACKUP_FILE"; fail "integrity_check query failed on $BACKUP_FILE"; }
if [ "$RESULT" != "ok" ]; then
  rm -f "$BACKUP_FILE"
  fail "integrity_check FAILED on $BACKUP_FILE: $RESULT"
fi

# Retention: delete backups older than 14 days.
DELETED="$(find "$BACKUP_DIR" -maxdepth 1 -name 'dev-*.db' -type f -mtime +$RETENTION_DAYS -print -delete | wc -l | tr -d ' ')"

SIZE="$(du -h "$BACKUP_FILE" | cut -f1)"
echo "$(date '+%Y-%m-%d %H:%M:%S') OK $BACKUP_FILE size=$SIZE pruned=$DELETED" | tee -a "$LOG_FILE"
