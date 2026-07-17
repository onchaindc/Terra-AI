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

activate_agent_id="${TERRA_ACTIVATE_AGENT_ID:-}"
activation_marker="/data/.terra-agent-${activate_agent_id}-activated"

if [[ -n "${activate_agent_id}" && ! -f "${activation_marker}" ]]; then
  echo "[terra-a2a] Starting the responder before activating agent #${activate_agent_id}."
  okx-a2a run --provider codex &
  responder_pid=$!

  cleanup() {
    kill "${responder_pid}" 2>/dev/null || true
    wait "${responder_pid}" 2>/dev/null || true
  }
  trap cleanup EXIT INT TERM

  ready=0
  for _ in $(seq 1 60); do
    if okx-a2a doctor --json 2>/dev/null | grep -q '"ready":true'; then
      ready=1
      break
    fi
    sleep 2
  done

  if [[ "${ready}" -ne 1 ]]; then
    echo "[terra-a2a] The responder did not become ready for activation."
    exit 1
  fi

  if activation_output="$(
    onchainos agent activate \
      --agent-id "${activate_agent_id}" \
      --preferred-language "${TERRA_PREFERRED_LANGUAGE:-en-US}" 2>&1
  )"; then
    echo "[terra-a2a] ${activation_output}"
    touch "${activation_marker}"
    echo "[terra-a2a] Agent #${activate_agent_id} activation completed."
  else
    echo "[terra-a2a] Agent #${activate_agent_id} activation failed: ${activation_output}"
    exit 1
  fi

  trap - EXIT INT TERM
  wait "${responder_pid}"
  exit $?
fi

echo "[terra-a2a] Starting the Terra AI A2A responder."
exec okx-a2a run --provider codex
