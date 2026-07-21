import { beforeEach, describe, expect, it, vi } from 'vitest';

const getDb = vi.hoisted(() => vi.fn());
const getInstalledPlugin = vi.hoisted(() => vi.fn());
const upsertPluginLedgerRecord = vi.hoisted(() => vi.fn());
const readPluginCutoverReconciliationState = vi.hoisted(() => vi.fn());
const readLatestPluginCutoverRollbackCheckpoint = vi.hoisted(() => vi.fn());
const upsertPluginCutoverRollbackCheckpoint = vi.hoisted(() => vi.fn());
const appendPluginCutoverReconciliationEvent = vi.hoisted(() => vi.fn());
const upsertPluginCutoverReconciliationState = vi.hoisted(() => vi.fn());

vi.mock('@/db', () => ({
  getDb,
}));

vi.mock('@core/db/plugin-lifecycle', () => ({
  getInstalledPlugin,
  upsertPluginLedgerRecord,
}));

vi.mock('@core/db/plugin-cutover-reconciliation', () => ({
  readPluginCutoverReconciliationState,
  appendPluginCutoverReconciliationEvent,
  upsertPluginCutoverReconciliationState,
}));

vi.mock('@core/db/plugin-cutover-rollback', async () => {
  const actual = await vi.importActual<typeof import('@core/db/plugin-cutover-rollback')>(
    '@core/db/plugin-cutover-rollback'
  );

  return {
    ...actual,
    readLatestPluginCutoverRollbackCheckpoint,
    upsertPluginCutoverRollbackCheckpoint,
  };
});

vi.mock('@core/lib/plugin-registry.server', () => ({
  getBundledPluginManifests: () => [
    {
      id: 'url-shortener',
      name: 'URL Shortener',
      version: '0.1.0',
      enablementSettingKey: 'plugin:url-shortener:enabled',
    },
  ],
}));

describe('plugin cutover rollback executor', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getDb.mockReturnValue({
      transaction: async (callback: (trx: unknown) => Promise<void>) => callback({}),
    });

    readPluginCutoverReconciliationState.mockResolvedValue({
      pluginId: 'url-shortener',
      phase: 'rollback-pending',
      operationId: 'op-1',
      correlationId: 'corr-1',
      classification: 'rollback-required',
      blocking: true,
      reason: 'rollback required',
      evidence: null,
      snapshot: null,
      inspectedAt: new Date().toISOString(),
      phaseUpdatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    readLatestPluginCutoverRollbackCheckpoint.mockResolvedValue(null);
    getInstalledPlugin.mockResolvedValue({
      pluginId: 'url-shortener',
      bundledVersion: '0.1.0',
      installedVersion: '0.1.0',
      enabled: true,
      lifecycleState: 'installed',
      operationStatus: 'idle',
      installedAt: null,
      upgradedAt: null,
      disabledAt: null,
      updatedAt: null,
      lastError: null,
      manifestChecksum: null,
    });

    upsertPluginCutoverRollbackCheckpoint.mockResolvedValue({
      checkpointId: 'cp-1',
      pluginId: 'url-shortener',
      stage: 'after-enabled-settings-reconciliation',
      status: 'running',
      attemptCount: 1,
      rollbackEligible: true,
      irreversibleBoundary: false,
      operationId: 'op-1',
      correlationId: 'corr-1',
      reason: 'running',
      evidence: {},
      startedAt: new Date().toISOString(),
      completedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    appendPluginCutoverReconciliationEvent.mockResolvedValue(undefined);
    upsertPluginCutoverReconciliationState.mockResolvedValue(undefined);
    upsertPluginLedgerRecord.mockResolvedValue(undefined);
  });

  it('executes rollback inverse action and marks checkpoint succeeded', async () => {
    const { executePluginCutoverRollback } = await import(
      '@core/lib/plugin-cutover-rollback-executor.server'
    );

    const result = await executePluginCutoverRollback('url-shortener', {
      operationId: 'op-1',
      correlationId: 'corr-1',
      db: getDb(),
    });

    expect(result.executed).toBe(true);
    expect(result.status).toBe('succeeded');
    expect(upsertPluginLedgerRecord).toHaveBeenCalled();
  });

  it('remains idempotent when rollback already succeeded', async () => {
    readLatestPluginCutoverRollbackCheckpoint.mockResolvedValueOnce({
      checkpointId: 'cp-1',
      pluginId: 'url-shortener',
      stage: 'after-enabled-settings-reconciliation',
      status: 'succeeded',
      attemptCount: 1,
      rollbackEligible: true,
      irreversibleBoundary: false,
      operationId: 'op-1',
      correlationId: 'corr-1',
      reason: 'done',
      evidence: {},
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const { executePluginCutoverRollback } = await import(
      '@core/lib/plugin-cutover-rollback-executor.server'
    );

    const result = await executePluginCutoverRollback('url-shortener', {
      operationId: 'op-1',
      correlationId: 'corr-1',
      db: getDb(),
    });

    expect(result.executed).toBe(false);
    expect(result.status).toBe('blocked');
  });
});
