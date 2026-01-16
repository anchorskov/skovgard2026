# scripts/devStart.sh
#!/usr/bin/env bash
set -euo pipefail

SESSION_NAME="skovgard-dev"
REPO_ROOT="/home/anchor/projects/skovgard2026"
WORKER_DIR="${REPO_ROOT}/worker"
WRANGLER_CONFIG="${WORKER_DIR}/wrangler.toml"
HUGO_PORT="1313"
PUBLIC_PORT="1314"
CADDY_CONFIG="${REPO_ROOT}/Caddyfile"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

if ! command -v tmux >/dev/null 2>&1; then
  echo "tmux is required. Install it and try again."
  exit 1
fi

if ! command -v caddy >/dev/null 2>&1; then
  echo "caddy is required for local proxying. Install it and try again."
  exit 1
fi

if tmux has-session -t "${SESSION_NAME}" 2>/dev/null; then
  echo "tmux session ${SESSION_NAME} already exists."
  echo "Attach with: tmux attach -t ${SESSION_NAME}"
  exit 0
fi

# Create new session with Hugo window
tmux new-session -d -s "${SESSION_NAME}" -x 200 -y 50 -c "${REPO_ROOT}" "hugo server -D --port ${HUGO_PORT}"

# Add Wrangler window and start the process
tmux new-window -t "${SESSION_NAME}" -c "${WORKER_DIR}" -n "wrangler"
tmux send-keys -t "${SESSION_NAME}:wrangler" "wrangler dev" Enter

# Add Caddy window for local proxying (requires root - skip for local dev)
# In production, use: sudo caddy run --config ${CADDY_CONFIG}
# For local testing, access Worker directly on port 8787
tmux new-window -t "${SESSION_NAME}" -c "${REPO_ROOT}" -n "caddy"
tmux send-keys -t "${SESSION_NAME}:caddy" "echo '⚠️  Caddy requires root (sudo) to run. For local dev, access:'; echo '  Hugo: http://localhost:1313'; echo '  Worker API: http://localhost:8787'; sleep 999" Enter

# Select layout
tmux select-layout -t "${SESSION_NAME}" even-horizontal

# Wait for servers to start and check for errors
sleep 7

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 Checking server startup status..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check Hugo window for errors
HUGO_OUTPUT=$(tmux capture-pane -t "${SESSION_NAME}:0" -p | tail -30)
if echo "$HUGO_OUTPUT" | grep -q "ERROR\|error"; then
  echo "Hugo startup failed."
  echo "   Last output:"
  echo "$HUGO_OUTPUT" | tail -5
  HUGO_OK=0
else
  if echo "$HUGO_OUTPUT" | grep -q "Web Server is available\|localhost:1313"; then
    echo "Hugo server started - http://localhost:${HUGO_PORT}"
    HUGO_OK=1
  else
    echo "Hugo still initializing."
    HUGO_OK=1
  fi
fi

# Check Wrangler window for errors
WRANGLER_OUTPUT=$(tmux capture-pane -t "${SESSION_NAME}:1" -p | tail -30)
if echo "$WRANGLER_OUTPUT" | grep -q "ERROR\|\[ERROR\]"; then
  echo "Wrangler startup failed."
  echo "   Last output:"
  echo "$WRANGLER_OUTPUT" | tail -5
  WRANGLER_OK=0
else
  if echo "$WRANGLER_OUTPUT" | grep -q "Ready on\|listening\|localhost:8787"; then
    echo "Wrangler server started - http://localhost:8787"
    WRANGLER_OK=1
  else
    echo "Wrangler still initializing."
    WRANGLER_OK=1
  fi
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Started tmux session ${SESSION_NAME} with 3 windows:"
echo "   Window 0 (hugo):     Hugo server     -> http://localhost:${HUGO_PORT}"
echo "   Window 1 (wrangler): Wrangler dev   -> http://localhost:8787"
echo "   Window 2 (caddy):    Proxy          -> http://localhost:${PUBLIC_PORT}"
echo ""
echo "Use http://localhost:${PUBLIC_PORT}/donateV1/ for same-origin API calls."
echo ""
echo "📋 Commands:"
echo "   Attach:  tmux attach -t ${SESSION_NAME}"
echo "   Stop:    bash scripts/stop.sh"
echo ""

if [ $HUGO_OK -eq 0 ] || [ $WRANGLER_OK -eq 0 ]; then
  echo "One or more servers failed to start. Check output above."
  echo "   Run: tmux attach -t ${SESSION_NAME} to see detailed logs"
  exit 1
fi

echo "Servers are ready."
