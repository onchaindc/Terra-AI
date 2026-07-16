#!/usr/bin/env bash
set -euo pipefail

mkdir -p \
  "${HOME}/.onchainos" \
  "${CODEX_HOME}" \
  "${OKX_AGENT_TASK_HOME}"

missing_auth=0

if [[ ! -f "${HOME}/.onchainos/session.json" ]]; then
  echo "[terra-a2a] Agentic Wallet login is required in this Railway service."
  missing_auth=1
fi

if [[ ! -f "${CODEX_HOME}/auth.json" ]]; then
  echo "[terra-a2a] Codex CLI login is required in this Railway service."
  missing_auth=1
fi

if [[ "${missing_auth}" -eq 1 ]]; then
  echo "[terra-a2a] Open a Railway SSH session and run:"
  echo "[terra-a2a]   onchainos wallet login"
  echo "[terra-a2a]   codex login --device-auth"
  echo "[terra-a2a] Then restart this service."
  exec sleep infinity
fi

echo "[terra-a2a] Starting the Terra AI A2A responder."
exec okx-a2a run --provider codex
