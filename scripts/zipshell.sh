#!/usr/bin/env bash
set -euo pipefail

# Resolve repo root and move there
cd "$(git rev-parse --show-toplevel)"

# Date stamp (allow override: DATE=YYYY-MM-DD scripts/zipshell.sh)
DATE="${DATE:-$(date +%F)}"
OUT="optin-review-${DATE}.zip"
MAN="optin-review-manifest-${DATE}.txt"

# Files we want to review/package
files=(
  "static/js/pulse-optin.js"
  "static/js/env.js"
  "static/css/forms.css"
  "layouts/partials/extend_head.html"
  "content/pulse/signup/index.html"
  "worker/src/index.js"
  "worker/wrangler.toml"
  # migrations & helper SQL (adjust if your filenames differ)
  "worker/migrations"
  # optional local dev vars (include only if present; safe to skip)
  ".dev.vars"
  # project instructions
  "ProjectInstructions_FileChanges.md"
)

echo "DATE=${DATE}"

# Check for missing paths
missing=0
for f in "${files[@]}"; do
  if [[ ! -e "$f" ]]; then
    echo "MISSING: $f"
    ((missing++)) || true
  fi
done

# Create a manifest (lists included & missing files)
{
  echo "# optin review manifest ${DATE}"
  echo "# repo: $(basename "$(git rev-parse --show-toplevel)")"
  echo "# branch: $(git rev-parse --abbrev-ref HEAD)"
  echo
  echo "Included paths:"
  for f in "${files[@]}"; do echo " - $f"; done
  echo
  echo "Missing count: ${missing}"
} > "${MAN}"

# Zip the existing ones + manifest (keep paths)
echo "Creating ${OUT}…"
zip -9 -r "${OUT}" "${MAN}" $(printf '%s\n' "${files[@]}" | xargs -I{} bash -c '[[ -e "{}" ]] && printf "%q " "{}"')

echo
echo "== Zip contents =="
unzip -l "${OUT}"

echo
echo "== Quick scan (Turnstile/CORS/opt-in hooks) =="
# ripgrep summary (safe if rg missing)
if command -v rg >/dev/null 2>&1; then
  rg -n --hidden -S \
    -e "verifyTurnstile|siteverify|cf-turnstile|ts-slot|turnstile_token|TS_ALLOWED_HOSTNAMES|CORS_ORIGINS|/api/optin|optin-submit|ts_start" \
    static/js/pulse-optin.js \
    worker/src/index.js \
    content/pulse/signup/index.html \
    layouts/partials/extend_head.html \
    worker/wrangler.toml || true
else
  echo "(rg not found; skipping quick scan)"
fi

echo
echo "Wrote: ${OUT}"
echo "Manifest: ${MAN}"
