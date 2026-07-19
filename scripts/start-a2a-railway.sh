#!/usr/bin/env bash
set -euo pipefail

mkdir -p \
  "${HOME}/.onchainos" \
  "${CODEX_HOME}" \
  "${OKX_AGENT_TASK_HOME}"

node /app/scripts/a2a-health-server.js &
health_pid=$!

cleanup_health() {
  kill "${health_pid}" 2>/dev/null || true
  wait "${health_pid}" 2>/dev/null || true
}
trap cleanup_health EXIT INT TERM

okx-a2a config permissions --preset bypass

missing_auth=0

if [[ ! -f "${HOME}/.onchainos/session.json" ]]; then
  echo "[terra-a2a] Agentic Wallet login is required in this Railway service."
  missing_auth=1
fi

if [[ "${missing_auth}" -eq 1 ]]; then
  echo "[terra-a2a] Open a Railway SSH session and run:"
  echo "[terra-a2a]   onchainos wallet login"
  echo "[terra-a2a] Then restart this service."
  exec sleep infinity
fi

# The task home lives on a persistent Railway volume. A container replacement
# can leave its old daemon lock behind even though the old process is gone.
okx-a2a daemon stop >/dev/null 2>&1 || true
rm -f -- "${OKX_AGENT_TASK_HOME}/run/daemon.lock"

activate_agent_id="${TERRA_ACTIVATE_AGENT_ID:-}"
activation_nonce="${TERRA_ACTIVATION_NONCE:-}"
activation_marker="/data/.terra-agent-${activate_agent_id}${activation_nonce:+-${activation_nonce}}-activated"
inspect_agent_id="${TERRA_INSPECT_SERVICES_AGENT_ID:-}"
update_agent_id="${TERRA_UPDATE_LISTING_AGENT_ID:-}"
update_services_b64="${TERRA_UPDATE_LISTING_SERVICES_B64:-}"
update_marker="/data/.terra-agent-${update_agent_id}-listing-v2-updated"

if [[ -n "${update_agent_id}" && -n "${update_services_b64}" && ! -f "${update_marker}" ]]; then
  echo "[terra-a2a] Starting the responder before updating agent #${update_agent_id}."
  okx-a2a daemon stop >/dev/null 2>&1 || true
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
    echo "[terra-a2a] The responder did not become ready for the listing update."
    exit 1
  fi

  update_services="$(printf '%s' "${update_services_b64}" | base64 --decode)"
  if update_output="$(
    onchainos agent update \
      --agent-id "${update_agent_id}" \
      --service "${update_services}" 2>&1
  )"; then
    echo "[terra-a2a] ${update_output}"
    touch "${update_marker}"
    echo "[terra-a2a] Agent #${update_agent_id} listing update completed."
  else
    echo "[terra-a2a] Agent #${update_agent_id} listing update failed: ${update_output}"
    exit 1
  fi

  trap - EXIT INT TERM
  wait "${responder_pid}"
  exit $?
fi

if [[ -n "${inspect_agent_id}" ]]; then
  echo "[terra-a2a] Starting the responder before inspecting agent #${inspect_agent_id}."
  okx-a2a daemon stop >/dev/null 2>&1 || true
  rm -rf -- "${OKX_AGENT_TASK_HOME}/run/daemon.lock"
  okx-a2a run --provider codex &
  responder_pid=$!

  cleanup() {
    kill "${responder_pid}" 2>/dev/null || true
    wait "${responder_pid}" 2>/dev/null || true
  }
  trap cleanup EXIT INT TERM

  for _ in $(seq 1 60); do
    if okx-a2a doctor --json 2>/dev/null | grep -q '"ready":true'; then
      onchainos agent service-list --agent-id "${inspect_agent_id}"
      wait "${responder_pid}"
      exit $?
    fi
    sleep 2
  done

  echo "[terra-a2a] The responder did not become ready for inspection."
  exit 1
fi

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
