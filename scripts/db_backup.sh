#!/usr/bin/env bash
# scripts/db_backup.sh
# Export a point-in-time SQL dump of one or more D1 databases.
# Run this before every migration. Exports are gitignored (PII).
#
# Usage:
#   ./scripts/db_backup.sh                  # backs up ballot_sources (production)
#   ./scripts/db_backup.sh all              # backs up all tracked databases
#   ./scripts/db_backup.sh ballot_sources   # explicit single database

set -euo pipefail

BACKUP_DIR="$(git rev-parse --show-toplevel)/backups"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"

mkdir -p "$BACKUP_DIR"

backup_db() {
  local db_name="$1"
  local out_file="${BACKUP_DIR}/${db_name}_${TIMESTAMP}.sql"
  echo "[$(date +%H:%M:%S)] Exporting ${db_name} → ${out_file}"
  npx wrangler d1 export "${db_name}" --remote --output "${out_file}" --skip-confirmation
  echo "[$(date +%H:%M:%S)] Done. $(wc -c < "${out_file}" | xargs) bytes written."
}

TARGET="${1:-ballot_sources}"

case "$TARGET" in
  all)
    backup_db "ballot_sources"
    backup_db "ballot_sources_preview"
    ;;
  *)
    backup_db "$TARGET"
    ;;
esac

echo ""
echo "Backups are gitignored. Store a copy off-repo before running migrations."
