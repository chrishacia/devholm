import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { reconcilePluginLifecycleState } from '@core/lib/plugin-lifecycle-reconciler.server';

const {
  findActivePluginLifecycleOperation,
  readLatestPluginLifecycleTransitionEventRecord,
  readInterruptedPluginMigrationCheckpoint,
  determinePluginRollbackCompatibility,
} = vi.hoisted(() => ({
  findActivePluginLifecycleOperation: vi.fn(),
  readLatestPluginLifecycleTransitionEventRecord: vi.fn(),
  readInterruptedPluginMigrationCheckpoint: vi.fn(),
  determinePluginRollbackCompatibility: vi.fn(),
}));

vi.mock('@core/db/plugin-lifecycle', () => ({
  findActivePluginLifecycleOperation,
  readLatestPluginLifecycleTransitionEventRecord,
}));

vi.mock('@core/db/plugin-migration-checkpoints', () => ({
  readInterruptedPluginMigrationCheckpoint,
  determinePluginRollbackCompatibility,
}));

describe('reconcilePluginLifecycleState', () => {
  const now = new Date('2026-01-01T00:00:00.000Z').valueOf();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    determinePluginRollbackCompatibility.mockResolvedValue({
      rollbackCompatible: true,
      reason: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns none when no active operation exists', async () => {
    findActivePluginLifecycleOperation.mockResolvedValue(null);

    const result = await reconcilePluginLifecycleState('url-shortener');

    expect(result).toEqual({
      action: 'none',
      reason: 'No nonterminal lifecycle operation detected.',
      operationId: null,
    });
  });

  it('returns resume-safe-retry for active non-expired lease', async () => {
    findActivePluginLifecycleOperation.mockResolvedValue({
      operationId: 'op-1',
      leaseExpiresAt: new Date(now + 60_000).toISOString(),
    });

    const result = await reconcilePluginLifecycleState('url-shortener');

    expect(result.action).toBe('resume-safe-retry');
    expect(result.operationId).toBe('op-1');
  });

  it('returns finalize-proven-success when success event exists for expired operation', async () => {
    findActivePluginLifecycleOperation.mockResolvedValue({
      operationId: 'op-1',
      leaseExpiresAt: new Date(now - 60_000).toISOString(),
    });
    readLatestPluginLifecycleTransitionEventRecord.mockResolvedValue({
      operationId: 'op-1',
      result: 'succeeded',
    });
    readInterruptedPluginMigrationCheckpoint.mockResolvedValue(null);

    const result = await reconcilePluginLifecycleState('url-shortener');

    expect(result.action).toBe('finalize-proven-success');
  });

  it('returns require-recovery for interrupted migration checkpoint', async () => {
    findActivePluginLifecycleOperation.mockResolvedValue({
      operationId: 'op-1',
      leaseExpiresAt: new Date(now - 60_000).toISOString(),
      nextStateSnapshot: null,
      priorStateSnapshot: null,
    });
    readLatestPluginLifecycleTransitionEventRecord.mockResolvedValue(null);
    readInterruptedPluginMigrationCheckpoint.mockResolvedValue({
      checkpointId: 'checkpoint-1',
      migrationId: 'url-shortener:001',
    });

    const result = await reconcilePluginLifecycleState('url-shortener');

    expect(result.action).toBe('require-recovery');
  });

  it('returns schedule-rollback when rollback is available', async () => {
    findActivePluginLifecycleOperation.mockResolvedValue({
      operationId: 'op-1',
      leaseExpiresAt: new Date(now - 60_000).toISOString(),
      nextStateSnapshot: {
        installedVersion: '2.0.0',
      },
      priorStateSnapshot: {
        installedVersion: '1.0.0',
      },
    });
    readLatestPluginLifecycleTransitionEventRecord.mockResolvedValue({
      artifactDigest: 'sha256:abc',
    });
    readInterruptedPluginMigrationCheckpoint.mockResolvedValue(null);
    determinePluginRollbackCompatibility.mockResolvedValue({
      rollbackCompatible: true,
      reason: null,
    });

    const result = await reconcilePluginLifecycleState('url-shortener');

    expect(result.action).toBe('schedule-rollback');
  });

  it('returns require-recovery when rollback evaluator reports recovery-required', async () => {
    findActivePluginLifecycleOperation.mockResolvedValue({
      operationId: 'op-1',
      leaseExpiresAt: new Date(now - 60_000).toISOString(),
      nextStateSnapshot: {
        installedVersion: '2.0.0',
      },
      priorStateSnapshot: {
        installedVersion: '1.0.0',
      },
    });
    readLatestPluginLifecycleTransitionEventRecord.mockResolvedValue({
      artifactDigest: null,
    });
    readInterruptedPluginMigrationCheckpoint.mockResolvedValue(null);
    determinePluginRollbackCompatibility.mockResolvedValue({
      rollbackCompatible: false,
      reason: 'irreversible-migrations-present',
    });

    const result = await reconcilePluginLifecycleState('url-shortener');

    expect(result.action).toBe('require-recovery');
  });
});
