#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  pulse-sync.sh [--check]
EOF
}

MODE="run"
case "${1:-}" in
  "") ;;
  --check) MODE="check" ;;
  -h|--help) usage; exit 0 ;;
  *) usage >&2; exit 2 ;;
esac

STAMP=$(date +%Y-%m-%d_%H-%M-%S)

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${ROOT:-$(cd -- "$SCRIPT_DIR/.." && pwd)}"
DATA_ROOT="${DATA_ROOT:-$HOME/projects/data/$(basename "$ROOT")}"
OUT="${OUT:-$DATA_ROOT/backups/d1}"
DATA="${DATA:-$DATA_ROOT/data}"
MANIFEST="$ROOT/worker/package.json"
LOCKFILE="$ROOT/worker/package-lock.json"
DB="$DATA/pulse_local.sqlite"
SQL="$OUT/${STAMP}-sms_optins.sql"
CSV="$OUT/${STAMP}-sms_optins.csv"

# Optional: set WRANGLER_ENV=production (or preview) in your shell to select an env
WRANGLER_ENV="${WRANGLER_ENV:-}"
WRANGLER="${WRANGLER:-$ROOT/worker/node_modules/.bin/wrangler}"

mkdir -p "$OUT" "$DATA"

echo "[1/3] Exporting D1 sms_optins to SQL..."
cd "$ROOT/worker"

if [[ ! -x "$WRANGLER" ]]; then
  echo "Missing wrangler CLI at $WRANGLER" >&2
  echo "Install project dependencies in $ROOT/worker before running this script." >&2
  exit 1
fi

if [[ ! -f "$LOCKFILE" ]]; then
  echo "Warning: missing dependency lockfile at $LOCKFILE" >&2
  echo "After dependency changes, run 'cd $ROOT/worker && npm install --package-lock-only --ignore-scripts' and review the lockfile." >&2
elif [[ "$MANIFEST" -nt "$LOCKFILE" ]]; then
  echo "Warning: $MANIFEST is newer than $LOCKFILE" >&2
  echo "After dependency changes, refresh and review package-lock.json before relying on this sync." >&2
fi

if [[ "$MODE" == "check" ]]; then
  echo "Using wrangler: $WRANGLER"
  "$WRANGLER" --version
  echo "Check-only mode: no remote export performed."
  exit 0
fi

if [[ -n "$WRANGLER_ENV" ]]; then
  "$WRANGLER" d1 export ballot_sources --remote -e "$WRANGLER_ENV" --table=sms_optins --output "$SQL"
else
  "$WRANGLER" d1 export ballot_sources --remote --table=sms_optins --output "$SQL"
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
