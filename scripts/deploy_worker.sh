#!/usr/bin/env bash
set -euo pipefail

WORKER_NAME="skovgard2026-api"
WORKER_ENV="production"

status() {
  printf "[%s] %s\n" "$(date +"%H:%M:%S")" "$1"
}

fail() {
  printf "Error: %s\n" "$1" >&2
  exit 1
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
worker_dir="${repo_root}/worker"

if [[ ! -d "${worker_dir}" ]]; then
  fail "worker directory not found at ${worker_dir}"
fi

if [[ ! -f "${worker_dir}/wrangler.toml" ]]; then
  fail "worker/wrangler.toml not found"
fi

if ! command -v node >/dev/null 2>&1; then
  fail "node not found in PATH"
fi

if ! command -v npx >/dev/null 2>&1; then
  fail "npx not found in PATH"
fi

configured_name="$(sed -n 's/^name = "\(.*\)"/\1/p' "${worker_dir}/wrangler.toml" | head -n 1)"
if [[ "${configured_name}" != "${WORKER_NAME}" ]]; then
  fail "worker/wrangler.toml name is '${configured_name}', expected '${WORKER_NAME}'"
fi

cd "${worker_dir}"
status "Deploying Worker ${WORKER_NAME} with --env ${WORKER_ENV} and explicit --name"
npx wrangler deploy --env "${WORKER_ENV}" --name "${WORKER_NAME}" "$@"
