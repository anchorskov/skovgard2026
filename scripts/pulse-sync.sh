#!/usr/bin/env bash
set -euo pipefail

STAMP=$(date +%Y-%m-%d_%H-%M-%S)

ROOT="$HOME/projects/skovgard2026"               # repo
DATA_ROOT="$HOME/projects/data/skovgard2026"     # outside Git
OUT="$DATA_ROOT/backups/d1"
DATA="$DATA_ROOT/data"
DB="$DATA/pulse_local.sqlite"
SQL="$OUT/${STAMP}-sms_optins.sql"
CSV="$OUT/${STAMP}-sms_optins.csv"

# Optional: set WRANGLER_ENV=production (or preview) in your shell to select an env
WRANGLER_ENV="${WRANGLER_ENV:-}"

mkdir -p "$OUT" "$DATA"

echo "[1/3] Exporting D1 sms_optins to SQL..."
cd "$ROOT/worker"

# Use pinned, non-interactive Wrangler to avoid prompts
# If you prefer global wrangler, replace the npx line with: wrangler d1 export ...
if [[ -n "$WRANGLER_ENV" ]]; then
  npx -y wrangler@4.40.2 d1 export ballot_sources --remote -e "$WRANGLER_ENV" --table=sms_optins --output "$SQL"
else
  npx -y wrangler@4.40.2 d1 export ballot_sources --remote --table=sms_optins --output "$SQL"
fi

echo "[2/3] Rebuilding local SQLite..."
TMP="${DB}.tmp"
rm -f "$TMP"
sqlite3 "$TMP" < "$SQL"
mv -f "$TMP" "$DB"

echo "[3/3] Emitting CSV snapshot..."
sqlite3 -header -csv "$DB" "SELECT * FROM sms_optins;" > "$CSV"

ROWS=$(sqlite3 "$DB" "SELECT COUNT(*) FROM sms_optins;")

echo "Done."
echo "Local DB: $DB"
echo "SQL dump: $SQL"
echo "CSV file: $CSV"
echo "Rows exported: $ROWS"
