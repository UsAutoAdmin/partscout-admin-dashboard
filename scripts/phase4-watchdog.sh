#!/usr/bin/env bash
# Phase 4 watchdog: keeps verify running on all 3 minis, snapshots progress every 5 min.
# Single-focus: only manages verify mode. Does NOT auto-restart deep/sold/active.
set -uo pipefail

ROOT="/Users/chaseeriksson/.openclaw/workspace/partscout-admin-dashboard"
LOG="$ROOT/data/pipeline/log.jsonl"
WATCH_LOG="$ROOT/data/watchdog-runs/phase4-$(date +%Y%m%d-%H%M%S).jsonl"
mkdir -p "$(dirname "$WATCH_LOG")"

DATABASE_URL='postgresql://postgres:Partscoutbotsuperior%21@db.wykhqhclzyygkslpbgmh.supabase.co:6543/postgres'
HOSTS=("localhost:Local" "100.100.6.101:Mini2" "100.68.192.57:Mini3")

now() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

log_line() {
  local lvl="$1" msg="$2" ts
  ts=$(now)
  printf '{"ts":"%s","level":"%s","message":%s}\n' "$ts" "$lvl" "$(jq -Rn --arg m "$msg" '$m')" \
    | tee -a "$LOG" "$WATCH_LOG" > /dev/null
}

snapshot() {
  cd "/Users/chaseeriksson/Downloads/Seed Database" && \
    DATABASE_URL="$DATABASE_URL" node "$ROOT/scripts/snapshot-verify.mjs" 2>/dev/null
}

ensure_verify() {
  local host="$1" name="$2" status
  status=$(curl -s --max-time 6 "http://$host:3848/status" 2>/dev/null \
    | python3 -c "import json,sys;d=json.load(sys.stdin);print(d['metrics'].get('verify',{}).get('status','unknown'))" 2>/dev/null \
    || echo "unreachable")
  case "$status" in
    running) return 0 ;;
    idle|stopped|paused)
      curl -s -X POST "http://$host:3848/control" -H "Content-Type: application/json" \
        -d '{"action":"startMode","mode":"verify"}' > /dev/null 2>&1
      log_line "warn" "$name verify was $status — kicked startMode"
      ;;
    unreachable)
      log_line "error" "$name agent unreachable on http://$host:3848"
      ;;
  esac
}

ITER=0
log_line "info" "Phase 4 watchdog started — verify-only, all 3 minis, every 5 min"

while true; do
  ITER=$((ITER + 1))

  SNAP=$(snapshot)
  if [ -n "$SNAP" ]; then
    DONE_5M=$(echo "$SNAP" | cut -d, -f1)
    INFLIGHT=$(echo "$SNAP" | cut -d, -f2)
    REMAIN=$(echo "$SNAP" | cut -d, -f3)
    VERIFIED=$(echo "$SNAP" | cut -d, -f4)
    PROMOTED=$(echo "$SNAP" | cut -d, -f5)
    RATE=$((DONE_5M / 5))
    if [ "$RATE" -gt 0 ]; then
      ETA_MIN=$((REMAIN / RATE))
      ETA_HR=$((ETA_MIN / 60))
    else
      ETA_HR="?"
    fi
    log_line "info" "[#$ITER] verify_done_total=$VERIFIED | last5m=$DONE_5M (~$RATE/min) | inflight=$INFLIGHT | broad_remaining=$REMAIN | deep_eligible_promoted=$PROMOTED | ETA=${ETA_HR}h"
  else
    log_line "error" "[#$ITER] DB snapshot failed"
  fi

  for hn in "${HOSTS[@]}"; do
    ensure_verify "${hn%:*}" "${hn#*:}" || true
  done

  sleep 300
done
