#!/bin/bash
# Processes all chunk-*.json files in the given directory sequentially.
# Usage: ./run-rescrape-batch.sh <chunks-dir>
DIR="${1:-.}"
export NEXT_PUBLIC_SUPABASE_URL="https://wykhqhclzyygkslpbgmh.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5a2hxaGNsenl5Z2tzbHBiZ21oIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MDAyMjcxOSwiZXhwIjoyMDY1NTk4NzE5fQ.LjK1pLgCSGjieQkvKAbsk0us7J_Wj9LUEJj-M3Fb2GM"

# Find node - check common locations
if command -v node &>/dev/null; then
  NODE=node
elif [ -x "$HOME/.nvm/versions/node/v20.20.1/bin/node" ]; then
  NODE="$HOME/.nvm/versions/node/v20.20.1/bin/node"
elif [ -d "$HOME/node-v22.14.0-darwin-arm64/bin" ]; then
  NODE="$HOME/node-v22.14.0-darwin-arm64/bin/node"
elif [ -d "$HOME/.nvm" ]; then
  NODE=$(ls "$HOME"/.nvm/versions/node/*/bin/node 2>/dev/null | tail -1)
else
  echo "ERROR: node not found"
  exit 1
fi

echo "Using node: $NODE ($($NODE --version))"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

for chunk in "$DIR"/chunk-*.json; do
  [ -f "$chunk" ] || continue
  name=$(basename "$chunk")
  echo ""
  echo "========================================="
  echo "  Processing: $name  ($(date '+%H:%M:%S'))"
  echo "========================================="
  $NODE "$SCRIPT_DIR/rescrape-affected-chunk.mjs" "$chunk" 2>&1
  echo ""
  echo "  Finished: $name at $(date '+%H:%M:%S')"
done

echo ""
echo "ALL CHUNKS COMPLETE at $(date)"
