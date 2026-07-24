/** @vitest-environment node */

import path from 'path';
import knex, { type Knex } from 'knex';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  deriveCutoverRollbackPlanFromPhase,
  readLatestPluginCutoverRollbackCheckpoint,
  upsertPluginCutoverRollbackCheckpoint,
} from '@core/db/plugin-cutover-rollback';

const TEST_DB_SUFFIX = `_cutover_rollback_it_${process.pid}`;
const configuredTestDbUrl = process.env.PHASE2_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const shouldRunPostgresIntegration = Boolean(configuredTestDbUrl);
const postgresDescribe = shouldRunPostgresIntegration ? describe.sequential : describe.skip;

let adminDb: Knex;
let integrationDb: Knex;
let integrationDbName = '';

function requireBaseDatabaseUrl(): string {
  if (!configuredTestDbUrl) {
    throw new Error(
      'plugin-cutover-rollback-postgres.integration.test requires PHASE2_TEST_DATABASE_URL or DATABASE_URL'
    );
  }

  return configuredTestDbUrl;
}

function withDatabaseName(urlValue: string, dbName: string): string {
  const parsed = new URL(urlValue);
  parsed.pathname = `/${dbName}`;
  return parsed.toString();
}

function getDatabaseName(urlValue: string): string {
  const parsed = new URL(urlValue);
  return parsed.pathname.replace(/^\//u, '') || 'postgres';
}

async function migrateCoreSchemas(db: Knex): Promise<void> {
  await db.migrate.latest({
    directory: [path.join(process.cwd(), 'src/core/db/migrations')],
    tableName: 'knex_migrations',
    loadExtensions: ['.ts'],
  });
}

async function resetTables(db: Knex): Promise<void> {
  await db('devholm_plugin_cutover_rollback_checkpoints').del();
}

postgresDescribe('plugin cutover rollback PostgreSQL integration', () => {
  beforeAll(async () => {
    const baseDatabaseUrl = requireBaseDatabaseUrl();
    integrationDbName = `${getDatabaseName(baseDatabaseUrl)}${TEST_DB_SUFFIX}`;
    const integrationDbUrl = withDatabaseName(baseDatabaseUrl, integrationDbName);

    const adminUrl = withDatabaseName(baseDatabaseUrl, 'postgres');
    adminDb = knex({
      client: 'pg',
      connection: adminUrl,
      pool: { min: 0, max: 2 },
    });

    await adminDb.raw(
      `SELECT pg_terminate_backend(pid)
       FROM pg_stat_activity
       WHERE datname = ? AND pid <> pg_backend_pid()`,
      [integrationDbName]
    );
    await adminDb.raw(`DROP DATABASE IF EXISTS "${integrationDbName}"`);
    await adminDb.raw(`CREATE DATABASE "${integrationDbName}"`);

    integrationDb = knex({
      client: 'pg',
      connection: integrationDbUrl,
      pool: { min: 0, max: 4 },
    });

    await migrateCoreSchemas(integrationDb);
  });

  afterAll(async () => {
    if (integrationDb) {
      await integrationDb.destroy();
    }

    if (adminDb) {
      await adminDb.raw(
        `SELECT pg_terminate_backend(pid)
         FROM pg_stat_activity
         WHERE datname = ? AND pid <> pg_backend_pid()`,
        [integrationDbName]
      );
      await adminDb.raw(`DROP DATABASE IF EXISTS "${integrationDbName}"`);
      await adminDb.destroy();
    }
  });

  beforeEach(async () => {
    await resetTables(integrationDb);
  });

  it('records rollback checkpoints idempotently and reads latest checkpoint', async () => {
    const plan = deriveCutoverRollbackPlanFromPhase('canonical-ownership-activated');

    await upsertPluginCutoverRollbackCheckpoint(
      {
        pluginId: 'url-shortener',
        stage: plan.stage,
        status: 'pending',
        rollbackEligible: plan.rollbackEligible,
        irreversibleBoundary: plan.irreversibleBoundary,
        operationId: 'op-rollback-1',
        correlationId: 'corr-rollback-1',
        reason: plan.reason,
      },
      integrationDb
    );

    await upsertPluginCutoverRollbackCheckpoint(
      {
        pluginId: 'url-shortener',
        stage: plan.stage,
        status: 'running',
        rollbackEligible: plan.rollbackEligible,
        irreversibleBoundary: plan.irreversibleBoundary,
        operationId: 'op-rollback-1',
        correlationId: 'corr-rollback-1',
        reason: 'rollback execution started',
      },
      integrationDb
    );

    const latest = await readLatestPluginCutoverRollbackCheckpoint('url-shortener', integrationDb);
    expect(latest).not.toBeNull();
    expect(latest?.status).toBe('running');

    const countRows = await integrationDb('devholm_plugin_cutover_rollback_checkpoints')
      .where({ plugin_id: 'url-shortener' })
      .count<{ count: string }[]>('* as count');

    expect(Number(countRows[0]?.count ?? '0')).toBe(1);
  });
});
