#!/usr/bin/env bash
# Fails if the production app port bind is 0.0.0.0 (or left unbound, which
# Docker publishes on 0.0.0.0). The CI override must pin 127.0.0.1.
set -euo pipefail

ROOT=$(cd "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
CI="$ROOT/.github/workflows/ci.yml"
COMPOSE="$ROOT/docker-compose.yml"

fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
[ -f "$CI" ] || fail "missing $CI"

# The generated override must pin the app port to loopback.
# Literal ${APP_PORT_VALUE} in the workflow file, not a shell expansion.
# shellcheck disable=SC2016
grep -F '127.0.0.1:${APP_PORT_VALUE}:3000' "$CI" >/dev/null \
  || fail "ci.yml override generator must publish 127.0.0.1:\${APP_PORT_VALUE}:3000"

# An unbound "${APP_PORT_VALUE}:3000" mapping defaults to 0.0.0.0.
if grep -E '"\$\{APP_PORT_VALUE\}:3000"' "$CI" >/dev/null; then
  fail "ci.yml still has an unbound \${APP_PORT_VALUE}:3000 mapping (Docker would bind 0.0.0.0)"
fi

# The override generator must never publish the app port on all interfaces.
if awk '
  /name: Generate docker-compose.override.yml/ {on=1}
  /name: Deploy to server/ {on=0}
  on {print}
' "$CI" | grep -E '[-"'"'"'[:space:]]0\.0\.0\.0[:0-9]' >/dev/null; then
  fail "docker-compose.override.yml generator publishes a 0.0.0.0 bind"
fi

# shellcheck disable=SC2016
if grep -F '0.0.0.0:${APP_PORT_VALUE}:3000' "$CI" >/dev/null; then
  fail "ci.yml publishes the app port on 0.0.0.0"
fi

# Base compose: if the app service ever grows a host port, it must be loopback.
if [ -f "$COMPOSE" ]; then
  if awk '
    BEGIN {app=0}
    /^[[:space:]]+app:[[:space:]]*$/ {app=1; next}
    app && /^[[:space:]]+[A-Za-z0-9_]+:[[:space:]]*$/ && !/^[[:space:]]+ports:[[:space:]]*$/ {app=0}
    app {print}
  ' "$COMPOSE" | grep -E '0\.0\.0\.0|-[^[:alnum:]]*[0-9]+:3000' >/dev/null; then
    # Allow explicit 127.0.0.1 mappings; reject anything else that publishes 3000.
    if awk '
      BEGIN {app=0}
      /^[[:space:]]+app:[[:space:]]*$/ {app=1; next}
      app && /^[[:space:]]+[A-Za-z0-9_]+:[[:space:]]*$/ && $1 != "ports:" {app=0}
      app {print}
    ' "$COMPOSE" | grep -E '0\.0\.0\.0|[- ][0-9]+:3000' | grep -v '127.0.0.1' >/dev/null; then
      fail "docker-compose.yml app service publishes a non-loopback port"
    fi
  fi
fi

printf 'ok: app bind is pinned to 127.0.0.1\n'
