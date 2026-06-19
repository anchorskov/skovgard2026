#!/usr/bin/env bash
# scripts/deploy_candidates.sh
#
# Canonical deploy for candidates.skovgard2026.org.
# Builds the Astro SSR project then deploys the skovgard-candidates Worker
# using the top-level wrangler.toml config (production defaults, no --env flag).
#
# Usage:
#   ./scripts/deploy_candidates.sh            # install + build + deploy
#   SKIP_BUILD=1 ./scripts/deploy_candidates.sh  # deploy existing dist/ (faster)
#
# Extra args are passed through to wrangler deploy, e.g.:
#   ./scripts/deploy_candidates.sh --dry-run

set -euo pipefail

EXPECTED_WORKER="skovgard-candidates"

status() { printf "[%s] %s\n" "$(date +"%H:%M:%S")" "$1"; }
fail()   { printf "Error: %s\n" "$1" >&2; exit 1; }

# ── locate directories ────────────────────────────────────────────────────────
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
candidates_dir="${repo_root}/Candidates"

[[ -d "${candidates_dir}" ]] \
  || fail "Candidates/ directory not found at ${candidates_dir}"
[[ -f "${candidates_dir}/wrangler.toml" ]] \
  || fail "Candidates/wrangler.toml not found"

# ── validate wrangler.toml ────────────────────────────────────────────────────
configured_name="$(sed -n 's/^name = "\(.*\)"/\1/p' "${candidates_dir}/wrangler.toml" | head -n 1)"
[[ "${configured_name}" == "${EXPECTED_WORKER}" ]] \
  || fail "Candidates/wrangler.toml name is '${configured_name}', expected '${EXPECTED_WORKER}'"

# Guard: an [env.production] block would change binding resolution and may cause
# Wrangler to deploy as skovgard-candidates-production instead.
if grep -q '^\[env\.production\]' "${candidates_dir}/wrangler.toml"; then
  fail "[env.production] found in Candidates/wrangler.toml — remove it or update this script."
fi

# ── runtime checks ────────────────────────────────────────────────────────────
command -v node >/dev/null 2>&1 || fail "node not found in PATH"
command -v npx  >/dev/null 2>&1 || fail "npx not found in PATH"

cd "${candidates_dir}"

# ── build ─────────────────────────────────────────────────────────────────────
if [[ "${SKIP_BUILD:-0}" == "1" ]]; then
  status "Skipping build (SKIP_BUILD=1)"
  [[ -d "dist" ]] || fail "Candidates/dist/ not found — run without SKIP_BUILD=1 first"
else
  if [[ -f "package-lock.json" ]]; then
    status "Installing dependencies (npm ci)"
    npm ci
  else
    status "Installing dependencies (npm install)"
    npm install
  fi
  status "Building Candidates site"
  npm run build
  [[ -d "dist" ]] || fail "Build failed — Candidates/dist/ not found"
fi

# ── deploy ────────────────────────────────────────────────────────────────────
# --name is explicit so future wrangler.toml changes cannot silently rename the Worker.
# No --env flag: the top-level [vars] block in wrangler.toml IS the production config.
status "Deploying Worker '${EXPECTED_WORKER}'"
npx wrangler deploy --name "${EXPECTED_WORKER}" "$@"

status "Done. Smoke test:"
status "  curl -s -X POST https://candidates.skovgard2026.org/api/ballot-lookup \\"
status "    -H 'content-type: application/json' \\"
status "    -d '{\"houseNumber\":\"1402\",\"street\":\"Heart Mountain St\",\"city\":\"Cody\",\"zip\":\"82414\"}' | python3 -m json.tool | head -10"
