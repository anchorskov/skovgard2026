#!/usr/bin/env bash
# scripts/deploy_results.sh
# Canonical deploy for the standalone skovgard-results Worker.

set -euo pipefail

EXPECTED_WORKER="skovgard-results"

status() { printf "[%s] %s\n" "$(date +"%H:%M:%S")" "$1"; }
fail() { printf "Error: %s\n" "$1" >&2; exit 1; }

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
results_dir="${repo_root}/Results"

[[ -f "${results_dir}/wrangler.toml" ]] || fail "Results/wrangler.toml not found"
[[ -x "${results_dir}/node_modules/.bin/wrangler" ]] \
  || fail "Results Wrangler is not installed; run npm install in Results first"

grep -q '^name = "skovgard-results"$' "${results_dir}/wrangler.toml" \
  || fail "Production Worker name '${EXPECTED_WORKER}' is not explicit in Results/wrangler.toml"

cd "${results_dir}"
status "Running Results tests"
npm test
status "Building production Worker bundle"
npm run build
status "Deploying Worker '${EXPECTED_WORKER}'"
npx --no-install wrangler deploy --env production --name "${EXPECTED_WORKER}" "$@"
status "Done. Verify the Worker health endpoint and Cron Trigger event history."
