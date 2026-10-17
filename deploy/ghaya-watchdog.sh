#!/bin/bash
# GHAYA self-healing watchdog — installed on VPS /usr/local/bin/ghaya-watchdog.sh
# Run by cron every 5 minutes: */5 * * * * /usr/local/bin/ghaya-watchdog.sh >/dev/null 2>&1
# Logs (append, timestamped) to /var/log/ghaya-watchdog.log
#
# Behaviors:
#   - web-public  : curl -sf -m 10 http://127.0.0.1:3000/  fails -> pm2 restart web-public  (logs "RESTARTED web-public")
#   - web-console : curl -sf -m 10 http://127.0.0.1:3001/  fails -> pm2 restart web-console (logs "RESTARTED web-console")
#   - pm2 itself unresponsive -> log only, no action
#   - disk /  > 85%            -> log "DISK HIGH xx%"  (never deletes anything)
#   - memory available < 500MB -> log only, no action
#   - nginx not active         -> systemctl start nginx + log
#   - restart-loop guard: max 2 restarts per process per 2h in
#     /tmp/ghaya-watchdog.state, then "ALERT: restart loop" and stop trying.
#
# Test hooks (never set in cron):
#   GHAYA_WD_PUB_URL / GHAYA_WD_CON_URL  override health-check URLs (dead-port testing)
#   GHAYA_WD_DRY_RUN=1                   detect + log, but never call pm2/systemctl
#   GHAYA_WD_LOG / GHAYA_WD_STATE        redirect log/state for isolated tests
#   GHAYA_WD_PM2_TIMEOUT                  seconds to wait for pm2 (default 20)

set -u

LOG="${GHAYA_WD_LOG:-/var/log/ghaya-watchdog.log}"
STATE="${GHAYA_WD_STATE:-/tmp/ghaya-watchdog.state}"
PUB_URL="${GHAYA_WD_PUB_URL:-http://127.0.0.1:3000/}"
CON_URL="${GHAYA_WD_CON_URL:-http://127.0.0.1:3001/}"
DRY="${GHAYA_WD_DRY_RUN:-0}"
PM2_TIMEOUT="${GHAYA_WD_PM2_TIMEOUT:-20}"

RESTART_LIMIT=2        # max restarts per process...
WINDOW=7200            # ...per 2 hours (seconds)
MEM_MIN_KB=512000      # 500 MB available
DISK_LIMIT=85          # percent

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }

# One instance at a time — a hung previous run must not stack up cron cycles.
LOCK="${GHAYA_WD_LOCK:-/tmp/ghaya-watchdog.lock}"
exec 9> "$LOCK" || exit 0
flock -n 9 || { log "previous watchdog run still active — exiting (no actions)"; exit 0; }

now=$(date +%s)

# --- pm2 responsiveness gate (if pm2 itself is broken, log only) ---
pm2_ok=1
if ! PM2_JLIST="$(timeout "$PM2_TIMEOUT" pm2 jlist 2>/dev/null)"; then
  pm2_ok=0
  log "pm2 unresponsive (or missing) — skipping process checks this cycle, log only"
fi

# How many restarts of $1 happened inside the last 2h (from state file).
recent_count() {
  [ -f "$STATE" ] || { echo 0; return 0; }
  awk -v n="$1" -v cutoff=$((now - WINDOW)) \
      '$1==n { for(i=2;i<=NF;i++) if ($i+0 >= cutoff) c++ } END { print c+0 }' "$STATE"
}

record_restart() {  # append $1's timestamp, keeping only its own line fresh
  local tmp="$STATE.tmp"
  if [ -f "$STATE" ]; then grep -v "^$1 " "$STATE" > "$tmp" 2>/dev/null; fi
  : >> "$tmp"
  echo "$1 $now" >> "$tmp"
  mv "$tmp" "$STATE" 2>/dev/null || true
}

# Attempt restart of $1, guarded by the 2-per-2h rate limit.
try_restart() {
  local name="$1" c
  c="$(recent_count "$name")"
  if [ "$c" -ge "$RESTART_LIMIT" ]; then
    log "ALERT: restart loop for $name ($c restarts in last 2h) — stopping, manual intervention required"
    return 1
  fi
  if [ "$DRY" = "1" ]; then
    log "WOULD RESTART $name (dry-run, unhealthy detected, pm2 NOT touched)"
    return 0
  fi
  if pm2 restart "$name" >> "$LOG" 2>&1; then
    record_restart "$name"
    log "RESTARTED $name"
    return 0
  fi
  log "ERROR: pm2 restart $name failed"
  return 1
}

pub_st="n/a"; con_st="n/a"
check_web() {  # $1 = pm2 process name, $2 = URL, $3 = status var name
  local name="$1" url="$2"
  if [ "$pm2_ok" != "1" ]; then
    printf -v "$3" "%s" "skipped(pm2 down)"
    return 0
  fi
  if curl -sf -m 10 "$url" -o /dev/null 2>/dev/null; then
    printf -v "$3" "%s" "ok"
  else
    printf -v "$3" "%s" "FAIL"
    log "UNHEALTHY $name ($url failed) — attempting restart"
    try_restart "$name"
  fi
}

check_web "web-public"  "$PUB_URL"  pub_st
check_web "web-console" "$CON_URL"  con_st

# --- disk usage on / : log only, NEVER delete ---
DISK="$(df -P / 2>/dev/null | awk 'NR==2{gsub("%","",$5); print $5}')"
case "$DISK" in ''|*[!0-9]*) DISK=0 ;; esac
if [ "$DISK" -gt "$DISK_LIMIT" ]; then
  log "DISK HIGH ${DISK}%"
fi

# --- memory: log only if available < 500MB ---
AVAIL_KB="$(awk '/^MemAvailable:/{print $2}' /proc/meminfo 2>/dev/null)"
case "$AVAIL_KB" in ''|*[!0-9]*) AVAIL_KB=0 ;; esac
if [ "$AVAIL_KB" -lt "$MEM_MIN_KB" ]; then
  log "MEMORY LOW: ${AVAIL_KB} kB available (<500MB) — log only, no action"
fi

# --- nginx ---
if ! systemctl is-active --quiet nginx; then
  log "nginx NOT active — attempting systemctl start nginx"
  if [ "$DRY" = "1" ]; then
    log "WOULD START nginx (dry-run)"
  elif systemctl start nginx >> "$LOG" 2>&1; then
    log "RESTARTED nginx (started)"
  else
    log "ERROR: failed to start nginx"
  fi
fi

# --- heartbeat: one line per cycle, reflecting actual check results (test evidence) ---
log "OK cycle complete: web-public=${pub_st} web-console=${con_st} disk=${DISK}% mem_avail=$((AVAIL_KB/1024))MB pm2=$([ "$pm2_ok" = 1 ] && echo up || echo DOWN)"
exit 0
