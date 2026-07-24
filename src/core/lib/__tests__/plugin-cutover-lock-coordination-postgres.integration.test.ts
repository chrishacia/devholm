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

async function waitForPluginLockWaiters(options: {
  db: Knex;
  dbName: string;
  pluginId: string;
  expectedCount: number;
  timeoutMs?: number;
}): Promise<void> {
  const deadline = Date.now() + (options.timeoutMs ?? 5000);

  while (Date.now() < deadline) {
    const probe = await options.db.raw<{ rows: Array<{ waiters: string | number }> }>(
      `
        select count(*)::int as waiters
        from pg_locks l
        join pg_stat_activity a on a.pid = l.pid
        where a.datname = ?
          and l.locktype = 'advisory'
          and l.granted = false
          and l.classid = hashtext(?)
          and l.objid = hashtext(?)
      `,
      [options.dbName, 'devholm.plugin.lifecycle', options.pluginId]
    );

    const waiters = Number(probe.rows[0]?.waiters ?? 0);
    if (waiters >= options.expectedCount) {
      return;
    }

    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  throw new Error(
    `timed out waiting for ${options.expectedCount} lifecycle lock waiters for ${options.pluginId}`
  );
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
    const lifecycleDb = await import('@core/db/plugin-lifecycle');
    const recoveryRunner = await import('@core/lib/plugin-lifecycle-recovery-runner.server');

    await seedInstalledPlugin(integrationDb);

    const now = Date.now();
    const operationId = 'op-reconcile-schedule-rollback-proof';
    const startedAt = new Date(now - 60_000).toISOString();
    const leaseExpiresAt = new Date(now - 30_000).toISOString();

    await lifecycleDb.writePluginLifecycleOperationRecord({
      schemaVersion: 1,
      operationId,
      pluginId: 'url-shortener',
      action: 'update',
      status: 'running',
      actor: 'postgres-integration',
      leaseOwner: 'postgres-integration',
      leaseExpiresAt,
      mutationAuthorityVersion: 'v2',
      correlationId: operationId,
      currentPhase: 'executing',
      startedAt,
      updatedAt: startedAt,
      attemptCount: 1,
      priorStateSnapshot: {
        installed: true,
        enabled: true,
        lifecycleState: 'installed',
        operationStatus: 'idle',
        installedVersion: '0.1.0',
        bundledVersion: '0.1.0',
        updatedAt: startedAt,
      },
      nextStateSnapshot: {
        installed: true,
        enabled: true,
        lifecycleState: 'installed',
        operationStatus: 'pending_upgrade',
        installedVersion: '0.2.0',
        bundledVersion: '0.2.0',
        updatedAt: startedAt,
      },
    });

    await lifecycleDb.writePluginLifecycleTransitionEvent({
      schemaVersion: 1,
      eventId: 'evt-reconcile-schedule-rollback-proof',
      operationId,
      pluginId: 'url-shortener',
      transition: 'update',
      result: 'failed',
      actor: 'postgres-integration',
      correlationId: operationId,
      timestamp: startedAt,
      previousState: {
        installed: true,
        enabled: true,
        lifecycleState: 'installed',
        operationStatus: 'idle',
        installedVersion: '0.1.0',
        bundledVersion: '0.1.0',
        updatedAt: startedAt,
      },
      nextState: {
        installed: true,
        enabled: true,
        lifecycleState: 'installed',
        operationStatus: 'pending_upgrade',
        installedVersion: '0.2.0',
        bundledVersion: '0.2.0',
        updatedAt: startedAt,
      },
      pluginVersion: '0.2.0',
      artifactDigest: 'sha256:rollback-proof',
      error: {
        code: 'LIFECYCLE_FORCED_FAILURE',
        message: 'forced for rollback derivation proof',
        retryable: true,
      },
    });

    const result = await recoveryRunner.reconcileSinglePluginLifecycle('url-shortener');

    expect(result.action).toBe('schedule-rollback');
    expect(result.operationId).toBe(operationId);

    const checkpoint = await integrationDb('devholm_plugin_cutover_rollback_checkpoints')
      .where({ plugin_id: 'url-shortener' })
      .orderBy('id', 'desc')
      .first();
    expect(checkpoint).toBeDefined();
    expect(checkpoint.stage).toBe('after-enabled-settings-reconciliation');
    expect(['running', 'succeeded']).toContain(checkpoint.status);
  });

  it('rollback failure inside reconcileSinglePluginLifecycle persists failure after rollback without self-deadlock', async () => {
    const lifecycleDb = await import('@core/db/plugin-lifecycle');

    await seedInstalledPlugin(integrationDb);

    const now = Date.now();
    const operationId = 'op-reconcile-rollback-failure-proof';
    const startedAt = new Date(now - 120_000).toISOString();
    const leaseExpiresAt = new Date(now - 60_000).toISOString();

    await lifecycleDb.writePluginLifecycleOperationRecord({
      schemaVersion: 1,
      operationId,
      pluginId: 'url-shortener',
      action: 'update',
      status: 'running',
      actor: 'postgres-integration',
      leaseOwner: 'postgres-integration',
      leaseExpiresAt,
      mutationAuthorityVersion: 'v2',
      correlationId: operationId,
      currentPhase: 'executing',
      startedAt,
      updatedAt: startedAt,
      attemptCount: 1,
      priorStateSnapshot: {
        installed: true,
        enabled: true,
        lifecycleState: 'installed',
        operationStatus: 'idle',
        installedVersion: '0.1.0',
        bundledVersion: '0.1.0',
        updatedAt: startedAt,
      },
      nextStateSnapshot: {
        installed: true,
        enabled: true,
        lifecycleState: 'installed',
        operationStatus: 'pending_upgrade',
        installedVersion: '0.2.0',
        bundledVersion: '0.2.0',
        updatedAt: startedAt,
      },
    });

    await lifecycleDb.writePluginLifecycleTransitionEvent({
      schemaVersion: 1,
      eventId: 'evt-reconcile-rollback-failure-proof',
      operationId,
      pluginId: 'url-shortener',
      transition: 'update',
      result: 'failed',
      actor: 'postgres-integration',
      correlationId: operationId,
      timestamp: startedAt,
      previousState: {
        installed: true,
        enabled: true,
        lifecycleState: 'installed',
        operationStatus: 'idle',
        installedVersion: '0.1.0',
        bundledVersion: '0.1.0',
        updatedAt: startedAt,
      },
      nextState: {
        installed: true,
        enabled: true,
        lifecycleState: 'installed',
        operationStatus: 'pending_upgrade',
        installedVersion: '0.2.0',
        bundledVersion: '0.2.0',
        updatedAt: startedAt,
      },
      pluginVersion: '0.2.0',
      artifactDigest: 'sha256:rollback-failure-proof',
      error: {
        code: 'LIFECYCLE_FORCED_FAILURE',
        message: 'forced for rollback failure proof',
        retryable: true,
      },
    });

    vi.resetModules();
    vi.doMock('@core/db/plugin-lifecycle', async () => {
      const actual = await vi.importActual<typeof import('@core/db/plugin-lifecycle')>(
        '@core/db/plugin-lifecycle'
      );

      return {
        ...actual,
        upsertPluginLedgerRecord: vi.fn(async () => {
          throw new Error('forced rollback mutation failure');
        }),
      };
    });

    try {
      const recoveryRunner = await import('@core/lib/plugin-lifecycle-recovery-runner.server');

      const result = await Promise.race([
        recoveryRunner.reconcileSinglePluginLifecycle('url-shortener'),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('reconcile timeout indicates lock deadlock')), 5000);
        }),
      ]);

      expect(result.action).toBe('schedule-rollback');
      expect(result.executed).toBe(false);
      expect(result.reason).toBe('forced rollback mutation failure');
    } finally {
      vi.doUnmock('@core/db/plugin-lifecycle');
      vi.resetModules();
    }

    const checkpoints = await integrationDb('devholm_plugin_cutover_rollback_checkpoints')
      .where({ plugin_id: 'url-shortener' })
      .orderBy('id', 'asc');

    expect(checkpoints.length).toBeGreaterThan(0);
    expect(checkpoints.some((row) => row.status === 'running')).toBe(false);
    expect(checkpoints.some((row) => row.status === 'failed')).toBe(true);

    const lockProbeClient = createIndependentClient();
    const lockProbe = await lockProbeClient.raw<{ rows: Array<{ got: boolean }> }>(
      'select pg_try_advisory_xact_lock(hashtext(?), hashtext(?)) as got',
      ['devholm.plugin.lifecycle', 'url-shortener']
    );
    expect(lockProbe.rows[0]?.got).toBe(true);
    await lockProbeClient.destroy();

    const recoveryRunnerRetry = await import('@core/lib/plugin-lifecycle-recovery-runner.server');
    const retryResult = await recoveryRunnerRetry.reconcileSinglePluginLifecycle('url-shortener');

    expect(retryResult.action).toBe('schedule-rollback');
    const latest = await integrationDb('devholm_plugin_cutover_rollback_checkpoints')
      .where({ plugin_id: 'url-shortener' })
      .orderBy('id', 'desc')
      .first();
    expect(Number(latest.attempt_count)).toBeGreaterThanOrEqual(1);
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
    await waitForPluginLockWaiters({
      db: adminDb,
      dbName: integrationDbName,
      pluginId: 'url-shortener',
      expectedCount: 1,
    });

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
    await waitForPluginLockWaiters({
      db: adminDb,
      dbName: integrationDbName,
      pluginId: 'url-shortener',
      expectedCount: 2,
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

  it('cleanup versus logical legacy decommission serializes and rejects stale cleanup intent', async () => {
    const { executePluginCutoverCleanup } = await import(
      '@core/lib/plugin-cutover-cleanup-executor.server'
    );
    const { buildPluginCutoverCleanupPlan } = await import(
      '@core/lib/plugin-cutover-cleanup-planner.server'
    );
    const { computePluginCutoverCleanupPlanVersion } = await import(
      '@core/lib/plugin-cutover-cleanup-contract.server'
    );
    const { logicallyDecommissionLegacyPluginState } = await import(
      '@core/lib/plugin-cutover-legacy-decommission.server'
    );

    await seedInstalledPlugin(integrationDb);
    await integrationDb('site_settings').insert({
      key: 'plugin:url-shortener:enabled',
      value: 'true',
      type: 'boolean',
      category: 'plugins',
      description: 'legacy enabled key',
      updated_at: new Date(),
    });

    const originalPlan = await buildPluginCutoverCleanupPlan('url-shortener', integrationDb);

    const lockHolder = createIndependentClient();
    const decommissionClient = createIndependentClient();
    const cleanupClient = createIndependentClient();

    let releaseLock: (() => void) | undefined;
    const holdLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    let lockHeldSignal: (() => void) | undefined;
    const lockHeld = new Promise<void>((resolve) => {
      lockHeldSignal = resolve;
    });

    const hold = lockHolder.transaction(async (trx) => {
      await trx.raw('select pg_advisory_xact_lock(hashtext(?), hashtext(?))', [
        'devholm.plugin.lifecycle',
        'url-shortener',
      ]);
      lockHeldSignal?.();
      await holdLock;
    });

    await lockHeld;

    const decommissionPromise = logicallyDecommissionLegacyPluginState('url-shortener', {
      db: decommissionClient,
      operationId: 'op-race-legacy-decommission',
      correlationId: 'corr-race-legacy-decommission',
    });
    await waitForPluginLockWaiters({
      db: adminDb,
      dbName: integrationDbName,
      pluginId: 'url-shortener',
      expectedCount: 1,
    });

    const cleanupPromise = executePluginCutoverCleanup('url-shortener', {
      dryRun: false,
      db: cleanupClient,
      intent: {
        pluginId: 'url-shortener',
        schemaVersion: 2,
        planVersion: computePluginCutoverCleanupPlanVersion(originalPlan),
        stateFingerprint: originalPlan.stateFingerprint,
        executionToken: 'cleanup-token-legacy-decommission-race',
      },
    });
    await waitForPluginLockWaiters({
      db: adminDb,
      dbName: integrationDbName,
      pluginId: 'url-shortener',
      expectedCount: 2,
    });

    releaseLock?.();
    await hold;

    const decommissionResult = await decommissionPromise;
    expect(decommissionResult.applied).toBe(true);

    await expect(cleanupPromise).rejects.toThrow(
      /stale-cleanup-plan-version|cleanup-state-fingerprint-mismatch|cleanup-plan-ineligible/
    );

    const marker = await integrationDb('site_settings')
      .where({ key: 'plugin:url-shortener:legacy-state-decommissioned-at' })
      .first();
    expect(marker).toBeDefined();

    await lockHolder.destroy();
    await decommissionClient.destroy();
    await cleanupClient.destroy();
  });

  it('cleanup versus legacy reconciliation serializes and rejects stale cleanup intent', async () => {
    const { executePluginCutoverCleanup } = await import(
      '@core/lib/plugin-cutover-cleanup-executor.server'
    );
    const { buildPluginCutoverCleanupPlan } = await import(
      '@core/lib/plugin-cutover-cleanup-planner.server'
    );
    const { computePluginCutoverCleanupPlanVersion } = await import(
      '@core/lib/plugin-cutover-cleanup-contract.server'
    );
    const { reconcileLegacyAndCanonicalPluginState } = await import(
      '@core/lib/plugin-cutover-legacy-reconciler.server'
    );

    await integrationDb('site_settings').insert({
      key: 'plugin:url-shortener:enabled',
      value: 'true',
      type: 'boolean',
      category: 'plugins',
      description: 'legacy enabled key',
      updated_at: new Date(),
    });

    const originalPlan = await buildPluginCutoverCleanupPlan('url-shortener', integrationDb);

    const lockHolder = createIndependentClient();
    const reconcileClient = createIndependentClient();
    const cleanupClient = createIndependentClient();

    let releaseLock: (() => void) | undefined;
    const holdLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    let lockHeldSignal: (() => void) | undefined;
    const lockHeld = new Promise<void>((resolve) => {
      lockHeldSignal = resolve;
    });

    const hold = lockHolder.transaction(async (trx) => {
      await trx.raw('select pg_advisory_xact_lock(hashtext(?), hashtext(?))', [
        'devholm.plugin.lifecycle',
        'url-shortener',
      ]);
      lockHeldSignal?.();
      await holdLock;
    });

    await lockHeld;

    const reconciliationPromise = reconcileLegacyAndCanonicalPluginState('url-shortener', {
      db: reconcileClient,
      correlationId: 'corr-race-legacy-reconciliation',
    });
    await waitForPluginLockWaiters({
      db: adminDb,
      dbName: integrationDbName,
      pluginId: 'url-shortener',
      expectedCount: 1,
    });

    const cleanupPromise = executePluginCutoverCleanup('url-shortener', {
      dryRun: false,
      db: cleanupClient,
      intent: {
        pluginId: 'url-shortener',
        schemaVersion: 2,
        planVersion: computePluginCutoverCleanupPlanVersion(originalPlan),
        stateFingerprint: originalPlan.stateFingerprint,
        executionToken: 'cleanup-token-legacy-reconciliation-race',
      },
    });
    await waitForPluginLockWaiters({
      db: adminDb,
      dbName: integrationDbName,
      pluginId: 'url-shortener',
      expectedCount: 2,
    });

    releaseLock?.();
    await hold;

    const reconciliationResult = await reconciliationPromise;
    expect(reconciliationResult.topology).toBe('legacy-only');
    expect(reconciliationResult.phase).toBe('canonical-record-established');

    await expect(cleanupPromise).rejects.toThrow(
      /stale-cleanup-plan-version|cleanup-state-fingerprint-mismatch|cleanup-plan-ineligible/
    );

    const canonicalRow = await integrationDb('devholm_plugins')
      .where({ plugin_id: 'url-shortener' })
      .first();
    expect(canonicalRow).toBeDefined();

    await lockHolder.destroy();
    await reconcileClient.destroy();
    await cleanupClient.destroy();
  });

  it('recovery scan classifies using post-lock authoritative row when lifecycle record changes while waiting', async () => {
    const { runPluginLifecycleRecoveryScan } = await import(
      '@core/lib/plugin-lifecycle-recovery-runner.server'
    );

    await seedInstalledPlugin(integrationDb);

    const lockHolder = createIndependentClient();
    let releaseLock: (() => void) | undefined;
    const holdLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    let lockHeldSignal: (() => void) | undefined;
    const lockHeld = new Promise<void>((resolve) => {
      lockHeldSignal = resolve;
    });

    const hold = lockHolder.transaction(async (trx) => {
      await trx.raw('select pg_advisory_xact_lock(hashtext(?), hashtext(?))', [
        'devholm.plugin.lifecycle',
        'url-shortener',
      ]);
      lockHeldSignal?.();
      await holdLock;
    });

    await lockHeld;

    const scanPromise = runPluginLifecycleRecoveryScan();
    await waitForPluginLockWaiters({
      db: adminDb,
      dbName: integrationDbName,
      pluginId: 'url-shortener',
      expectedCount: 1,
    });

    await integrationDb('devholm_plugins').where({ plugin_id: 'url-shortener' }).update({
      lifecycle_state: 'bundled',
      operation_status: 'idle',
      installed_version: null,
      enabled: false,
      updated_at: new Date(),
    });

    releaseLock?.();
    await hold;

    const scan = await scanPromise;
    const result = scan.results.find((entry) => entry.pluginId === 'url-shortener');
    expect(result).toBeDefined();
    expect(result?.cutover?.classification).not.toBe('already-canonical');
    expect(result?.durableCutoverState?.classification).toBe(result?.cutover?.classification);

    await lockHolder.destroy();
  });

  it('recovery scan handles deleted authoritative lifecycle row while waiting without stale canonical classification', async () => {
    const { runPluginLifecycleRecoveryScan } = await import(
      '@core/lib/plugin-lifecycle-recovery-runner.server'
    );

    await seedInstalledPlugin(integrationDb);

    const lockHolder = createIndependentClient();
    let releaseLock: (() => void) | undefined;
    const holdLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    let lockHeldSignal: (() => void) | undefined;
    const lockHeld = new Promise<void>((resolve) => {
      lockHeldSignal = resolve;
    });

    const hold = lockHolder.transaction(async (trx) => {
      await trx.raw('select pg_advisory_xact_lock(hashtext(?), hashtext(?))', [
        'devholm.plugin.lifecycle',
        'url-shortener',
      ]);
      lockHeldSignal?.();
      await holdLock;
    });

    await lockHeld;

    const scanPromise = runPluginLifecycleRecoveryScan();
    await waitForPluginLockWaiters({
      db: adminDb,
      dbName: integrationDbName,
      pluginId: 'url-shortener',
      expectedCount: 1,
    });

    await integrationDb('devholm_plugins').where({ plugin_id: 'url-shortener' }).del();
    await integrationDb('site_settings').where({ key: 'plugin:url-shortener:enabled' }).update({
      value: 'false',
      updated_at: new Date(),
    });

    releaseLock?.();
    await hold;

    const scan = await scanPromise;
    const result = scan.results.find((entry) => entry.pluginId === 'url-shortener');
    expect(result).toBeDefined();
    expect(result?.cutover?.classification).not.toBe('already-canonical');
    expect(result?.recoveryCenter?.recommendedAction).toBe('run-automatic-reconciliation');

    await lockHolder.destroy();
  });
});
