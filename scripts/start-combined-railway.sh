#!/usr/bin/env bash
set -euo pipefail

mkdir -p \
  "${HOME}/.onchainos" \
  "${CODEX_HOME}" \
  "${OKX_AGENT_TASK_HOME}"

api_pid=""
a2a_pid=""

shutdown() {
  trap - EXIT INT TERM

  if [[ -n "${a2a_pid}" ]]; then
    kill "${a2a_pid}" 2>/dev/null || true
  fi
  if [[ -n "${api_pid}" ]]; then
    kill "${api_pid}" 2>/dev/null || true
  fi

  wait "${a2a_pid}" 2>/dev/null || true
  wait "${api_pid}" 2>/dev/null || true
}

trap shutdown EXIT INT TERM

echo "[terra] Starting the public API."
node /app/src/server.js &
api_pid=$!

if [[ ! -f "${HOME}/.onchainos/session.json" ]]; then
  echo "[terra] Agentic Wallet login is missing from /data."
  echo "[terra] The API remains online, but the A2A listener cannot start."
  wait "${api_pid}"
  exit $?
fi

if [[ ! -f "${CODEX_HOME}/auth.json" ]]; then
  echo "[terra] Codex login is missing from /data."
  echo "[terra] The API remains online, but the A2A listener cannot start."
  wait "${api_pid}"
  exit $?
fi

rm -rf -- "${OKX_AGENT_TASK_HOME}/run/daemon.lock"

echo "[terra] Starting the OKX A2A listener."
okx-a2a run --provider codex &
a2a_pid=$!

set +e
wait -n "${api_pid}" "${a2a_pid}"
exit_code=$?
set -e

echo "[terra] A required process exited with code ${exit_code}; restarting the container."
if [[ "${exit_code}" -eq 0 ]]; then
  exit 1
fi

exit "${exit_code}"
