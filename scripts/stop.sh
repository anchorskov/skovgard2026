# scripts/stop.sh
#!/usr/bin/env bash
set -euo pipefail

SESSION_NAME="skovgard-dev"

if ! command -v tmux >/dev/null 2>&1; then
  echo "tmux is required to stop the session."
  exit 1
fi

if tmux has-session -t "${SESSION_NAME}" 2>/dev/null; then
  tmux kill-session -t "${SESSION_NAME}"
  echo "Stopped tmux session ${SESSION_NAME}."
else
  echo "tmux session ${SESSION_NAME} not found."
fi
