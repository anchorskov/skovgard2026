# scripts/deploy_cf.sh
#!/usr/bin/env bash
set -euo pipefail

SITE_OUTPUT_DIR="dist"

status() {
  printf "[%s] %s\n" "$(date +"%H:%M:%S")" "$1"
}

fail() {
  printf "Error: %s\n" "$1" >&2
  exit 1
}

ensure_node_runtime() {
  if [[ -f ".nvmrc" && -s "${HOME}/.nvm/nvm.sh" ]]; then
    # shellcheck disable=SC1090
    source "${HOME}/.nvm/nvm.sh"
    nvm use >/dev/null
  fi

  if ! command -v node >/dev/null 2>&1; then
    fail "node not found in PATH"
  fi

  if ! node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 12) ? 0 : 1)'; then
    fail "Node $(node -p 'process.versions.node') is too old for Astro. Use Node 22.12.0 or newer."
  fi
}

git_dirty() {
  git diff --quiet && git diff --cached --quiet
}

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  fail "not in a git repository"
fi

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"
ensure_node_runtime

if [[ -n "${DEPLOY_HOOK_URL:-}" ]]; then
  status "Posting deploy hook"
  curl -sS -X POST "$DEPLOY_HOOK_URL" >/dev/null
  status "Deploy hook posted"
  exit 0
fi

if [[ "${DIRECT:-0}" == "1" ]]; then
  if ! command -v npx >/dev/null 2>&1; then
    fail "npx not found in PATH (required for DIRECT=1)"
  fi
  if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
    if [[ -f "package-lock.json" ]]; then
      status "Installing dependencies with npm ci"
      npm ci
    else
      status "Installing dependencies with npm install"
      npm install
    fi
    status "Building"
    npm run build
  fi
  if [[ ! -d "${SITE_OUTPUT_DIR}" ]]; then
    fail "build output folder missing: ./${SITE_OUTPUT_DIR}"
  fi
  if [[ ! -x "node_modules/.bin/wrangler" ]]; then
    fail "project-local Wrangler not installed; run npm ci before using SKIP_BUILD=1"
  fi
  status "Deploying directly with project-local wrangler"
  npx --no-install wrangler pages deploy "${SITE_OUTPUT_DIR}" --project-name skovgard2026 --branch main
  status "Direct deploy completed"
  exit 0
fi

status "Checking out main"
current_branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$current_branch" != "main" ]]; then
  git checkout main
fi

if ! git_dirty || [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
  if [[ "${AUTO_COMMIT:-0}" == "1" ]]; then
    status "Staging local changes"
    git add -A
    commit_msg="${COMMIT_MSG:-deploy: update site}"
    if git diff --cached --quiet; then
      status "No changes to commit"
    else
      status "Committing changes"
      git commit -m "$commit_msg"
    fi
  else
    status "Warning: local changes detected (not committing). Set AUTO_COMMIT=1 to commit automatically."
  fi
fi

status "Pulling latest from origin/main"
if ! git pull --rebase origin main; then
  fail "rebase failed, resolve conflicts then rerun scripts/deploy_cf.sh"
fi

if [[ -f "package-lock.json" ]]; then
  status "Installing dependencies with npm ci"
  npm ci
else
  status "Installing dependencies with npm install"
  npm install
fi

status "Building"
npm run build

if [[ ! -d "${SITE_OUTPUT_DIR}" ]]; then
  fail "build output folder missing: ./${SITE_OUTPUT_DIR}"
fi

status "Pushing to origin/main"
if git diff --quiet origin/main...HEAD; then
  status "No new commit to push"
else
  git push origin main
fi

status "Deploy complete"
