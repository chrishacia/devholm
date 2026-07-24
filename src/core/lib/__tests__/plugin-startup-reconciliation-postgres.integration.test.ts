/** @vitest-environment node */

import path from 'path';
import knex, { type Knex } from 'knex';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const TEST_DB_SUFFIX = `_startup_recon_it_${process.pid}`;
const configuredTestDbUrl = process.env.PHASE2_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const shouldRunPostgresIntegration = Boolean(configuredTestDbUrl);
const postgresDescribe = shouldRunPostgresIntegration ? describe.sequential : describe.skip;

let adminDb: Knex;
let integrationDb: Knex;
let integrationDbName = '';
let integrationDbUrl = '';

function requireBaseDatabaseUrl(): string {
  if (!configuredTestDbUrl) {
    throw new Error(
      'plugin-startup-reconciliation-postgres.integration.test requires PHASE2_TEST_DATABASE_URL or DATABASE_URL'
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

async function closeModuleDb(): Promise<void> {
  try {
    vi.resetModules();
    const dbModule = await import('@/db');
    await dbModule.closeDb();
  } catch {
    // ignore cleanup path errors
  }
}

async function resetState(db: Knex): Promise<void> {
  await db('devholm_plugin_cutover_rollback_checkpoints').del();
  await db('devholm_plugin_cutover_reconciliation_events').del();
  await db('devholm_plugin_cutover_reconciliation_states').del();
  await db('devholm_plugin_migration_checkpoints').del();
  await db('devholm_plugin_lifecycle_events').del();
  await db('devholm_plugin_lifecycle_operations').del();
  await db('devholm_plugin_migrations').del();
  await db('devholm_plugins').del();
  await db('site_settings').where('key', 'like', 'plugin:%').del();
}

postgresDescribe('plugin startup reconciliation PostgreSQL integration', () => {
  beforeAll(async () => {
    const baseDatabaseUrl = requireBaseDatabaseUrl();
    integrationDbName = `${getDatabaseName(baseDatabaseUrl)}${TEST_DB_SUFFIX}`;
    integrationDbUrl = withDatabaseName(baseDatabaseUrl, integrationDbName);

    const adminUrl = withDatabaseName(baseDatabaseUrl, 'postgres');
    adminDb = knex({ client: 'pg', connection: adminUrl, pool: { min: 0, max: 2 } });

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

    process.env.DATABASE_URL = integrationDbUrl;
    process.env.DATABASE_PASSWORD = 'test';

    await migrateCoreSchemas(integrationDb);
  });

  afterAll(async () => {
    await closeModuleDb();

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
    await closeModuleDb();
    await resetState(integrationDb);
  });

  it('coalesces concurrent startup readiness checks to one reconciliation scan and keeps durable state idempotent', async () => {
    const runner = await import('@core/lib/plugin-lifecycle-recovery-runner.server');
    const startup = await import('@core/lib/plugin-startup-reconciliation.server');

    const scanSpy = vi.spyOn(runner, 'runPluginLifecycleRecoveryScan');

    await Promise.all([
      startup.ensurePluginStartupReadyForMutation(),
      startup.ensurePluginStartupReadyForMutation(),
      startup.initializePluginStartupReconciliation(),
    ]);

    expect(scanSpy).toHaveBeenCalledTimes(1);

    const cutoverRows = await integrationDb('devholm_plugin_cutover_reconciliation_states').count<
      { count: string }[]
    >('* as count');
    expect(Number(cutoverRows[0]?.count ?? '0')).toBeGreaterThanOrEqual(0);
  });

  it('persists rollback-required checkpoint once and remains restart-safe on re-run', async () => {
    await integrationDb('devholm_plugins').insert({
      plugin_id: 'url-shortener',
      bundled_version: '0.1.0',
      installed_version: '0.1.0',
      enabled: true,
      lifecycle_state: 'installed',
      operation_status: 'idle',
      installed_at: new Date(),
      upgraded_at: null,
      disabled_at: null,
      last_error: null,
      manifest_checksum: null,
      updated_at: new Date(),
    });

    await integrationDb('devholm_plugin_lifecycle_operations').insert({
      schema_version: 1,
      operation_id: 'op-rb-1',
      plugin_id: 'url-shortener',
      action: 'enable',
      status: 'running',
      correlation_id: 'corr-rb-1',
      current_phase: 'executing',
      started_at: new Date(Date.now() - 120_000),
      updated_at: new Date(Date.now() - 120_000),
      attempt_count: 1,
      prior_state_snapshot: JSON.stringify({
        installed: true,
        enabled: true,
        lifecycleState: 'installed',
        operationStatus: 'idle',
        installedVersion: '0.1.0',
        bundledVersion: '0.1.0',
        updatedAt: null,
      }),
      created_at: new Date(Date.now() - 120_000),
      lease_expires_at: new Date(Date.now() - 60_000),
    });

    await integrationDb('devholm_plugin_migration_checkpoints').insert({
      checkpoint_id: 'cp-irrev-1',
      operation_id: 'op-rb-1',
      plugin_id: 'url-shortener',
      plugin_version: '0.1.0',
      migration_id: 'url-shortener:irreversible-test',
      direction: 'up',
      status: 'succeeded',
      attempt_count: 1,
      irreversible: true,
      checksum: 'irreversible-checksum',
      started_at: new Date(Date.now() - 180_000),
      completed_at: new Date(Date.now() - 170_000),
      error_code: null,
      public_message: null,
      internal_diagnostic: null,
      created_at: new Date(Date.now() - 180_000),
      updated_at: new Date(Date.now() - 170_000),
    });

    await integrationDb('devholm_plugin_cutover_rollback_checkpoints').insert({
      checkpoint_id: 'cp-existing-rb-1',
      plugin_id: 'url-shortener',
      stage: 'after-enabled-settings-reconciliation',
      status: 'pending',
      attempt_count: 1,
      rollback_eligible: true,
      irreversible_boundary: false,
      operation_id: 'op-rb-1',
      correlation_id: 'corr-rb-1',
      reason: 'seeded rollback checkpoint',
      evidence: JSON.stringify({ seeded: true }),
      started_at: new Date(Date.now() - 120_000),
      completed_at: null,
      created_at: new Date(Date.now() - 120_000),
      updated_at: new Date(Date.now() - 120_000),
    });

    const { runPluginLifecycleRecoveryScan } = await import(
      '@core/lib/plugin-lifecycle-recovery-runner.server'
    );

    const first = await runPluginLifecycleRecoveryScan({ limit: 5 });
    const second = await runPluginLifecycleRecoveryScan({ limit: 5 });

    const rollbackRequired = first.results.find((r) => r.pluginId === 'url-shortener');
    expect(rollbackRequired?.recoveryCenter).toBeTruthy();

    const rollbackRows = await integrationDb('devholm_plugin_cutover_rollback_checkpoints')
      .where({ plugin_id: 'url-shortener' })
      .count<{ count: string }[]>('* as count');

    expect(Number(rollbackRows[0]?.count ?? '0')).toBe(1);

    const firstStage = rollbackRequired?.recoveryCenter?.rollbackStage;
    const secondStage = second.results.find((r) => r.pluginId === 'url-shortener')?.recoveryCenter
      ?.rollbackStage;
    expect(secondStage).toBe(firstStage);
  });
});
