#!/usr/bin/env bash
# Skovgard2026 snapshot generator
# Purpose: mirror the active local repo into dated snapshots for ChatGPT
# Outputs (in repo root):
#   tree-YYYY-MM-DD.txt
#   site-review-YYYY-MM-DD.zip
#   site-bundle-YYYY-MM-DD.txt
#   site-binary-assets-YYYY-MM-DD.txt
#   site-zip-manifest-YYYY-MM-DD.csv
# Optional:
#   site-all-YYYY-MM-DD.zip  (enable with --full)

set -euo pipefail

# ---------- Config ----------
PROJECT_ROOT="${PROJECT_ROOT:-/home/anchor/projects/skovgard2026}"
DATE="${DATE:-$(date +%F)}"
STAGE_DIR="$PROJECT_ROOT/.tmp/site"

# Roots to include. Append via SKOV_EXTRA_ROOTS="foo bar"
ROOTS=(config content layouts static archetypes worker data docs)
if [[ "${SKOV_EXTRA_ROOTS:-}" != "" ]]; then
  # shellcheck disable=SC2206
  EXTRA=(${SKOV_EXTRA_ROOTS})
  ROOTS+=("${EXTRA[@]}")
fi

FULL_ZIP="0"
if [[ "${1:-}" == "--full" ]]; then
  FULL_ZIP="1"
fi

# ---------- Helpers ----------
need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1"; exit 1; }; }
say() { printf "\n%s\n" "==> $*"; }

# ---------- Checks ----------
need zip
need tree
need rsync
need sha256sum
need find
need awk
need stat

if [[ ! -d "$PROJECT_ROOT" ]]; then
  echo "Project root not found: $PROJECT_ROOT"
  exit 1
fi

cd "$PROJECT_ROOT"

say "Config"
echo "PROJECT_ROOT=$PROJECT_ROOT"
echo "DATE=$DATE"
echo "STAGE_DIR=$STAGE_DIR"
echo "ROOTS=${ROOTS[*]}"

# ---------- Stage a clean copy ----------
say "Stage clean copy at $STAGE_DIR"
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR"

for d in "${ROOTS[@]}"; do
  if [[ -d "$d" ]]; then
    say "Rsync $d/"
    rsync -a --delete \
      --exclude '.git/' \
      --exclude 'public/' \
      --exclude 'resources/' \
      --exclude '**/.DS_Store' \
      --exclude '**/node_modules/' \
      "$d"/ "$STAGE_DIR/$d"/
  fi
done

# ---------- Tree snapshot ----------
say "Generate tree-$DATE.txt"
tree archetypes config content layouts static worker docs -L 4 > "tree-$DATE.txt" || true

# ---------- Review zip ----------
say "Create site-review-$DATE.zip"
zip -r "site-review-$DATE.zip" \
  "config/_default/config.toml" \
  "content" \
  "layouts" \
  "static/css" \
  "static/js" \
  "static/images" \
  "static/finance" \
  "data" \
  "archetypes" \
  "worker" \
  "docs" \
  -x "public/*" "resources/*" ".git/*" "**/.DS_Store" "**/node_modules/*" || true

# ---------- Text bundle ----------
say "Create site-bundle-$DATE.txt"
find "$STAGE_DIR" -type f \
  \( -name "*.md" -o -name "*.html" -o -name "*.css" -o -name "*.js" -o -name "*.toml" -o -name "*.yaml" -o -name "*.yml" \) \
  | LC_ALL=C sort \
  | while read -r f; do
      rel="${f#"$STAGE_DIR/"}"
      echo "============================================================"
      echo ">>> FILE: $rel"
      echo "============================================================"
      cat "$f"
      echo
    done > "site-bundle-$DATE.txt"

# ---------- Binary assets index ----------
say "Create site-binary-assets-$DATE.txt"
find "$STAGE_DIR/static" -type f \
  \( -iname "*.pdf" -o -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" -o -iname "*.gif" -o -iname "*.webp" \) \
  | LC_ALL=C sort > "site-binary-assets-$DATE.txt" || true

# ---------- CSV manifest with sha256 ----------
say "Create site-zip-manifest-$DATE.csv"
echo "path,size_bytes,mtime_epoch,sha256" > "site-zip-manifest-$DATE.csv"
(
  cd "$STAGE_DIR"
  find . -type f \
    ! -path "./.git/*" ! -path "./public/*" ! -path "./**/node_modules/*" \
    -printf "%p\n" \
  | LC_ALL=C sort \
  | while read -r p; do
      sz=$(stat -c '%s' "$p")
      mt=$(stat -c '%Y' "$p")
      sh=$(sha256sum "$p" | awk '{print $1}')
      clean="${p#./}"
      echo "$clean,$sz,$mt,$sh"
    done
) >> "../site-zip-manifest-$DATE.csv"

# ---------- Optional full zip ----------
if [[ "$FULL_ZIP" == "1" ]]; then
  say "Create site-all-$DATE.zip"
  zip -r "site-all-$DATE.zip" \
    archetypes config content layouts static worker data docs \
    -x "public/*" ".git/*" "**/.DS_Store" "**/node_modules/*" || true
fi

# ---------- Summary ----------
say "Done"
ls -lh "tree-$DATE.txt" \
       "site-review-$DATE.zip" \
       "site-bundle-$DATE.txt" \
       "site-binary-assets-$DATE.txt" \
       "site-zip-manifest-$DATE.csv" \
       2>/dev/null || true

echo
echo "Upload these into ChatGPT:"
echo "  site-review-$DATE.zip"
echo "  site-bundle-$DATE.txt"
echo "  site-binary-assets-$DATE.txt"
echo "  site-zip-manifest-$DATE.csv"
echo "  tree-$DATE.txt"
echo
echo "Tip: run with --full to also produce site-all-$DATE.zip"
