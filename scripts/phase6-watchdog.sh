#!/bin/bash
# Phase 6 (B1) watchdog: monitor verify + deep on all 3 minis every 10 min,
# log progress + pool sizes, auto-restart any zombie mode (status=running but 0
# tasks in dashboard recentTasks for >5 min) by sending startMode again.
#
# Usage: nohup bash scripts/phase6-watchdog.sh > data/phase6-watchdog/runner.log 2>&1 &

cd "$(dirname "$0")/.."
mkdir -p data/phase6-watchdog
LOG_DIR="data/phase6-watchdog"

DB_URL='postgresql://postgres:Partscoutbotsuperior%21@db.wykhqhclzyygkslpbgmh.supabase.co:6543/postgres'

while true; do
  TS=$(date +%Y%m%d-%H%M%S)
  HUMAN_TS=$(date '+%Y-%m-%d %H:%M:%S')
  OUT="$LOG_DIR/$TS.json"

  # 1) Take DB snapshot via direct-Postgres (in Seed Database for pg dependency)
  cd "/Users/chaseeriksson/Downloads/Seed Database" 2>/dev/null && DATABASE_URL="$DB_URL" node -e "
    import('pg').then(async ({ default: pg }) => {
      const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
      await c.connect();
      const r = await c.query(\`
        SELECT
          COUNT(*) FILTER (WHERE sold_verified_at >= now() - interval '10 minutes' AND sold_confidence IS NOT NULL) AS verify_10min,
          COUNT(*) FILTER (WHERE deep_scraped = true AND deep_scraped_at >= now() - interval '10 minutes') AS deep_10min,
          COUNT(*) FILTER (WHERE sold_confidence IS NULL AND sell_through > 50 AND sold ~ '^[0-9]+\$' AND sold::int >= 5 AND (sold_verified_at IS NULL OR sold_verified_at < now() - interval '15 minutes')) AS verify_pool,
          COUNT(*) FILTER (WHERE sold_confidence > 0.7 AND sell_through > 50 AND sold ~ '^[0-9]+\$' AND sold::int >= 5 AND (deep_scraped IS NULL OR deep_scraped = false) AND deep_scraped_at IS NULL) AS deep_pool
        FROM \"9_Octoparse_Scrapes\"
      \`);
      console.log(JSON.stringify(r.rows[0]));
      await c.end();
    }).catch(e => { console.error('DB ERR', e.message); process.exit(1); });
  " > "/tmp/p6-snap.json" 2>/dev/null
  cd - > /dev/null

  SNAP=$(cat /tmp/p6-snap.json 2>/dev/null)

  # 2) Check fleet, auto-revive zombies via startMode
  REVIVED=""
  for host_name in "localhost:Local" "100.100.6.101:Mini2" "100.68.192.57:Mini3"; do
    host="${host_name%:*}"; name="${host_name#*:}"
    STATUS=$(curl -s --max-time 6 "http://$host:3848/status" 2>/dev/null)
    [ -z "$STATUS" ] && continue
    for MODE in verify deep; do
      LATEST=$(echo "$STATUS" | python3 -c "
import sys,json
try:
  d = json.load(sys.stdin)
  m = (d.get('metrics') or {}).get('$MODE') or {}
  s = m.get('status','?')
  rt = m.get('recentTasks') or []
  print(f'{s}|{rt[0].get(\"time\",\"\") if rt else \"\"}')
except: print('?|')
" 2>/dev/null)
      MODE_STATUS=${LATEST%|*}
      LAST_TIME=${LATEST#*|}
      # Heuristic: if status=running but no recentTasks at all, it's zombie
      if [ "$MODE_STATUS" = "running" ] && [ -z "$LAST_TIME" ]; then
        curl -s -X POST "http://$host:3848/control" -H "Content-Type: application/json" -d "{\"action\":\"startMode\",\"mode\":\"$MODE\"}" > /dev/null
        REVIVED="$REVIVED $name/$MODE"
      fi
    done
  done

  # 3) Write snapshot file + append to running log
  echo "{\"ts\":\"$HUMAN_TS\",\"db\":$SNAP,\"revived\":\"$REVIVED\"}" > "$OUT"
  echo "[$HUMAN_TS] db=$SNAP revived='$REVIVED'" | tee -a "$LOG_DIR/runner.log"

  sleep 600
done
