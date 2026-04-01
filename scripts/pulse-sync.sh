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
SQL="$OUT/${STAMP}-consent_status.sql"
CSV="$OUT/${STAMP}-pulse-optins.csv"

# Optional: set WRANGLER_ENV=production (or preview) in your shell to select an env
WRANGLER_ENV="${WRANGLER_ENV:-}"
WRANGLER="${WRANGLER:-$ROOT/worker/node_modules/.bin/wrangler}"

mkdir -p "$OUT" "$DATA"

echo "[1/3] Exporting D1 consent_status to SQL..."
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
  "$WRANGLER" d1 export ballot_sources --remote -e "$WRANGLER_ENV" --table=consent_status --output "$SQL"
else
  "$WRANGLER" d1 export ballot_sources --remote --table=consent_status --output "$SQL"
fi

echo "[2/3] Rebuilding local SQLite..."
TMP="${DB}.tmp"
rm -f "$TMP"
sqlite3 "$TMP" < "$SQL"
mv -f "$TMP" "$DB"

echo "[3/3] Emitting CSV snapshot..."
sqlite3 -header -csv "$DB" "
SELECT
  id,
  COALESCE(first_name, '') AS first_name,
  COALESCE(last_name, '') AS last_name,
  TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) AS name,
  CASE
    WHEN phone_e164 LIKE '+1%' AND LENGTH(phone_e164) = 12 THEN SUBSTR(phone_e164, 3)
    WHEN phone_e164 LIKE '+%' THEN SUBSTR(phone_e164, 2)
    ELSE phone_e164
  END AS phone,
  COALESCE(email, '') AS email,
  CASE
    WHEN status = 'opted_in' THEN 1
    WHEN status = 'opted_out' THEN 0
    WHEN consented_at IS NOT NULL AND (revoked_at IS NULL OR consented_at >= revoked_at) THEN 1
    ELSE 0
  END AS consent,
  COALESCE(consent_email, 0) AS consent_email,
  COALESCE(wy_voter, 0) AS wy_voter,
  COALESCE(county, '') AS county,
  COALESCE(zip, '') AS zip,
  COALESCE(consent_version, '') AS consent_version,
  CASE
    WHEN consent_version LIKE 'inbound-sms-%' THEN 'skovgard2026:inbound_sms'
    WHEN consent_version LIKE 'donate-%' THEN 'skovgard2026:donate'
    WHEN COALESCE(wy_voter, 0) = 1 OR county IS NOT NULL OR zip IS NOT NULL OR address1 IS NOT NULL OR city IS NOT NULL THEN 'skovgard2026:pulse'
    WHEN source = 'web_form' AND source_detail = 'pulse' THEN 'skovgard2026:pulse'
    WHEN source = 'web_form' AND source_detail = 'donate' THEN 'skovgard2026:donate'
    WHEN source = 'inbound_sms' THEN 'skovgard2026:inbound_sms'
    ELSE COALESCE(NULLIF(source_detail, ''), source)
  END AS source,
  created_at,
  COALESCE(address1, '') AS address1,
  COALESCE(address2, '') AS address2,
  COALESCE(city, '') AS city,
  COALESCE(state, '') AS state,
  COALESCE(country, '') AS country,
  COALESCE(state_house_district, '') AS state_house_district,
  COALESCE(state_senate_district, '') AS state_senate_district
FROM consent_status
WHERE consent_version IS NOT NULL
ORDER BY datetime(COALESCE(consented_at, created_at)) DESC, id DESC;
" > "$CSV"

ROWS=$(sqlite3 "$DB" "SELECT COUNT(*) FROM consent_status WHERE consent_version IS NOT NULL;")

echo "Done."
echo "Local DB: $DB"
echo "SQL dump: $SQL"
echo "CSV file: $CSV"
echo "Rows exported: $ROWS"
