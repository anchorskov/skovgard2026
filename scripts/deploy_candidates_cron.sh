#!/usr/bin/env bash
# scripts/deploy_candidates_cron.sh
#
# Deploys skovgard-candidates-cron — the cron-only Worker that purges
# ballot-recovery data (Candidates/cron/). This is a separate Worker from
# skovgard-candidates; see Candidates/cron/wrangler.toml and
# Candidates/docs/ballot_recovery.md for why. No build step: it's a single
# plain JS file, deployed with the Candidates project's pinned Wrangler.
#
# Usage:
#   ./scripts/deploy_candidates_cron.sh

set -euo pipefail

EXPECTED_WORKER="skovgard-candidates-cron"

status() { printf "[%s] %s\n" "$(date +"%H:%M:%S")" "$1"; }
fail()   { printf "Error: %s\n" "$1" >&2; exit 1; }

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cron_dir="${repo_root}/Candidates/cron"
candidates_dir="${repo_root}/Candidates"

[[ -f "${cron_dir}/wrangler.toml" ]] \
  || fail "Candidates/cron/wrangler.toml not found"

configured_name="$(sed -n 's/^name = "\(.*\)"/\1/p' "${cron_dir}/wrangler.toml" | head -n 1)"
[[ "${configured_name}" == "${EXPECTED_WORKER}" ]] \
  || fail "Candidates/cron/wrangler.toml name is '${configured_name}', expected '${EXPECTED_WORKER}'"

if grep -q '^\[env\.production\]' "${cron_dir}/wrangler.toml"; then
  fail "[env.production] found in Candidates/cron/wrangler.toml — remove it or update this script."
fi

wrangler_bin="${candidates_dir}/node_modules/.bin/wrangler"
[[ -x "${wrangler_bin}" ]] \
  || fail "Candidates/node_modules/.bin/wrangler not found — run npm install in Candidates/ first (this Worker reuses that pinned Wrangler; it has no package.json of its own)."

cd "${cron_dir}"
status "Deploying Worker '${EXPECTED_WORKER}'"
# --config is required: without it, Wrangler's config auto-discovery walks up
# to Candidates/.wrangler/deploy/config.json (a stale artifact left by the
# Astro adapter's own build) and refuses to run, since that file and this
# directory's wrangler.toml don't share a base path.
"${wrangler_bin}" deploy --config ./wrangler.toml --name "${EXPECTED_WORKER}" "$@"
status "Done."
