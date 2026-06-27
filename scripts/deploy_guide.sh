#!/usr/bin/env bash
# scripts/deploy_guide.sh
#
# Canonical deploy for guide.skovgard2026.org.
# Builds the Astro SSR project (including the postbuild-pages shim), then
# deploys to the skovgard-guide Cloudflare Pages project.
#
# Usage:
#   ./scripts/deploy_guide.sh                 # install + build + deploy
#   SKIP_BUILD=1 ./scripts/deploy_guide.sh    # deploy existing dist/client/ (faster)
#
# Extra args are passed through to wrangler pages deploy, e.g.:
#   ./scripts/deploy_guide.sh --commit-message "rubric admin"

set -euo pipefail

EXPECTED_PAGES_PROJECT="skovgard-guide"

status() { printf "[%s] %s\n" "$(date +"%H:%M:%S")" "$1"; }
fail()   { printf "Error: %s\n" "$1" >&2; exit 1; }

# ── locate directories ────────────────────────────────────────────────────────
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
guide_dir="${repo_root}/Guide"

[[ -d "${guide_dir}" ]] \
  || fail "Guide/ directory not found at ${guide_dir}"
[[ -f "${guide_dir}/wrangler.toml" ]] \
  || fail "Guide/wrangler.toml not found"

# ── validate wrangler.toml ────────────────────────────────────────────────────
configured_name="$(sed -n 's/^name = "\(.*\)"/\1/p' "${guide_dir}/wrangler.toml" | head -n 1)"
[[ "${configured_name}" == "${EXPECTED_PAGES_PROJECT}" ]] \
  || fail "Guide/wrangler.toml name is '${configured_name}', expected '${EXPECTED_PAGES_PROJECT}'"

# Guard: an [env.production] block would change Wrangler's behavior and may
# deploy as skovgard-guide-production instead of skovgard-guide.
if grep -q '^\[env\.production\]' "${guide_dir}/wrangler.toml"; then
  fail "[env.production] found in Guide/wrangler.toml — remove it or update this script."
fi

# ── postbuild script must exist ───────────────────────────────────────────────
[[ -f "${guide_dir}/scripts/postbuild-pages.mjs" ]] \
  || fail "Guide/scripts/postbuild-pages.mjs not found — _worker.js shim cannot be built"

# ── runtime checks ────────────────────────────────────────────────────────────
command -v node >/dev/null 2>&1 || fail "node not found in PATH"
command -v npx  >/dev/null 2>&1 || fail "npx not found in PATH"

cd "${guide_dir}"

# ── build ─────────────────────────────────────────────────────────────────────
if [[ "${SKIP_BUILD:-0}" == "1" ]]; then
  status "Skipping build (SKIP_BUILD=1)"
  [[ -d "dist/client" ]] || fail "Guide/dist/client/ not found — run without SKIP_BUILD=1 first"
  [[ -f "dist/client/_worker.js" ]] \
    || fail "Guide/dist/client/_worker.js missing — postbuild-pages.mjs may not have run"
else
  if [[ -f "package-lock.json" ]]; then
    status "Installing dependencies (npm ci)"
    npm ci
  else
    status "Installing dependencies (npm install)"
    npm install
  fi
  status "Building Guide site (astro build + postbuild-pages shim)"
  npm run build
  [[ -d "dist/client" ]]       || fail "Build failed — Guide/dist/client/ not found"
  [[ -f "dist/client/_worker.js" ]] \
    || fail "postbuild-pages.mjs did not create dist/client/_worker.js"
fi

# ── deploy ────────────────────────────────────────────────────────────────────
# --project-name is explicit so a wrangler.toml change cannot silently retarget
# a different Pages project.
status "Deploying Pages project '${EXPECTED_PAGES_PROJECT}' from dist/client/"
npx wrangler pages deploy ./dist/client \
  --project-name="${EXPECTED_PAGES_PROJECT}" \
  "$@"

status "Done. Smoke test:"
status "  curl -I https://guide.skovgard2026.org/"
status "  curl -I https://guide.skovgard2026.org/admin/rubric/index.html"
