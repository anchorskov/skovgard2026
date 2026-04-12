# scripts/devStart.sh
#!/usr/bin/env bash
# Astro branch — replaces hugo server with npm run dev
set -euo pipefail

SESSION_NAME="skovgard-dev"
REPO_ROOT="/home/anchor/projects/skovgard2026"
WORKER_DIR="${REPO_ROOT}/worker"
WRANGLER_DB="ballot_sources"
ASTRO_PORT="4321"
WRANGLER_PORT="8787"

if ! command -v tmux >/dev/null 2>&1; then
  echo "tmux is required. Install it and try again."
  exit 1
fi

# Load nvm so npm is available inside tmux
NVM_INIT='source /home/anchor/.nvm/nvm.sh && nvm use 22'
ASTRO_CMD="bash -c '${NVM_INIT} && npm run dev'"
WRANGLER_CMD="bash -c '${NVM_INIT} && npx wrangler d1 migrations apply ${WRANGLER_DB} --local && npx wrangler dev'"

port_listening() {
  local port="$1"

  if command -v ss >/dev/null 2>&1; then
    ss -ltn 2>/dev/null | awk -v port="$port" '$4 ~ (":" port "$") { found=1 } END { exit found ? 0 : 1 }'
    return
  fi

  if command -v lsof >/dev/null 2>&1; then
    lsof -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
    return
  fi

  return 1
}

wait_for_port() {
  local port="$1"
  local timeout="${2:-15}"
  local elapsed=0

  while (( elapsed < timeout )); do
    if port_listening "$port"; then
      return 0
    fi
    sleep 1
    ((elapsed += 1))
  done

  return 1
}

ensure_window() {
  local index="$1"
  local name="$2"
  local cwd="$3"
  local cmd="$4"

  if tmux list-windows -t "${SESSION_NAME}" -F '#{window_name}' 2>/dev/null | grep -Fxq "${name}"; then
    tmux respawn-window -k -t "${SESSION_NAME}:${name}" -c "${cwd}" "${cmd}"
    return
  fi

  if tmux list-windows -t "${SESSION_NAME}" -F '#{window_index}' 2>/dev/null | grep -Fxq "${index}"; then
    tmux rename-window -t "${SESSION_NAME}:${index}" "${name}"
    tmux respawn-window -k -t "${SESSION_NAME}:${name}" -c "${cwd}" "${cmd}"
    return
  fi

  tmux new-window -d -t "${SESSION_NAME}:${index}" -n "${name}" -c "${cwd}" "${cmd}"
}

if tmux has-session -t "${SESSION_NAME}" 2>/dev/null; then
  echo "tmux session ${SESSION_NAME} already exists."
  echo "Ensuring Astro and Wrangler are both running..."
else
  tmux new-session -d -s "${SESSION_NAME}" -x 220 -y 50 -c "${REPO_ROOT}" "${ASTRO_CMD}"
fi

ensure_window 0 "astro" "${REPO_ROOT}" "${ASTRO_CMD}"
ensure_window 1 "wrangler" "${WORKER_DIR}" "${WRANGLER_CMD}"

tmux select-window -t "${SESSION_NAME}:0"

sleep 6

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Checking server startup status..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

ASTRO_OUTPUT=$(tmux capture-pane -t "${SESSION_NAME}:0" -p | tail -20)
if port_listening "${ASTRO_PORT}"; then
  echo "Astro dev server -> http://localhost:${ASTRO_PORT}"
  ASTRO_OK=1
elif echo "$ASTRO_OUTPUT" | grep -qi "error\|failed"; then
  echo "Astro startup may have failed — check window 0."
  ASTRO_OK=0
else
  echo "Astro is still starting (check window 0)."
  ASTRO_OK=0
fi

WRANGLER_OUTPUT=$(tmux capture-pane -t "${SESSION_NAME}:1" -p | tail -20)
if wait_for_port "${WRANGLER_PORT}" 15; then
  echo "Wrangler Worker  -> http://localhost:${WRANGLER_PORT}"
  WRANGLER_OK=1
elif echo "$WRANGLER_OUTPUT" | grep -qi "error\|failed"; then
  echo "Wrangler startup may have failed — check window 1."
  WRANGLER_OK=0
else
  echo "Wrangler still initializing (check window 1)"
  WRANGLER_OK=0
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Started tmux session '${SESSION_NAME}' with 2 windows:"
echo "   Window 0 (astro):    http://localhost:${ASTRO_PORT}"
echo "   Window 1 (wrangler): http://localhost:${WRANGLER_PORT}"
echo ""
echo "Commands:"
echo "   Attach:  tmux attach -t ${SESSION_NAME}"
echo "   Stop:    bash scripts/stop.sh"
echo ""

if [ "${ASTRO_OK}" -eq 0 ] || [ "${WRANGLER_OK}" -eq 0 ]; then
  echo "One or more local services failed to start cleanly. Run: tmux attach -t ${SESSION_NAME}"
  exit 1
fi

echo "Servers are ready."
