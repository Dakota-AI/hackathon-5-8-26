#!/bin/sh
set -eu

: "${AGENTS_RUNNER_ROOT:=/runner}"
: "${HERMES_HOME:=/runner/hermes}"
: "${HERMES_GATEWAY_HOST:=127.0.0.1}"
: "${HERMES_GATEWAY_PORT:=8642}"
: "${HERMES_GATEWAY_BOOT_TIMEOUT_SECONDS:=60}"

mkdir -p "$AGENTS_RUNNER_ROOT/workspace" "$HERMES_HOME"

if [ -n "${HERMES_AUTH_JSON_BOOTSTRAP:-}" ]; then
  printf '%s' "$HERMES_AUTH_JSON_BOOTSTRAP" > "$HERMES_HOME/auth.json"
  chmod 600 "$HERMES_HOME/auth.json"
  unset HERMES_AUTH_JSON_BOOTSTRAP
fi

if [ -z "${API_SERVER_KEY:-}" ]; then
  API_SERVER_KEY="$(head -c 32 /dev/urandom | base64 | tr -d '/+=\n' | cut -c1-43)"
fi
export API_SERVER_ENABLED=true
export API_SERVER_HOST="$HERMES_GATEWAY_HOST"
export API_SERVER_PORT="$HERMES_GATEWAY_PORT"
export API_SERVER_KEY
export HERMES_GATEWAY_URL="http://${HERMES_GATEWAY_HOST}:${HERMES_GATEWAY_PORT}"
export HERMES_GATEWAY_API_KEY="$API_SERVER_KEY"
export HERMES_ACCEPT_HOOKS=1

hermes gateway &
HERMES_PID=$!

WORKER_PID=""
cleanup() {
  if [ -n "$WORKER_PID" ]; then
    kill -TERM "$WORKER_PID" 2>/dev/null || true
  fi
  kill -TERM "$HERMES_PID" 2>/dev/null || true
}
trap cleanup TERM INT

ATTEMPTS=0
until curl -fs "${HERMES_GATEWAY_URL}/health" >/dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -ge "$HERMES_GATEWAY_BOOT_TIMEOUT_SECONDS" ]; then
    echo "Hermes gateway failed to become ready after ${HERMES_GATEWAY_BOOT_TIMEOUT_SECONDS}s" >&2
    cleanup
    exit 1
  fi
  if ! kill -0 "$HERMES_PID" 2>/dev/null; then
    echo "Hermes gateway exited during boot" >&2
    exit 1
  fi
  sleep 1
done

"$@" &
WORKER_PID=$!
wait "$WORKER_PID"
WORKER_EXIT=$?

kill -TERM "$HERMES_PID" 2>/dev/null || true
wait "$HERMES_PID" 2>/dev/null || true

exit $WORKER_EXIT
