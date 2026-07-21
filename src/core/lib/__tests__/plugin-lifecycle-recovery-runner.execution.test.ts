import { beforeEach, describe, expect, it, vi } from 'vitest';

const getDb = vi.hoisted(() => vi.fn());
const reconcilePluginLifecycleState = vi.hoisted(() => vi.fn());
const markPluginStartupReconciliationStateDirty = vi.hoisted(() => vi.fn());
const findActivePluginLifecycleOperation = vi.hoisted(() => vi.fn());
const writePluginLifecycleOperationRecord = vi.hoisted(() => vi.fn());
const writePluginLifecycleTransitionEvent = vi.hoisted(() => vi.fn());

vi.mock('@/db', () => ({
  getDb,
}));

vi.mock('@core/lib/plugin-lifecycle-reconciler.server', () => ({
  reconcilePluginLifecycleState,
}));

vi.mock('@core/lib/plugin-startup-reconciliation.server', () => ({
  markPluginStartupReconciliationStateDirty,
}));

vi.mock('@core/db/plugin-lifecycle', () => ({
  findActivePluginLifecycleOperation,
  writePluginLifecycleOperationRecord,
  writePluginLifecycleTransitionEvent,
}));

vi.mock('@/db/plugins', () => ({
  listPluginStates: vi.fn(async () => []),
}));

vi.mock('@core/db/plugin-migration-checkpoints', () => ({
  readInterruptedPluginMigrationCheckpoint: vi.fn(async () => null),
  determinePluginRollbackCompatibility: vi.fn(async () => ({
    rollbackCompatible: true,
    reason: 'compatible',
  })),
}));

vi.mock('@core/lib/plugin-cutover-state-snapshot.server', () => ({
  readPluginCutoverStateSnapshots: vi.fn(async () => []),
}));

vi.mock('@core/lib/plugin-cutover-reconciliation-classifier.server', () => ({
  classifyPluginCutoverState: vi.fn(() => ({
    pluginId: 'url-shortener',
    classification: 'already-canonical',
    reason: 'mock',
    blocking: false,
    evidence: {
      installed: true,
      enabled: true,
      lifecycleState: 'installed',
      operationStatus: 'idle',
      reconciliationAction: 'none',
      hasInterruptedMigrationCheckpoint: false,
      rollbackCompatible: true,
    },
  })),
}));

import { reconcileSinglePluginLifecycle } from '@core/lib/plugin-lifecycle-recovery-runner.server';

function createDbMock() {
  return {
    transaction: vi.fn(async (callback: (trx: unknown) => Promise<void>) => callback({})),
  };
}

describe('plugin lifecycle recovery runner execution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDb.mockReturnValue(createDbMock());
    findActivePluginLifecycleOperation.mockResolvedValue({
      schemaVersion: 1,
      operationId: 'op-1',
      pluginId: 'url-shortener',
      action: 'enable',
      status: 'running',
      actor: 'admin@example.com',
      correlationId: 'corr-1',
      currentPhase: 'executing',
      startedAt: '2026-07-20T00:00:00.000Z',
      updatedAt: '2026-07-20T00:00:00.000Z',
      attemptCount: 1,
      priorStateSnapshot: {
        installed: true,
        enabled: false,
        lifecycleState: 'installed',
        operationStatus: 'idle',
        installedVersion: '0.1.0',
        bundledVersion: '0.1.0',
        updatedAt: null,
      },
    });
    writePluginLifecycleOperationRecord.mockResolvedValue(undefined);
    writePluginLifecycleTransitionEvent.mockResolvedValue(undefined);
  });

  it('finalizes proven success operations during explicit recovery execution', async () => {
    reconcilePluginLifecycleState.mockResolvedValueOnce({
      action: 'finalize-proven-success',
      reason: 'Success event exists for expired operation; finalize terminal record.',
      operationId: 'op-1',
    });

    const result = await reconcileSinglePluginLifecycle('url-shortener');

    expect(result.executed).toBe(true);
    expect(writePluginLifecycleOperationRecord).toHaveBeenCalledTimes(1);
    expect(writePluginLifecycleTransitionEvent).not.toHaveBeenCalled();
    expect(markPluginStartupReconciliationStateDirty).toHaveBeenCalledTimes(1);
  });

  it('takes over expired lease by marking interrupted and writing failure transition event', async () => {
    reconcilePluginLifecycleState.mockResolvedValueOnce({
      action: 'take-over-expired-lease',
      reason: 'Expired lease detected; takeover can proceed under orchestrator authority.',
      operationId: 'op-1',
    });

    const result = await reconcileSinglePluginLifecycle('url-shortener');

    expect(result.executed).toBe(true);
    expect(writePluginLifecycleOperationRecord).toHaveBeenCalledTimes(1);
    expect(writePluginLifecycleTransitionEvent).toHaveBeenCalledTimes(1);
    expect(markPluginStartupReconciliationStateDirty).toHaveBeenCalledTimes(1);
  });

  it('does not mutate durable records for require-recovery/manual states', async () => {
    reconcilePluginLifecycleState.mockResolvedValueOnce({
      action: 'require-recovery',
      reason: 'Interrupted migration checkpoint requires explicit reconciliation.',
      operationId: 'op-1',
    });

    const result = await reconcileSinglePluginLifecycle('url-shortener');

    expect(result.executed).toBe(false);
    expect(writePluginLifecycleOperationRecord).not.toHaveBeenCalled();
    expect(writePluginLifecycleTransitionEvent).not.toHaveBeenCalled();
    expect(markPluginStartupReconciliationStateDirty).toHaveBeenCalledTimes(1);
  });

  it('treats schedule-rollback as executable recovery path without implicit mutation', async () => {
    reconcilePluginLifecycleState.mockResolvedValueOnce({
      action: 'schedule-rollback',
      reason: 'Expired operation requires rollback path: available.',
      operationId: 'op-1',
    });

    const result = await reconcileSinglePluginLifecycle('url-shortener');

    expect(result.action).toBe('schedule-rollback');
    expect(result.executed).toBe(false);
    expect(writePluginLifecycleOperationRecord).not.toHaveBeenCalled();
    expect(writePluginLifecycleTransitionEvent).not.toHaveBeenCalled();
    expect(markPluginStartupReconciliationStateDirty).toHaveBeenCalledTimes(1);
  });
});
