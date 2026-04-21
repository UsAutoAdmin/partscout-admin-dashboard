#!/usr/bin/env bash
# One-shot snapshot of the fix-affected fleet rescrape.
set -uo pipefail

LOCAL_LOG="/Users/chaseeriksson/Downloads/Seed Database/fix-affected.log"
LOCAL_OUT="/Users/chaseeriksson/Downloads/Seed Database/fix-affected-output.jsonl"

snapshot_node() {
  local label="$1"
  local cmd="$2"
  echo "─── ${label} ───"
  eval "$cmd" 2>/dev/null || echo "(unreachable)"
}

snapshot_node "local (60,272 parts)" "
  if pgrep -f 'tsx fix-active.ts fix-affected-input' >/dev/null; then echo 'running ✓'; else echo 'NOT RUNNING'; fi
  echo 'lines: ' \$(wc -l < \"$LOCAL_OUT\" 2>/dev/null || echo 0)
  tail -n 1 \"$LOCAL_LOG\" 2>/dev/null
"

snapshot_node "mini2 (120,543 parts)" "
  ssh -o ConnectTimeout=5 chaseeriksson@100.100.6.101 'if pgrep -f \"tsx fix-active.ts fix-affected-input\" >/dev/null; then echo \"running ✓\"; else echo \"NOT RUNNING\"; fi; echo \"lines: \"\$(wc -l < ~/Seed-Database/fix-affected-output.jsonl 2>/dev/null || echo 0); tail -n 1 ~/Seed-Database/fix-affected.log 2>/dev/null'
"

snapshot_node "mini3 (120,543 parts)" "
  ssh -o ConnectTimeout=5 chaseeriksson@100.68.192.57 'if pgrep -f \"tsx fix-active.ts fix-affected-input\" >/dev/null; then echo \"running ✓\"; else echo \"NOT RUNNING\"; fi; echo \"lines: \"\$(wc -l < ~/Seed-Database/fix-affected-output.jsonl 2>/dev/null || echo 0); tail -n 1 ~/Seed-Database/fix-affected.log 2>/dev/null'
"
