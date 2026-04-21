#!/usr/bin/env bash
# Overnight watchdog for the PartScout scraper fleet.
#
# Loops every 5 min:
#   1. Snapshots queue counts via Supabase (using direct-PG via pg-shim's
#      DATABASE_URL in .env.local — bypasses Cloudflare).
#   2. Checks each mini's HTTP agent for live throughput.
#   3. Auto-restarts deep mode on any mini that's idle but should be running.
#   4. Appends a JSON line to data/pipeline/log.jsonl for the dashboard.
#
# Designed to run in the background until morning.
#
set -uo pipefail

ROOT="/Users/chaseeriksson/.openclaw/workspace/partscout-admin-dashboard"
LOG="$ROOT/data/pipeline/log.jsonl"
WATCH_LOG="$ROOT/data/watchdog-runs/$(date +%Y%m%d-%H%M%S).jsonl"
mkdir -p "$(dirname "$WATCH_LOG")"

DATABASE_URL='postgresql://postgres:Partscoutbotsuperior%21@db.wykhqhclzyygkslpbgmh.supabase.co:6543/postgres'

# Hosts → friendly names (control-plane endpoints).
HOSTS=("localhost:Local" "100.100.6.101:Mini2" "100.68.192.57:Mini3")

now() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

log_line() {
  local lvl="$1"
  local msg="$2"
  local ts
  ts=$(now)
  printf '{"ts":"%s","level":"%s","message":%s}\n' "$ts" "$lvl" "$(jq -Rn --arg m "$msg" '$m')" >> "$LOG"
  printf '{"ts":"%s","level":"%s","message":%s}\n' "$ts" "$lvl" "$(jq -Rn --arg m "$msg" '$m')" >> "$WATCH_LOG"
}

snapshot_db() {
  # Use the local scraper's pg (already installed there) via a tiny mjs script.
  cd "/Users/chaseeriksson/Downloads/Seed Database" && \
    DATABASE_URL="$DATABASE_URL" node "$ROOT/scripts/snapshot-db.mjs" 2>/dev/null
}

ensure_running() {
  local host="$1"
  local name="$2"
  local mode="$3"
  local status
  status=$(curl -s --max-time 6 "http://$host:3848/status" 2>/dev/null \
    | python3 -c "import json,sys;d=json.load(sys.stdin);print(d['metrics'].get('$mode',{}).get('status','unknown'))" 2>/dev/null \
    || echo "unreachable")
  if [ "$status" = "idle" ] || [ "$status" = "stopped" ] || [ "$status" = "paused" ]; then
    curl -s -X POST "http://$host:3848/control" -H "Content-Type: application/json" -d "{\"action\":\"startMode\",\"mode\":\"$mode\"}" > /dev/null 2>&1
    log_line "warn" "$name $mode was $status — kicked startMode"
    return 1
  elif [ "$status" = "unreachable" ]; then
    log_line "error" "$name agent unreachable on http://$host:3848"
    return 2
  fi
  return 0
}

ITER=0
log_line "info" "Watchdog started — checking every 5 min"

while true; do
  ITER=$((ITER + 1))

  # 1. Snapshot DB.
  SNAP=$(snapshot_db)
  if [ -n "$SNAP" ]; then
    DEEP_DONE=$(echo "$SNAP" | cut -d, -f1)
    DEEP_5M=$(echo "$SNAP" | cut -d, -f2)
    DEEP_QUEUE=$(echo "$SNAP" | cut -d, -f3)
    VERIFY_QUEUE=$(echo "$SNAP" | cut -d, -f4)
    DEEP_INFLIGHT=$(echo "$SNAP" | cut -d, -f5)
    RATE=$((DEEP_5M / 5))
    log_line "info" "[#$ITER] deep_done=$DEEP_DONE | last5m=$DEEP_5M (~$RATE/min) | inflight=$DEEP_INFLIGHT | deep_queue=$DEEP_QUEUE | verify_queue=$VERIFY_QUEUE"
  else
    log_line "error" "[#$ITER] DB snapshot failed"
  fi

  # 2. Ensure deep is running on all 3 minis, verify on Local.
  for host_name in "${HOSTS[@]}"; do
    host="${host_name%:*}"
    name="${host_name#*:}"
    ensure_running "$host" "$name" "deep" || true
  done
  ensure_running "localhost" "Local" "verify" || true

  sleep 300
done
