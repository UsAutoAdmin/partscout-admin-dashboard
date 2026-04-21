#!/usr/bin/env bash
# Fleet watchdog — checks all Mac minis are running and scraping.
# Verifies process reachability, deep mode status, and queue availability.
# Writes structured JSON run history for the Virtual Assistant dashboard.
# Intended to run via crontab every 10 minutes.

set -euo pipefail

MINIS=(
  "Mini1|127.0.0.1|local"
  "Mini2|100.100.6.101|remote"
  "Mini3|100.68.192.57|remote"
)

LOCAL_SCRAPER_DIR="/Users/chaseeriksson/Downloads/Seed Database"
LOG="/tmp/fleet-watchdog.log"
HISTORY_DIR="/Users/chaseeriksson/.openclaw/workspace/partscout-admin-dashboard/data/watchdog-runs"

mkdir -p "$HISTORY_DIR"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

# Start deep mode and check the immediate response for queue-empty signal.
# The /control endpoint returns status right after the command executes,
# so the "All eligible rows deep-scraped" message should still be in logTail.
check_queue_empty() {
  local ip="$1"
  local tmpdir
  tmpdir=$(mktemp -d)

  curl -s --connect-timeout 5 -X POST "http://$ip:3848/control" \
    -H "Content-Type: application/json" \
    -d '{"action":"startMode","mode":"deep"}' > "$tmpdir/response.json" 2>/dev/null || true

  sleep 3

  curl -s --connect-timeout 5 "http://$ip:3848/status" > "$tmpdir/status.json" 2>/dev/null || true

  local result
  result=$(python3 -c "
import json, glob, os
tmpdir = '$tmpdir'
for f in ['response.json', 'status.json']:
  fp = os.path.join(tmpdir, f)
  try:
    with open(fp) as fh:
      d = json.load(fh)
      if d.get('metrics', {}).get('deep', {}).get('status') == 'running':
        print('running')
        raise SystemExit(0)
      for line in d.get('logTail', []):
        if 'All eligible rows deep-scraped' in line:
          print('queue_empty')
          raise SystemExit(0)
  except (json.JSONDecodeError, FileNotFoundError, KeyError):
    pass
print('failed')
" 2>/dev/null || echo "failed")

  rm -rf "$tmpdir"
  echo "$result"
}

RUN_TS=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
RUN_ID=$(date '+%Y%m%d-%H%M%S')
OVERALL_OK=true
MACHINES_JSON="["
FIRST=true

for entry in "${MINIS[@]}"; do
  IFS='|' read -r name ip kind <<< "$entry"

  machine_ok=true
  machine_action="none"
  machine_deep="unknown"
  machine_error=""

  status_json=$(curl -s --connect-timeout 5 "http://$ip:3848/status" 2>/dev/null || echo "")

  if [ -z "$status_json" ]; then
    log "$name ($ip): agent UNREACHABLE"
    machine_ok=false
    machine_deep="unreachable"
    OVERALL_OK=false

    if [ "$kind" = "local" ]; then
      log "$name: killing stale ports and relaunching scraper..."
      lsof -ti:3847 -ti:3848 2>/dev/null | xargs kill -9 2>/dev/null || true
      sleep 1
      cd "$LOCAL_SCRAPER_DIR" && bash run-detached.sh --workers 10 --browsers 3 >> "$LOG" 2>&1
      sleep 5
      restart_result=$(curl -s --connect-timeout 5 -X POST "http://127.0.0.1:3848/control" \
        -H "Content-Type: application/json" \
        -d '{"action":"startMode","mode":"deep"}' 2>&1 || echo "restart_failed")
      if echo "$restart_result" | grep -q "restart_failed"; then
        machine_action="restart_failed"
        machine_error="Process restarted but deep mode start failed"
        log "$name: restart attempted but deep mode start failed"
      else
        machine_action="restarted_process_and_deep"
        log "$name: restarted scraper + deep mode"
      fi
    else
      machine_action="manual_intervention_needed"
      machine_error="Remote mini unreachable"
      log "$name: remote mini unreachable — needs manual intervention"
    fi
  else
    machine_deep=$(echo "$status_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['metrics']['deep']['status'])" 2>/dev/null || echo "unknown")
    process_running=$(echo "$status_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('running', False))" 2>/dev/null || echo "False")

    if [ "$machine_deep" = "running" ] || [ "$machine_deep" = "stopping" ]; then
      log "$name ($ip): deep OK ($machine_deep)"
      machine_action="none"
    elif [ "$process_running" = "True" ] && [ "$machine_deep" = "idle" ]; then
      # Process is running but deep is idle — check if queue is empty
      log "$name ($ip): deep is idle, process alive — checking queue..."
      sleep 10
      recheck_json=$(curl -s --connect-timeout 5 "http://$ip:3848/status" 2>/dev/null || echo "")
      if [ -n "$recheck_json" ]; then
        machine_deep=$(echo "$recheck_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['metrics']['deep']['status'])" 2>/dev/null || echo "unknown")
      fi

      if [ "$machine_deep" = "running" ] || [ "$machine_deep" = "stopping" ]; then
        log "$name ($ip): deep recovered on recheck ($machine_deep)"
        machine_action="none"
      else
        # Try starting deep and see what happens
        restart_outcome=$(check_queue_empty "$ip")
        if [ "$restart_outcome" = "running" ]; then
          log "$name ($ip): deep restarted successfully"
          machine_action="restarted_deep"
          machine_deep="running"
        elif [ "$restart_outcome" = "queue_empty" ]; then
          log "$name ($ip): deep queue is empty — all eligible rows scraped"
          machine_deep="queue_empty"
          machine_action="none"
          # Queue empty is healthy — process is running, just no deep work to do
        else
          log "$name ($ip): deep restart sent but didn't take effect"
          OVERALL_OK=false
          machine_ok=false
          machine_action="restarted_deep"
          machine_error="Deep restart sent but mode did not stay running"
        fi
      fi
    else
      log "$name ($ip): deep is '$machine_deep' — attempting restart"
      OVERALL_OK=false
      machine_ok=false
      curl -s --connect-timeout 5 -X POST "http://$ip:3848/control" \
        -H "Content-Type: application/json" \
        -d '{"action":"startMode","mode":"deep"}' > /dev/null 2>&1
      machine_action="restarted_deep"
      machine_error="Deep was '$machine_deep'"
      log "$name ($ip): deep mode start command sent"
    fi
  fi

  [ "$FIRST" = true ] && FIRST=false || MACHINES_JSON+=","
  MACHINES_JSON+=$(cat <<MEOF
{"name":"$name","ip":"$ip","kind":"$kind","ok":$machine_ok,"deepStatus":"$machine_deep","action":"$machine_action","error":"$machine_error"}
MEOF
)
done

MACHINES_JSON+="]"

log "--- watchdog pass complete ---"

HISTORY_FILE="$HISTORY_DIR/$RUN_ID.json"
cat > "$HISTORY_FILE" <<HEOF
{"id":"$RUN_ID","timestamp":"$RUN_TS","ok":$OVERALL_OK,"machines":$MACHINES_JSON}
HEOF
