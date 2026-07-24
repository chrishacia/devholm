/** @vitest-environment node */

import path from 'path';
import knex, { type Knex } from 'knex';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const TEST_DB_SUFFIX = `_cutover_tombstone_nonrecreate_it_${process.pid}`;
const configuredTestDbUrl = process.env.PHASE2_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const shouldRunPostgresIntegration = Boolean(configuredTestDbUrl);
const postgresDescribe = shouldRunPostgresIntegration ? describe.sequential : describe.skip;

let adminDb: Knex;
let integrationDb: Knex;
let integrationDbName = '';
let integrationDbUrl = '';

function createIndependentClient(): Knex {
  return knex({
    client: 'pg',
    connection: integrationDbUrl,
    pool: { min: 0, max: 1 },
  });
}

function requireBaseDatabaseUrl(): string {
  if (!configuredTestDbUrl) {
    throw new Error(
      'plugin-cutover-tombstone-non-recreation-postgres.integration.test requires PHASE2_TEST_DATABASE_URL or DATABASE_URL'
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

postgresDescribe('plugin cutover tombstone non-recreation PostgreSQL integration', () => {
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

  it('keeps tombstoned legacy state non-recreated across recovery reruns and repeated cleanup execution', async () => {
    const { executePluginCutoverCleanup } = await import(
      '@core/lib/plugin-cutover-cleanup-executor.server'
    );
    const { computePluginCutoverCleanupPlanVersion } = await import(
      '@core/lib/plugin-cutover-cleanup-contract.server'
    );
    const { buildPluginCutoverCleanupPlan } = await import(
      '@core/lib/plugin-cutover-cleanup-planner.server'
    );
    const { upsertPluginLedgerRecord } = await import('@core/db/plugin-lifecycle');
    const { getBundledPluginManifests } = await import('@core/lib/plugin-registry.server');
    const { runPluginLifecycleRecoveryScan } = await import(
      '@core/lib/plugin-lifecycle-recovery-runner.server'
    );
    const { syncPluginDefinitions } = await import('@/db/plugins');
    const { installPlugin, enablePlugin, disablePlugin } = await import(
      '@core/lib/plugin-lifecycle.server'
    );

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
      integrationDb
    );

    await integrationDb('site_settings').insert({
      key: 'plugin:url-shortener:enabled',
      value: 'true',
      type: 'boolean',
      category: 'plugins',
      description: 'legacy enabled key',
      updated_at: new Date(),
    });

    await integrationDb('site_settings').insert({
      key: 'plugin:url-shortener:legacy-state-decommissioned-at',
      value: new Date().toISOString(),
      type: 'string',
      category: 'plugins',
      description: 'logical decommission marker',
      updated_at: new Date(),
    });

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
    expect(plan.cleanupEligible).toBe(true);

    const firstResult = await executePluginCutoverCleanup('url-shortener', {
      dryRun: false,
      db: integrationDb,
      intent: {
        pluginId: 'url-shortener',
        schemaVersion: 2,
        planVersion: computePluginCutoverCleanupPlanVersion(plan),
        stateFingerprint: plan.stateFingerprint,
        executionToken: 'cleanup-token-first',
      },
    });

    expect(firstResult.executed).toBe(true);

    const enabledAfterCleanup = await integrationDb('site_settings')
      .where({ key: 'plugin:url-shortener:enabled' })
      .first();
    expect(enabledAfterCleanup).toBeUndefined();

    const tombstone = await integrationDb('site_settings')
      .where({ key: 'plugin:url-shortener:legacy-state-tombstoned-at' })
      .first();
    expect(tombstone).toBeDefined();

    await runPluginLifecycleRecoveryScan({ limit: 50 });

    await syncPluginDefinitions();

    await expect(installPlugin('url-shortener')).resolves.toBeUndefined();
    await expect(enablePlugin('url-shortener')).resolves.toBeUndefined();
    await expect(disablePlugin('url-shortener')).resolves.toBeUndefined();

    const enabledAfterRecovery = await integrationDb('site_settings')
      .where({ key: 'plugin:url-shortener:enabled' })
      .first();
    expect(enabledAfterRecovery).toBeUndefined();

    const secondPlan = await buildPluginCutoverCleanupPlan('url-shortener', integrationDb);
    const secondResult = await executePluginCutoverCleanup('url-shortener', {
      dryRun: false,
      db: integrationDb,
      intent: {
        pluginId: 'url-shortener',
        schemaVersion: 2,
        planVersion: computePluginCutoverCleanupPlanVersion(secondPlan),
        stateFingerprint: secondPlan.stateFingerprint,
        executionToken: 'cleanup-token-second',
      },
    });

    expect(secondResult.executed).toBe(false);

    const tombstoneRows = await integrationDb('site_settings')
      .where({ key: 'plugin:url-shortener:legacy-state-tombstoned-at' })
      .count<{ count: string }[]>('* as count');
    expect(Number(tombstoneRows[0]?.count ?? '0')).toBe(1);
  });

  it('rejects replay of the same cleanup execution token after successful execution', async () => {
    const { executePluginCutoverCleanup } = await import(
      '@core/lib/plugin-cutover-cleanup-executor.server'
    );
    const { computePluginCutoverCleanupPlanVersion } = await import(
      '@core/lib/plugin-cutover-cleanup-contract.server'
    );
    const { buildPluginCutoverCleanupPlan } = await import(
      '@core/lib/plugin-cutover-cleanup-planner.server'
    );
    const { upsertPluginLedgerRecord } = await import('@core/db/plugin-lifecycle');
    const { getBundledPluginManifests } = await import('@core/lib/plugin-registry.server');

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
      integrationDb
    );

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

    const firstPlan = await buildPluginCutoverCleanupPlan('url-shortener', integrationDb);
    const replayToken = 'cleanup-token-replay-proof';

    await expect(
      executePluginCutoverCleanup('url-shortener', {
        dryRun: false,
        db: integrationDb,
        intent: {
          pluginId: 'url-shortener',
          schemaVersion: 2,
          planVersion: computePluginCutoverCleanupPlanVersion(firstPlan),
          stateFingerprint: firstPlan.stateFingerprint,
          executionToken: replayToken,
        },
      })
    ).resolves.toBeDefined();

    const reconstructedClient = createIndependentClient();
    const { executePluginCutoverCleanup: executeAfterReconstruction } = await import(
      '@core/lib/plugin-cutover-cleanup-executor.server'
    );
    const { buildPluginCutoverCleanupPlan: buildPlanAfterReconstruction } = await import(
      '@core/lib/plugin-cutover-cleanup-planner.server'
    );
    const planAfterReconstruction = await buildPlanAfterReconstruction(
      'url-shortener',
      reconstructedClient
    );

    await expect(
      executeAfterReconstruction('url-shortener', {
        dryRun: false,
        db: reconstructedClient,
        intent: {
          pluginId: 'url-shortener',
          schemaVersion: 2,
          planVersion: computePluginCutoverCleanupPlanVersion(planAfterReconstruction),
          stateFingerprint: planAfterReconstruction.stateFingerprint,
          executionToken: replayToken,
        },
      })
    ).rejects.toThrow(/cleanup-execution-token-replayed/);

    await reconstructedClient.destroy();

    const replayRejectedEvents = await integrationDb('devholm_plugin_cutover_reconciliation_events')
      .where({ plugin_id: 'url-shortener', result: 'blocked' })
      .orderBy('id', 'desc');

    expect(replayRejectedEvents.length).toBeGreaterThan(0);
    expect(String(replayRejectedEvents[0]?.classification ?? '')).toContain('cleanup-token-replay');

    const stateRow = await integrationDb('devholm_plugin_cutover_reconciliation_states')
      .where({ plugin_id: 'url-shortener' })
      .first();
    const serializedState = JSON.stringify(stateRow ?? {});
    const serializedEvents = JSON.stringify(replayRejectedEvents);
    expect(serializedState).not.toContain(replayToken);
    expect(serializedEvents).not.toContain(replayToken);
  });

  it('allows exactly one winner for concurrent same-token cleanup attempts', async () => {
    const { executePluginCutoverCleanup } = await import(
      '@core/lib/plugin-cutover-cleanup-executor.server'
    );
    const { computePluginCutoverCleanupPlanVersion } = await import(
      '@core/lib/plugin-cutover-cleanup-contract.server'
    );
    const { buildPluginCutoverCleanupPlan } = await import(
      '@core/lib/plugin-cutover-cleanup-planner.server'
    );
    const { upsertPluginLedgerRecord } = await import('@core/db/plugin-lifecycle');
    const { getBundledPluginManifests } = await import('@core/lib/plugin-registry.server');

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
      integrationDb
    );

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
    const sharedToken = 'cleanup-token-race-proof';

    const dbClientA = createIndependentClient();
    const dbClientB = createIndependentClient();

    const attemptA = () =>
      executePluginCutoverCleanup('url-shortener', {
        dryRun: false,
        db: dbClientA,
        intent: {
          pluginId: 'url-shortener',
          schemaVersion: 2,
          planVersion: computePluginCutoverCleanupPlanVersion(plan),
          stateFingerprint: plan.stateFingerprint,
          executionToken: sharedToken,
        },
      });

    const attemptB = () =>
      executePluginCutoverCleanup('url-shortener', {
        dryRun: false,
        db: dbClientB,
        intent: {
          pluginId: 'url-shortener',
          schemaVersion: 2,
          planVersion: computePluginCutoverCleanupPlanVersion(plan),
          stateFingerprint: plan.stateFingerprint,
          executionToken: sharedToken,
        },
      });

    const [first, second] = await Promise.allSettled([attemptA(), attemptB()]);
    const outcomes = [first, second];
    const fulfilled = outcomes.filter((result) => result.status === 'fulfilled');
    const rejected = outcomes.filter((result) => result.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const rejectionReason = String((rejected[0] as PromiseRejectedResult).reason ?? '');
    expect(rejectionReason).toMatch(/cleanup-execution-(claim-conflict|token-replayed)/);

    const blockedEvents = await integrationDb('devholm_plugin_cutover_reconciliation_events')
      .where({ plugin_id: 'url-shortener', result: 'blocked' })
      .orderBy('id', 'desc');
    expect(blockedEvents.length).toBeGreaterThan(0);
    const blockedSerialized = JSON.stringify(blockedEvents);
    expect(blockedSerialized).not.toContain(sharedToken);

    await dbClientA.destroy();
    await dbClientB.destroy();
  });

  it('rejects stale cleanup intent when rollback state transitions while cleanup waits on shared coordination lock', async () => {
    const { executePluginCutoverCleanup } = await import(
      '@core/lib/plugin-cutover-cleanup-executor.server'
    );
    const { computePluginCutoverCleanupPlanVersion } = await import(
      '@core/lib/plugin-cutover-cleanup-contract.server'
    );
    const { buildPluginCutoverCleanupPlan } = await import(
      '@core/lib/plugin-cutover-cleanup-planner.server'
    );
    const { upsertPluginLedgerRecord } = await import('@core/db/plugin-lifecycle');
    const { getBundledPluginManifests } = await import('@core/lib/plugin-registry.server');

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
      integrationDb
    );

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

    const originalPlan = await buildPluginCutoverCleanupPlan('url-shortener', integrationDb);

    const lockerClient = createIndependentClient();
    const cleanupClient = createIndependentClient();

    let releaseLock: (() => void) | undefined;
    const holdLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    let signalLockHeld: (() => void) | undefined;
    const lockHeld = new Promise<void>((resolve) => {
      signalLockHeld = resolve;
    });

    const lockHolder = lockerClient.transaction(async (trx) => {
      await trx.raw('select pg_advisory_xact_lock(hashtext(?), hashtext(?))', [
        'devholm.plugin.lifecycle',
        'url-shortener',
      ]);

      signalLockHeld?.();
      await holdLock;

      await trx('devholm_plugin_cutover_rollback_checkpoints').insert({
        checkpoint_id: 'cp-race-lock-proof-1',
        plugin_id: 'url-shortener',
        stage: 'after-enabled-settings-reconciliation',
        status: 'running',
        attempt_count: 1,
        rollback_eligible: true,
        irreversible_boundary: false,
        operation_id: 'op-race-lock-proof-1',
        correlation_id: 'corr-race-lock-proof-1',
        reason: 'rollback started while cleanup was queued',
        evidence: JSON.stringify({ source: 'race-proof' }),
        started_at: new Date(),
        completed_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      });
    });

    await lockHeld;

    let cleanupSettled = false;
    const cleanupAttempt = executePluginCutoverCleanup('url-shortener', {
      dryRun: false,
      db: cleanupClient,
      intent: {
        pluginId: 'url-shortener',
        schemaVersion: 2,
        planVersion: computePluginCutoverCleanupPlanVersion(originalPlan),
        stateFingerprint: originalPlan.stateFingerprint,
        executionToken: 'cleanup-token-race-rollback-stale-proof',
      },
    }).finally(() => {
      cleanupSettled = true;
    });

    await Promise.resolve();
    expect(cleanupSettled).toBe(false);

    if (releaseLock) {
      releaseLock();
    }
    await lockHolder;

    await expect(cleanupAttempt).rejects.toThrow(
      /stale-cleanup-plan-version|cleanup-state-fingerprint-mismatch/
    );

    const legacyEnabledSetting = await integrationDb('site_settings')
      .where({ key: 'plugin:url-shortener:enabled' })
      .first();
    expect(legacyEnabledSetting).toBeDefined();

    const staleEvents = await integrationDb('devholm_plugin_cutover_reconciliation_events')
      .where({ plugin_id: 'url-shortener', result: 'blocked' })
      .orderBy('id', 'desc');
    expect(
      staleEvents.some(
        (row) =>
          row.classification === 'cleanup-intent-plan-version-stale' ||
          row.classification === 'cleanup-intent-fingerprint-stale'
      )
    ).toBe(true);

    await lockerClient.destroy();
    await cleanupClient.destroy();
  });
});
