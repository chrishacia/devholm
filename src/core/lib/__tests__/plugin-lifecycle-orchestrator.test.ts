import { beforeEach, describe, expect, it, vi } from 'vitest';

const getDb = vi.hoisted(() => vi.fn());
const getPluginState = vi.hoisted(() => vi.fn());
const installPlugin = vi.hoisted(() => vi.fn());
const enablePlugin = vi.hoisted(() => vi.fn());
const disablePlugin = vi.hoisted(() => vi.fn());
const findActivePluginLifecycleOperation = vi.hoisted(() => vi.fn());
const findPluginLifecycleOperationByIdempotencyKey = vi.hoisted(() => vi.fn());
const getInstalledPlugin = vi.hoisted(() => vi.fn());
const upsertPluginLedgerRecord = vi.hoisted(() => vi.fn());
const writePluginLifecycleOperationRecord = vi.hoisted(() => vi.fn());
const writePluginLifecycleTransitionEvent = vi.hoisted(() => vi.fn());
const readLatestPluginLifecycleOperationRecord = vi.hoisted(() => vi.fn());
const reconcilePluginLifecycleState = vi.hoisted(() => vi.fn());
const getBundledPluginManifests = vi.hoisted(() => vi.fn());

vi.mock('@/db', () => ({
  getDb,
}));

vi.mock('@core/db/plugins', () => ({
  getPluginState,
}));

vi.mock('@core/lib/plugin-lifecycle.server', () => ({
  installPlugin,
  enablePlugin,
  disablePlugin,
}));

vi.mock('@core/db/plugin-lifecycle', () => ({
  findActivePluginLifecycleOperation,
  findPluginLifecycleOperationByIdempotencyKey,
  getInstalledPlugin,
  upsertPluginLedgerRecord,
  writePluginLifecycleOperationRecord,
  writePluginLifecycleTransitionEvent,
  readLatestPluginLifecycleOperationRecord,
}));

vi.mock('@core/lib/plugin-registry.server', () => ({
  getBundledPluginManifests,
}));

vi.mock('@core/lib/plugin-lifecycle-reconciler.server', () => ({
  reconcilePluginLifecycleState,
}));

import { orchestratePluginLifecycleMutation } from '@core/lib/plugin-lifecycle-orchestrator.server';
import { PluginLifecycleError } from '@core/lib/plugin-lifecycle-errors';

function createDbMock() {
  return {
    transaction: vi.fn(async (callback: (trx: unknown) => Promise<void>) => callback({})),
  };
}

