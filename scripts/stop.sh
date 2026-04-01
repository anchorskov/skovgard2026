# scripts/stop.sh
#!/usr/bin/env bash
set -euo pipefail

SESSION_NAME="skovgard-dev"
PORTS=(1313 8787)
stopped_any=0

listener_pids() {
  local port="$1"

  if command -v ss >/dev/null 2>&1; then
    ss -ltnp 2>/dev/null | awk -v port="$port" '
      $4 ~ (":" port "$") {
        line = $0
        while (match(line, /pid=[0-9]+/)) {
          pid = substr(line, RSTART + 4, RLENGTH - 4)
          if (!seen[pid]++) print pid
          line = substr(line, RSTART + RLENGTH)
        }
      }
    '
    return
  fi

  if command -v lsof >/dev/null 2>&1; then
    lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | sort -u
  fi
}

stop_port_listener() {
  local port="$1"
  local pid
  local found=0

  while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue
    found=1
    stopped_any=1

    if kill "$pid" 2>/dev/null; then
      sleep 0.25
      if kill -0 "$pid" 2>/dev/null; then
        kill -9 "$pid" 2>/dev/null || true
      fi
      echo "Stopped listener on port ${port} (pid ${pid})."
    else
      echo "Could not stop listener on port ${port} (pid ${pid})."
    fi
  done < <(listener_pids "$port")

  if [[ "$found" -eq 0 ]]; then
    echo "No listener found on port ${port}."
  fi
}

if command -v tmux >/dev/null 2>&1; then
  if tmux has-session -t "${SESSION_NAME}" 2>/dev/null; then
    tmux kill-session -t "${SESSION_NAME}"
    echo "Stopped tmux session ${SESSION_NAME}."
    stopped_any=1
  else
    echo "tmux session ${SESSION_NAME} not found."
  fi
else
  echo "tmux is not installed; skipping tmux session shutdown."
fi

for port in "${PORTS[@]}"; do
  stop_port_listener "$port"
done

if [[ "$stopped_any" -eq 0 ]]; then
  echo "Nothing was running for the local dev environment."
fi
