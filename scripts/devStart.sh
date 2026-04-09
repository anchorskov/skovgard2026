# scripts/devStart.sh
#!/usr/bin/env bash
# Astro branch — replaces hugo server with npm run dev
set -euo pipefail

SESSION_NAME="skovgard-dev"
REPO_ROOT="/home/anchor/projects/skovgard2026"
WORKER_DIR="${REPO_ROOT}/worker"
WRANGLER_DB="ballot_sources"
ASTRO_PORT="4321"

if ! command -v tmux >/dev/null 2>&1; then
  echo "tmux is required. Install it and try again."
  exit 1
fi

if tmux has-session -t "${SESSION_NAME}" 2>/dev/null; then
  echo "tmux session ${SESSION_NAME} already exists."
  echo "Attach with: tmux attach -t ${SESSION_NAME}"
  exit 0
fi

# Load nvm so npm is available inside tmux
NVM_INIT='source /home/anchor/.nvm/nvm.sh && nvm use 22'

# Window 0: Astro dev server
tmux new-session -d -s "${SESSION_NAME}" -x 220 -y 50 -c "${REPO_ROOT}" \
  "bash -c '${NVM_INIT} && npm run dev'"

# Window 1: Wrangler (local Worker + D1)
tmux new-window -t "${SESSION_NAME}" -c "${WORKER_DIR}" -n "wrangler"
tmux send-keys -t "${SESSION_NAME}:wrangler" \
  "bash -c '${NVM_INIT} && npx wrangler d1 migrations apply ${WRANGLER_DB} --local && npx wrangler dev'" Enter

tmux select-window -t "${SESSION_NAME}:0"

sleep 6

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Checking server startup status..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

ASTRO_OUTPUT=$(tmux capture-pane -t "${SESSION_NAME}:0" -p | tail -20)
if echo "$ASTRO_OUTPUT" | grep -qi "error\|failed"; then
  echo "Astro startup may have failed — check window 0."
  ASTRO_OK=0
else
  echo "Astro dev server -> http://localhost:${ASTRO_PORT}"
  ASTRO_OK=1
fi

WRANGLER_OUTPUT=$(tmux capture-pane -t "${SESSION_NAME}:1" -p | tail -20)
if echo "$WRANGLER_OUTPUT" | grep -q "Ready on\|listening\|localhost:8787"; then
  echo "Wrangler Worker  -> http://localhost:8787"
  WRANGLER_OK=1
else
  echo "Wrangler still initializing (check window 1)"
  WRANGLER_OK=1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Started tmux session '${SESSION_NAME}' with 2 windows:"
echo "   Window 0 (astro):    http://localhost:${ASTRO_PORT}"
echo "   Window 1 (wrangler): http://localhost:8787"
echo ""
echo "Commands:"
echo "   Attach:  tmux attach -t ${SESSION_NAME}"
echo "   Stop:    bash scripts/stop.sh"
echo ""

if [ "${ASTRO_OK}" -eq 0 ]; then
  echo "Astro failed to start. Run: tmux attach -t ${SESSION_NAME}"
  exit 1
fi

echo "Servers are ready."
