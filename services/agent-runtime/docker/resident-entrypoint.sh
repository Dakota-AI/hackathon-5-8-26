#!/bin/sh
set -eu

: "${AGENTS_RUNNER_ROOT:=/runner}"
: "${HERMES_HOME:=/runner/hermes}"

mkdir -p \
  "$AGENTS_RUNNER_ROOT/workspace" \
  "$AGENTS_RUNNER_ROOT/state" \
  "$AGENTS_RUNNER_ROOT/artifacts" \
  "$AGENTS_RUNNER_ROOT/profiles" \
  "$AGENTS_RUNNER_ROOT/logs" \
  "$HERMES_HOME"

if [ "${HERMES_AUTH_JSON_BOOTSTRAP:-}" != "" ]; then
  printf '%s' "$HERMES_AUTH_JSON_BOOTSTRAP" > "$HERMES_HOME/auth.json"
  chmod 600 "$HERMES_HOME/auth.json"
  unset HERMES_AUTH_JSON_BOOTSTRAP
fi

exec "$@"
