#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export CI="${CI:-true}"
export DATABASE_HOST="127.0.0.1"
export DATABASE_PORT="45433"
export DATABASE_NAME="test"
export DATABASE_USER="test"
export DATABASE_PASSWORD="test"
export DATABASE_URL="postgresql://test:test@127.0.0.1:45433/test"
export PHASE2_REQUIRE_POSTGRES_INTEGRATION="true"
export PHASE2_TEST_DATABASE_URL="$DATABASE_URL"
export NEXTAUTH_URL="http://localhost:3000"
export NEXTAUTH_SECRET="test-secret"
export ADMIN_EMAIL="admin@example.test"
export ADMIN_PASSWORD="e2e-test-password-change-me"

OWNED_TEST_DB_STARTED="false"

cleanup() {
  if [ "${DEVHOLM_KEEP_TEST_DB:-false}" = "true" ]; then
    return 0
  fi

  if [ "$OWNED_TEST_DB_STARTED" != "true" ]; then
    return 0
  fi

  bash scripts/test-db-container.sh down
}

trap cleanup EXIT

echo "==> Starting owned PostgreSQL test container"
if bash scripts/test-db-container.sh up; then
  OWNED_TEST_DB_STARTED="true"
else
  echo "Owned test container could not be started; attempting to reuse an already-available database at $DATABASE_URL"
fi

echo "==> Generating and validating plugin registry"
pnpm plugins:generate
pnpm plugins:check

echo "==> Resetting dedicated test schema"
node --import tsx/esm -e "import knex from 'knex'; const db = knex({ client: 'pg', connection: process.env.DATABASE_URL }); await db.raw('DROP SCHEMA IF EXISTS public CASCADE'); await db.raw('CREATE SCHEMA public'); await db.destroy();"

echo "==> Applying migrations"
pnpm db:migrate

echo "==> Seeding bootstrap data"
pnpm db:seed:bootstrap

echo "==> Running dependency audit"
pnpm audit:prod

echo "==> Resetting Next.js build artifacts"
rm -rf .next

echo "==> Running lint"
pnpm lint

echo "==> Running typecheck"
pnpm typecheck

echo "==> Running unit tests with coverage"
pnpm test:coverage

echo "==> Running PostgreSQL lifecycle integration"
pnpm test:plugin-lifecycle:pg:ci

echo "==> Running lifecycle and runtime gate suites"
pnpm test:runtime:gates

echo "==> Building production app"
pnpm build

echo "==> Ensuring Playwright browsers are installed"
pnpm exec playwright install

echo "==> Running Firefox smoke"
pnpm test:e2e:smoke:firefox

echo "==> Running Chromium URL shortener E2E"
pnpm test:e2e:url-shortener

echo "==> Running full E2E suite"
pnpm test:e2e:full

echo "validate:ci completed successfully"