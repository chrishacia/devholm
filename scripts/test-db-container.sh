#!/usr/bin/env bash

set -euo pipefail

CONTAINER_NAME="${DEVHOLM_TEST_DB_CONTAINER:-devholm-ci-postgres}"
IMAGE="${DEVHOLM_TEST_DB_IMAGE:-postgres:16-alpine}"
HOST="${DEVHOLM_TEST_DB_HOST:-127.0.0.1}"
PORT="${DEVHOLM_TEST_DB_PORT:-45433}"
DATABASE_NAME="${DEVHOLM_TEST_DB_NAME:-test}"
DATABASE_USER="${DEVHOLM_TEST_DB_USER:-test}"
DATABASE_PASSWORD="${DEVHOLM_TEST_DB_PASSWORD:-test}"
LABEL_KEY="devholm.ci-owned"
LABEL_VALUE="true"

container_exists() {
  docker ps -a --format '{{.Names}}' | grep -Fxq "$CONTAINER_NAME"
}

container_running() {
  docker ps --format '{{.Names}}' | grep -Fxq "$CONTAINER_NAME"
}

verify_owned_container() {
  if ! container_exists; then
    return 0
  fi

  local owner_label
  owner_label="$(docker inspect -f "{{ index .Config.Labels \"$LABEL_KEY\" }}" "$CONTAINER_NAME" 2>/dev/null || true)"
  if [ "$owner_label" != "$LABEL_VALUE" ]; then
    echo "Refusing to manage existing container '$CONTAINER_NAME' because it is not labeled $LABEL_KEY=$LABEL_VALUE" >&2
    exit 1
  fi
}

wait_until_ready() {
  local attempt
  for attempt in $(seq 1 60); do
    if docker exec "$CONTAINER_NAME" pg_isready -U "$DATABASE_USER" -d "$DATABASE_NAME" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  echo "Timed out waiting for PostgreSQL container '$CONTAINER_NAME' to become ready" >&2
  docker logs "$CONTAINER_NAME" >&2 || true
  exit 1
}

up() {
  verify_owned_container

  if container_running; then
    wait_until_ready
    return 0
  fi

  if container_exists; then
    docker start "$CONTAINER_NAME" >/dev/null
    wait_until_ready
    return 0
  fi

  docker run -d \
    --name "$CONTAINER_NAME" \
    --label "$LABEL_KEY=$LABEL_VALUE" \
    -e POSTGRES_DB="$DATABASE_NAME" \
    -e POSTGRES_USER="$DATABASE_USER" \
    -e POSTGRES_PASSWORD="$DATABASE_PASSWORD" \
    -p "$HOST:$PORT:5432" \
    "$IMAGE" >/dev/null

  wait_until_ready
}

down() {
  if ! container_exists; then
    return 0
  fi

  verify_owned_container
  docker rm -f "$CONTAINER_NAME" >/dev/null
}

status() {
  if ! container_exists; then
    echo "not-found"
    return 0
  fi

  verify_owned_container
  docker ps -a --filter "name=^/${CONTAINER_NAME}$"
}

case "${1:-}" in
  up)
    up
    ;;
  down)
    down
    ;;
  status)
    status
    ;;
  *)
    echo "Usage: $0 {up|down|status}" >&2
    exit 1
    ;;
esac