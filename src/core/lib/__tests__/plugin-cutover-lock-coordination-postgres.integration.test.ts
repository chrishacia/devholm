/** @vitest-environment node */

import path from 'path';
import knex, { type Knex } from 'knex';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const TEST_DB_SUFFIX = `_cutover_lock_coord_it_${process.pid}`;
const configuredTestDbUrl = process.env.PHASE2_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const shouldRunPostgresIntegration = Boolean(configuredTestDbUrl);
const postgresDescribe = shouldRunPostgresIntegration ? describe.sequential : describe.skip;

let adminDb: Knex;
let integrationDb: Knex;
let integrationDbName = '';
let integrationDbUrl = '';

function createIndependentClient(url = integrationDbUrl): Knex {
  return knex({
    client: 'pg',
    connection: url,
    pool: { min: 0, max: 1 },
  });
}

function createTimeoutClient(): Knex {
  const parsed = new URL(integrationDbUrl);
  const lockOptions = '-c lock_timeout=1500ms -c statement_timeout=5000ms';
  parsed.searchParams.set('options', lockOptions);
  return createIndependentClient(parsed.toString());
}

function requireBaseDatabaseUrl(): string {
  if (!configuredTestDbUrl) {
    throw new Error(
      'plugin-cutover-lock-coordination-postgres.integration.test requires PHASE2_TEST_DATABASE_URL or DATABASE_URL'
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
  await db('devholm_plugin_cutover_reconciliation_events').del();
  await db('devholm_plugin_cutover_reconciliation_states').del();
  await db('devholm_plugin_cutover_rollback_checkpoints').del();
  await db('devholm_plugin_migration_checkpoints').del();
  await db('devholm_plugin_lifecycle_events').del();
  await db('devholm_plugin_lifecycle_operations').del();
  await db('devholm_plugins').del();
  await db('site_settings').where('key', 'like', 'plugin:%').del();
}

async function seedInstalledPlugin(db: Knex): Promise<void> {
  const { getBundledPluginManifests } = await import('@core/lib/plugin-registry.server');
  const { upsertPluginLedgerRecord } = await import('@core/db/plugin-lifecycle');

  const manifest = getBundledPluginManifests().find((entry) => entry.id === 'url-shortener');
  if (!manifest) {
    throw new Error('missing url-shortener manifest');
  }

  await upsertPluginLedgerRecord(
    {
      manifest,
      state: 'installed',
      operationStatus: 'idle',
      enabled: true,
      installedVersion: manifest.version,
      installedAt: new Date(),
      upgradedAt: null,
      disabledAt: null,
      lastError: null,
    },
    db
  );
}

postgresDescribe('plugin cutover lock coordination PostgreSQL integration', () => {
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

  it('direct rollback executes without lock-timeout self-deadlock and releases lock', async () => {
    const { executePluginCutoverRollback } = await import(
      '@core/lib/plugin-cutover-rollback-executor.server'
    );

    await seedInstalledPlugin(integrationDb);

    const timedClient = createTimeoutClient();
    const result = await executePluginCutoverRollback('url-shortener', {
      db: timedClient,
      operationId: 'op-direct-rollback-proof',
      correlationId: 'corr-direct-rollback-proof',
    });

    expect(['succeeded', 'blocked']).toContain(result.status);

    const probe = createIndependentClient();
    const lockProbe = await probe.raw<{ rows: Array<{ got: boolean }> }>(
      'select pg_try_advisory_lock(hashtext(?), hashtext(?)) as got',
      ['devholm.plugin.lifecycle', 'url-shortener']
    );
    expect(lockProbe.rows[0]?.got).toBe(true);
    await probe.raw('select pg_advisory_unlock(hashtext(?), hashtext(?))', [
      'devholm.plugin.lifecycle',
      'url-shortener',
    ]);

    await timedClient.destroy();
    await probe.destroy();
  });

  it('reconcileSinglePluginLifecycle schedule-rollback path completes without deadlock and runs real rollback', async () => {
    const reconciler = await import('@core/lib/plugin-lifecycle-reconciler.server');
    const rollback = await import('@core/lib/plugin-cutover-rollback-executor.server');
    const recoveryRunner = await import('@core/lib/plugin-lifecycle-recovery-runner.server');

    await seedInstalledPlugin(integrationDb);

    const reconcileSpy = vi.spyOn(reconciler, 'reconcilePluginLifecycleState').mockResolvedValue({
      action: 'schedule-rollback',
      reason: 'forced schedule rollback for deadlock regression proof',
      operationId: 'op-reconcile-schedule-rollback-proof',
    });

    const rollbackSpy = vi.spyOn(rollback, 'executePluginCutoverRollback');

    const result = await recoveryRunner.reconcileSinglePluginLifecycle('url-shortener');

    expect(result.action).toBe('schedule-rollback');
    expect(rollbackSpy).toHaveBeenCalledTimes(1);

    const checkpoint = await integrationDb('devholm_plugin_cutover_rollback_checkpoints')
      .where({ plugin_id: 'url-shortener' })
      .first();
    expect(checkpoint).toBeDefined();

    reconcileSpy.mockRestore();
    rollbackSpy.mockRestore();
  });

  it('cleanup versus real rollback serializes and rejects stale cleanup intent', async () => {
    const { executePluginCutoverRollback } = await import(
      '@core/lib/plugin-cutover-rollback-executor.server'
    );
    const { executePluginCutoverCleanup } = await import(
      '@core/lib/plugin-cutover-cleanup-executor.server'
    );
    const { buildPluginCutoverCleanupPlan } = await import(
      '@core/lib/plugin-cutover-cleanup-planner.server'
    );
    const { computePluginCutoverCleanupPlanVersion } = await import(
      '@core/lib/plugin-cutover-cleanup-contract.server'
    );

    await seedInstalledPlugin(integrationDb);
    await integrationDb('site_settings').insert([
      {
        key: 'plugin:url-shortener:enabled',
        value: 'true',
        type: 'boolean',
        category: 'plugins',
        description: 'legacy enabled key',
        updated_at: new Date(),
      },
      {
        key: 'plugin:url-shortener:legacy-state-decommissioned-at',
        value: new Date().toISOString(),
        type: 'string',
        category: 'plugins',
        description: 'logical decommission marker',
        updated_at: new Date(),
      },
    ]);
    await integrationDb('devholm_plugin_cutover_reconciliation_states').insert({
      plugin_id: 'url-shortener',
      phase: 'legacy-path-decommissioned',
      operation_id: null,
      correlation_id: null,
      classification: 'legacy-logically-decommissioned',
      blocking: false,
      reason: 'ready for cleanup',
      evidence: JSON.stringify({ ready: true }),
      snapshot: null,
      inspected_at: new Date(),
      phase_updated_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    });

    const plan = await buildPluginCutoverCleanupPlan('url-shortener', integrationDb);

    const lockHolder = createIndependentClient();
    const rollbackClient = createIndependentClient();
    const cleanupClient = createIndependentClient();

    let releaseLock: (() => void) | undefined;
    const holdLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    let lockIsHeldSignal: (() => void) | undefined;
    const lockIsHeld = new Promise<void>((resolve) => {
      lockIsHeldSignal = resolve;
    });

    const hold = lockHolder.transaction(async (trx) => {
      await trx.raw('select pg_advisory_xact_lock(hashtext(?), hashtext(?))', [
        'devholm.plugin.lifecycle',
        'url-shortener',
      ]);
      lockIsHeldSignal?.();
      await holdLock;
    });

    await lockIsHeld;

    const rollbackPromise = executePluginCutoverRollback('url-shortener', {
      db: rollbackClient,
      operationId: 'op-race-real-rollback',
      correlationId: 'corr-race-real-rollback',
    });

    await Promise.resolve();

    const cleanupPromise = executePluginCutoverCleanup('url-shortener', {
      dryRun: false,
      db: cleanupClient,
      intent: {
        pluginId: 'url-shortener',
        schemaVersion: 2,
        planVersion: computePluginCutoverCleanupPlanVersion(plan),
        stateFingerprint: plan.stateFingerprint,
        executionToken: 'cleanup-token-real-rollback-race',
      },
    });

    if (releaseLock) {
      releaseLock();
    }
    await hold;

    const rollbackResult = await rollbackPromise;
    expect(['succeeded', 'blocked']).toContain(rollbackResult.status);

    await expect(cleanupPromise).rejects.toThrow(
      /stale-cleanup-plan-version|cleanup-state-fingerprint-mismatch|cleanup-plan-ineligible/
    );

    const staleOrBlockedEvents = await integrationDb('devholm_plugin_cutover_reconciliation_events')
      .where({ plugin_id: 'url-shortener', result: 'blocked' })
      .orderBy('id', 'desc');
    expect(staleOrBlockedEvents.length).toBeGreaterThan(0);

    await lockHolder.destroy();
    await rollbackClient.destroy();
    await cleanupClient.destroy();
  });
});
