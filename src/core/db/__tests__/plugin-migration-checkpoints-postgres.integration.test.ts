/** @vitest-environment node */

import path from 'path';
import knex, { type Knex } from 'knex';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  determinePluginRollbackCompatibility,
  markPluginMigrationCheckpointCompleted,
  readCompletedPluginMigrationCheckpoints,
  readInterruptedPluginMigrationCheckpoint,
  startPluginMigrationCheckpoint,
} from '@core/db/plugin-migration-checkpoints';
import { writePluginLifecycleOperationRecord } from '@core/db/plugin-lifecycle';

const TEST_DB_SUFFIX = `_migration_checkpoints_it_${process.pid}`;

const configuredTestDbUrl = process.env.PHASE2_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const shouldRunPostgresIntegration = Boolean(configuredTestDbUrl);

const postgresDescribe = shouldRunPostgresIntegration ? describe.sequential : describe.skip;

let adminDb: Knex;
let integrationDb: Knex;
let integrationDbName = '';

function requireBaseDatabaseUrl(): string {
  if (!configuredTestDbUrl) {
    throw new Error(
      'plugin-migration-checkpoints-postgres.integration.test requires PHASE2_TEST_DATABASE_URL or DATABASE_URL'
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
  await db('devholm_plugin_migration_checkpoints').del();
  await db('devholm_plugin_lifecycle_events').del();
  await db('devholm_plugin_lifecycle_operations').del();
  await db('devholm_plugin_migrations').del();
  await db('devholm_plugins').where({ plugin_id: 'url-shortener' }).del();
}

async function seedPluginAndOperation(db: Knex, operationId = 'op-1'): Promise<void> {
  await db('devholm_plugins').insert({
    plugin_id: 'url-shortener',
    bundled_version: '1.0.0',
    installed_version: '1.0.0',
    enabled: false,
    lifecycle_state: 'installed',
    operation_status: 'idle',
    installed_at: new Date(),
    upgraded_at: null,
    disabled_at: null,
    last_error: null,
    manifest_checksum: null,
    updated_at: new Date(),
  });

  const now = new Date().toISOString();
  await writePluginLifecycleOperationRecord(
    {
      schemaVersion: 1,
      operationId,
      pluginId: 'url-shortener',
      action: 'install',
      status: 'running',
      correlationId: `corr-${operationId}`,
      currentPhase: 'executing',
      startedAt: now,
      updatedAt: now,
      attemptCount: 1,
      priorStateSnapshot: {
        installed: false,
        enabled: false,
        lifecycleState: 'bundled',
        operationStatus: 'idle',
        installedVersion: null,
        bundledVersion: '1.0.0',
        updatedAt: null,
      },
    },
    db
  );
}

postgresDescribe('plugin migration checkpoints PostgreSQL integration', () => {
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
    await seedPluginAndOperation(integrationDb);
  });

  it('prevents duplicate concurrent running checkpoints for same operation/migration', async () => {
    await startPluginMigrationCheckpoint(
      {
        operationId: 'op-1',
        pluginId: 'url-shortener',
        pluginVersion: '1.0.0',
        migrationId: 'url-shortener:001',
        direction: 'up',
        attemptCount: 1,
        irreversible: false,
        checksum: 'sha256:a',
      },
      integrationDb
    );

    await expect(
      startPluginMigrationCheckpoint(
        {
          operationId: 'op-1',
          pluginId: 'url-shortener',
          pluginVersion: '1.0.0',
          migrationId: 'url-shortener:001',
          direction: 'up',
          attemptCount: 1,
          irreversible: false,
          checksum: 'sha256:a',
        },
        integrationDb
      )
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('identifies interrupted running checkpoint and completed history', async () => {
    const running = await startPluginMigrationCheckpoint(
      {
        operationId: 'op-1',
        pluginId: 'url-shortener',
        pluginVersion: '1.0.0',
        migrationId: 'url-shortener:001',
        direction: 'up',
        attemptCount: 1,
        irreversible: false,
        checksum: 'sha256:a',
      },
      integrationDb
    );

    let interrupted = await readInterruptedPluginMigrationCheckpoint(
      'url-shortener',
      integrationDb
    );
    expect(interrupted?.checkpointId).toBe(running.checkpointId);

    await markPluginMigrationCheckpointCompleted(running.checkpointId, integrationDb);
    interrupted = await readInterruptedPluginMigrationCheckpoint('url-shortener', integrationDb);
    expect(interrupted).toBeNull();

    const completed = await readCompletedPluginMigrationCheckpoints('url-shortener', integrationDb);
    expect(completed).toHaveLength(1);
    expect(completed[0]?.migrationId).toBe('url-shortener:001');
  });

  it('blocks rollback compatibility when irreversible succeeded migrations exist', async () => {
    const irreversible = await startPluginMigrationCheckpoint(
      {
        operationId: 'op-1',
        pluginId: 'url-shortener',
        pluginVersion: '1.0.0',
        migrationId: 'url-shortener:irreversible-1',
        direction: 'up',
        attemptCount: 1,
        irreversible: true,
        checksum: 'sha256:irreversible',
      },
      integrationDb
    );

    await markPluginMigrationCheckpointCompleted(irreversible.checkpointId, integrationDb);

    const compatibility = await determinePluginRollbackCompatibility(
      'url-shortener',
      integrationDb
    );
    expect(compatibility).toEqual({
      rollbackCompatible: false,
      reason: 'irreversible-migrations-present',
    });
  });
});