describe('plugin lifecycle orchestration facade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getInstalledPlugin.mockResolvedValue({
      pluginId: 'url-shortener',
      bundledVersion: '1.0.0',
      installedVersion: '1.0.0',
      enabled: false,
      lifecycleState: 'installed',
      operationStatus: 'idle',
      installedAt: null,
      upgradedAt: null,
      disabledAt: null,
      updatedAt: null,
      lastError: null,
      manifestChecksum: null,
    });
    upsertPluginLedgerRecord.mockResolvedValue(undefined);
    getBundledPluginManifests.mockReturnValue([
      {
        id: 'url-shortener',
        name: 'URL Shortener',
        version: '1.0.0',
      },
    ]);
    reconcilePluginLifecycleState.mockResolvedValue({
      action: 'none',
      reason: 'default test reconciliation',
      operationId: null,
    });
  });

  it('records durable operation state and an audit event on success', async () => {
    const dbMock = createDbMock();
    getDb.mockReturnValue(dbMock);
    findPluginLifecycleOperationByIdempotencyKey.mockResolvedValue(null);
    findActivePluginLifecycleOperation.mockResolvedValue(null);
    writePluginLifecycleOperationRecord.mockResolvedValue(undefined);
    writePluginLifecycleTransitionEvent.mockResolvedValue(undefined);
    getPluginState
      .mockResolvedValueOnce({
        installed: false,
        isEnabled: false,
        lifecycleState: 'bundled',
        operationStatus: 'idle',
        installedVersion: null,
        bundledVersion: '1.0.0',
        updatedAt: null,
      })
      .mockResolvedValueOnce({
        installed: false,
        isEnabled: false,
        lifecycleState: 'bundled',
        operationStatus: 'idle',
        installedVersion: null,
        bundledVersion: '1.0.0',
        updatedAt: null,
      })
      .mockResolvedValueOnce({
        installed: true,
        isEnabled: false,
        lifecycleState: 'installed',
        operationStatus: 'idle',
        installedVersion: '1.0.0',
        bundledVersion: '1.0.0',
        updatedAt: new Date('2026-07-16T00:00:00.000Z'),
      });
    installPlugin.mockResolvedValue(undefined);

    await orchestratePluginLifecycleMutation({
      action: 'install',
      pluginId: 'url-shortener',
      initiatedBy: 'admin@example.com',
      idempotencyKey: 'idemp-install-1',
      authorizationContext: { isAdmin: true },
    });

    expect(installPlugin).toHaveBeenCalledWith('url-shortener', {
      initiatedBy: 'admin@example.com',
    });
    expect(writePluginLifecycleOperationRecord).toHaveBeenCalledTimes(2);
    expect(writePluginLifecycleTransitionEvent).toHaveBeenCalledTimes(1);

    const firstWrite = writePluginLifecycleOperationRecord.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    const secondWrite = writePluginLifecycleOperationRecord.mock.calls[1]?.[0] as Record<
      string,
      unknown
    >;
    const thirdWrite = writePluginLifecycleTransitionEvent.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;

    expect(firstWrite).toMatchObject({
      schemaVersion: 1,
      pluginId: 'url-shortener',
      action: 'install',
      idempotencyKey: 'idemp-install-1',
      status: 'running',
      actor: 'admin@example.com',
      currentPhase: 'executing',
      attemptCount: 1,
      mutationAuthorityVersion: 'v2',
    });
    expect(secondWrite).toMatchObject({
      schemaVersion: 1,
      pluginId: 'url-shortener',
      action: 'install',
      idempotencyKey: 'idemp-install-1',
      status: 'succeeded',
      actor: 'admin@example.com',
      currentPhase: 'completed',
      attemptCount: 1,
    });
    expect(thirdWrite).toMatchObject({
      schemaVersion: 1,
      pluginId: 'url-shortener',
      transition: 'install',
      result: 'succeeded',
      actor: 'admin@example.com',
    });
  });

  it('records a failed operation and audit event when the underlying mutation fails', async () => {
    const dbMock = createDbMock();
    getDb.mockReturnValue(dbMock);
    findPluginLifecycleOperationByIdempotencyKey.mockResolvedValue(null);
    findActivePluginLifecycleOperation.mockResolvedValue(null);
    writePluginLifecycleOperationRecord.mockResolvedValue(undefined);
    writePluginLifecycleTransitionEvent.mockResolvedValue(undefined);
    getPluginState
      .mockResolvedValueOnce({
        installed: true,
        isEnabled: true,
        lifecycleState: 'installed',
        operationStatus: 'idle',
        installedVersion: '1.0.0',
        bundledVersion: '1.0.0',
        updatedAt: new Date('2026-07-16T00:00:00.000Z'),
      })
      .mockResolvedValueOnce({
        installed: true,
        isEnabled: true,
        lifecycleState: 'installed',
        operationStatus: 'idle',
        installedVersion: '1.0.0',
        bundledVersion: '1.0.0',
        updatedAt: new Date('2026-07-16T00:00:00.000Z'),
      });
    disablePlugin.mockRejectedValue(
      new Error('Cannot disable url-shortener: plugin is not installed')
    );

    await expect(
      orchestratePluginLifecycleMutation({
        action: 'disable',
        pluginId: 'url-shortener',
        initiatedBy: 'admin@example.com',
      })
    ).rejects.toThrow('Cannot disable url-shortener: plugin is not installed');

    expect(writePluginLifecycleOperationRecord).toHaveBeenCalledTimes(2);
    expect(writePluginLifecycleTransitionEvent).toHaveBeenCalledTimes(1);

    const operationWrite = writePluginLifecycleOperationRecord.mock.calls[1]?.[0] as Record<
      string,
      unknown
    >;
    const eventWrite = writePluginLifecycleTransitionEvent.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;

    expect(operationWrite).toMatchObject({
      pluginId: 'url-shortener',
      action: 'disable',
      status: 'failed',
      error: {
        code: 'LIFECYCLE_INVALID_TRANSITION',
      },
    });
    expect(eventWrite).toMatchObject({
      pluginId: 'url-shortener',
      transition: 'disable',
      result: 'failed',
      error: {
        code: 'LIFECYCLE_INVALID_TRANSITION',
      },
    });
  });

  it('rejects stale expected lifecycle state before mutation', async () => {
    const dbMock = createDbMock();
    getDb.mockReturnValue(dbMock);
    getPluginState
      .mockResolvedValueOnce({
        installed: true,
        isEnabled: false,
        lifecycleState: 'installed',
        operationStatus: 'idle',
        installedVersion: '1.0.0',
        bundledVersion: '1.0.0',
        updatedAt: new Date('2026-07-16T00:00:00.000Z'),
      })
      .mockResolvedValueOnce({
        installed: true,
        isEnabled: false,
        lifecycleState: 'installed',
        operationStatus: 'idle',
        installedVersion: '1.0.0',
        bundledVersion: '1.0.0',
        updatedAt: new Date('2026-07-16T00:00:00.000Z'),
      });

    await expect(
      orchestratePluginLifecycleMutation({
        action: 'enable',
        pluginId: 'url-shortener',
        expectedLifecycleState: 'disabled',
      })
    ).rejects.toMatchObject({ code: 'LIFECYCLE_STALE_OPERATION' } as PluginLifecycleError);

    expect(enablePlugin).not.toHaveBeenCalled();
    expect(writePluginLifecycleOperationRecord).not.toHaveBeenCalled();
    expect(writePluginLifecycleTransitionEvent).not.toHaveBeenCalled();
  });

  it('replays succeeded operation for repeated idempotency key', async () => {
    const dbMock = createDbMock();
    getDb.mockReturnValue(dbMock);
    findPluginLifecycleOperationByIdempotencyKey.mockResolvedValue({
      schemaVersion: 1,
      operationId: 'op-existing',
      pluginId: 'url-shortener',
      action: 'enable',
      idempotencyKey: 'idem-1',
      status: 'succeeded',
      correlationId: 'corr-existing',
      currentPhase: 'completed',
      startedAt: '2026-07-16T00:00:00.000Z',
      updatedAt: '2026-07-16T00:00:01.000Z',
      attemptCount: 1,
      priorStateSnapshot: null,
    });
    getPluginState
      .mockResolvedValueOnce({
        installed: true,
        isEnabled: false,
        lifecycleState: 'installed',
        operationStatus: 'idle',
        installedVersion: '1.0.0',
        bundledVersion: '1.0.0',
        updatedAt: new Date('2026-07-16T00:00:00.000Z'),
      })
      .mockResolvedValueOnce({
        installed: true,
        isEnabled: false,
        lifecycleState: 'installed',
        operationStatus: 'idle',
        installedVersion: '1.0.0',
        bundledVersion: '1.0.0',
        updatedAt: new Date('2026-07-16T00:00:00.000Z'),
      });

    const result = await orchestratePluginLifecycleMutation({
      action: 'enable',
      pluginId: 'url-shortener',
      idempotencyKey: 'idem-1',
    });

    expect(result).toEqual({
      operationId: 'op-existing',
      status: 'succeeded',
      replayed: true,
    });
    expect(enablePlugin).not.toHaveBeenCalled();
    expect(writePluginLifecycleOperationRecord).not.toHaveBeenCalled();
    expect(writePluginLifecycleTransitionEvent).not.toHaveBeenCalled();
  });

  it('rejects operation when another active operation exists', async () => {
    const dbMock = createDbMock();
    getDb.mockReturnValue(dbMock);
    findPluginLifecycleOperationByIdempotencyKey.mockResolvedValue(null);
    findActivePluginLifecycleOperation.mockResolvedValue({
      schemaVersion: 1,
      operationId: 'op-running',
      pluginId: 'url-shortener',
      action: 'disable',
      status: 'running',
      correlationId: 'corr-running',
      currentPhase: 'executing',
      startedAt: '2026-07-16T00:00:00.000Z',
      updatedAt: '2026-07-16T00:00:01.000Z',
      attemptCount: 1,
      priorStateSnapshot: null,
    });
    reconcilePluginLifecycleState.mockResolvedValue({
      action: 'resume-safe-retry',
      reason: 'lease active',
      operationId: 'op-running',
    });
    getPluginState
      .mockResolvedValueOnce({
        installed: true,
        isEnabled: false,
        lifecycleState: 'installed',
        operationStatus: 'idle',
        installedVersion: '1.0.0',
        bundledVersion: '1.0.0',
        updatedAt: new Date('2026-07-16T00:00:00.000Z'),
      })
      .mockResolvedValueOnce({
        installed: true,
        isEnabled: false,
        lifecycleState: 'installed',
        operationStatus: 'idle',
        installedVersion: '1.0.0',
        bundledVersion: '1.0.0',
        updatedAt: new Date('2026-07-16T00:00:00.000Z'),
      });

    await expect(
      orchestratePluginLifecycleMutation({
        action: 'enable',
        pluginId: 'url-shortener',
        idempotencyKey: 'idem-2',
      })
    ).rejects.toMatchObject({ code: 'LIFECYCLE_OPERATION_CONFLICT' } as PluginLifecycleError);

    expect(enablePlugin).not.toHaveBeenCalled();
    expect(writePluginLifecycleOperationRecord).not.toHaveBeenCalled();
    expect(writePluginLifecycleTransitionEvent).not.toHaveBeenCalled();
  });

  it('reconciles expired active operation lease before taking ownership', async () => {
    const dbMock = createDbMock();
    getDb.mockReturnValue(dbMock);
    findPluginLifecycleOperationByIdempotencyKey.mockResolvedValue(null);
    findActivePluginLifecycleOperation
      .mockResolvedValueOnce({
        schemaVersion: 1,
        operationId: 'op-expired',
        pluginId: 'url-shortener',
        action: 'disable',
        status: 'running',
        actor: 'admin@example.com',
        leaseOwner: 'worker-1',
        leaseExpiresAt: '2000-01-01T00:00:00.000Z',
        correlationId: 'corr-expired',
        currentPhase: 'executing',
        startedAt: '2026-07-16T00:00:00.000Z',
        updatedAt: '2026-07-16T00:00:01.000Z',
        attemptCount: 1,
        priorStateSnapshot: null,
      })
      .mockResolvedValueOnce(null);
    reconcilePluginLifecycleState.mockResolvedValue({
      action: 'take-over-expired-lease',
      reason: 'expired lease',
      operationId: 'op-expired',
    });
    writePluginLifecycleOperationRecord.mockResolvedValue(undefined);
    writePluginLifecycleTransitionEvent.mockResolvedValue(undefined);
    getPluginState
      .mockResolvedValueOnce({
        installed: true,
        isEnabled: false,
        lifecycleState: 'installed',
        operationStatus: 'idle',
        installedVersion: '1.0.0',
        bundledVersion: '1.0.0',
        updatedAt: new Date('2026-07-16T00:00:00.000Z'),
      })
      .mockResolvedValueOnce({
        installed: true,
        isEnabled: false,
        lifecycleState: 'installed',
        operationStatus: 'idle',
        installedVersion: '1.0.0',
        bundledVersion: '1.0.0',
        updatedAt: new Date('2026-07-16T00:00:00.000Z'),
      })
      .mockResolvedValueOnce({
        installed: true,
        isEnabled: true,
        lifecycleState: 'installed',
        operationStatus: 'idle',
        installedVersion: '1.0.0',
        bundledVersion: '1.0.0',
        updatedAt: new Date('2026-07-16T00:00:02.000Z'),
      });
    enablePlugin.mockResolvedValue(undefined);

    const result = await orchestratePluginLifecycleMutation({
      action: 'enable',
      pluginId: 'url-shortener',
      initiatedBy: 'admin@example.com',
      idempotencyKey: 'idem-takeover-1',
    });

    expect(result.status).toBe('succeeded');
    expect(result.replayed).toBe(false);
    expect(enablePlugin).toHaveBeenCalledTimes(1);
    expect(writePluginLifecycleOperationRecord).toHaveBeenCalledTimes(3);
    expect(writePluginLifecycleTransitionEvent).toHaveBeenCalledTimes(2);

    const reconciledOperation = writePluginLifecycleOperationRecord.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(reconciledOperation).toMatchObject({
      operationId: 'op-expired',
      status: 'interrupted',
      currentPhase: 'completed',
      error: {
        code: 'LIFECYCLE_STALE_OPERATION',
      },
    });
  });
});
