import { beforeEach, describe, expect, it, vi } from 'vitest';

const runPluginLifecycleRecoveryScan = vi.hoisted(() => vi.fn());
const ensureMarketplaceInstallStartupReconciliation = vi.hoisted(() => vi.fn());

vi.mock('@core/lib/plugin-lifecycle-recovery-runner.server', () => ({
  runPluginLifecycleRecoveryScan,
}));

vi.mock('@core/lib/plugin-marketplace-install-operation.server', () => ({
  ensureMarketplaceInstallStartupReconciliation,
}));

import {
  ensurePluginStartupReadyForMutation,
  getPluginStartupReconciliationState,
  initializePluginStartupReconciliation,
  markPluginStartupReconciliationStateDirty,
  resetCanonicalPluginStartupReconciliationForTests,
} from '@core/lib/plugin-startup-reconciliation.server';

describe('plugin startup reconciliation guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCanonicalPluginStartupReconciliationForTests();
    ensureMarketplaceInstallStartupReconciliation.mockResolvedValue(undefined);
    runPluginLifecycleRecoveryScan.mockResolvedValue({
      scannedAt: '2026-07-20T00:00:00.000Z',
      pluginCount: 3,
      results: [
        { pluginId: 'calendar', action: 'none', reason: 'ok', operationId: null },
        { pluginId: 'gallery', action: 'none', reason: 'ok', operationId: null },
        { pluginId: 'url-shortener', action: 'none', reason: 'ok', operationId: null },
      ],
    });
  });

  it('runs reconciliation once and caches successful completion', async () => {
    await ensurePluginStartupReadyForMutation();
    const firstState = getPluginStartupReconciliationState();
    await ensurePluginStartupReadyForMutation();
    const secondState = getPluginStartupReconciliationState();

    expect(ensureMarketplaceInstallStartupReconciliation.mock.calls.length).toBeGreaterThanOrEqual(
      1
    );
    expect(runPluginLifecycleRecoveryScan.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(firstState?.initializedAt).toBeTruthy();
    expect(secondState?.initializedAt).toBe(firstState?.initializedAt);
  });

  it('shares one in-flight initialization across concurrent callers', async () => {
    let releaseGate: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    runPluginLifecycleRecoveryScan.mockImplementationOnce(async () => {
      await gate;
      return {
        scannedAt: '2026-07-20T00:00:01.000Z',
        pluginCount: 3,
        results: [
          { pluginId: 'calendar', action: 'none', reason: 'ok', operationId: null },
          { pluginId: 'gallery', action: 'none', reason: 'ok', operationId: null },
          { pluginId: 'url-shortener', action: 'none', reason: 'ok', operationId: null },
        ],
      };
    });

    const first = initializePluginStartupReconciliation();
    const second = initializePluginStartupReconciliation();
    releaseGate();

    await Promise.all([first, second]);

    expect(ensureMarketplaceInstallStartupReconciliation).toHaveBeenCalledTimes(1);
    expect(runPluginLifecycleRecoveryScan).toHaveBeenCalledTimes(1);
  });

  it('fails closed when lifecycle recovery blockers are detected', async () => {
    runPluginLifecycleRecoveryScan.mockResolvedValueOnce({
      scannedAt: '2026-07-20T00:00:00.000Z',
      pluginCount: 1,
      results: [
        {
          pluginId: 'url-shortener',
          action: 'require-recovery',
          reason: 'Interrupted migration checkpoint requires reconciliation.',
          operationId: 'op-1',
        },
      ],
    });

    await expect(ensurePluginStartupReadyForMutation()).rejects.toMatchObject({
      code: 'LIFECYCLE_RECOVERY_REQUIRED',
    });

    expect(ensureMarketplaceInstallStartupReconciliation).toHaveBeenCalledTimes(1);
    expect(runPluginLifecycleRecoveryScan).toHaveBeenCalledTimes(1);
    const state = getPluginStartupReconciliationState();
    expect(state?.blockerCount).toBe(1);
    expect(state?.blockers[0]?.pluginId).toBe('url-shortener');
  });

  it('allows retry after unexpected initialization failure', async () => {
    runPluginLifecycleRecoveryScan
      .mockRejectedValueOnce(new Error('temporary reconciliation outage'))
      .mockResolvedValueOnce({
        scannedAt: '2026-07-20T00:00:02.000Z',
        pluginCount: 3,
        results: [
          { pluginId: 'calendar', action: 'none', reason: 'ok', operationId: null },
          { pluginId: 'gallery', action: 'none', reason: 'ok', operationId: null },
          { pluginId: 'url-shortener', action: 'none', reason: 'ok', operationId: null },
        ],
      });

    await expect(initializePluginStartupReconciliation()).rejects.toThrow(
      /temporary reconciliation outage/
    );

    await expect(initializePluginStartupReconciliation()).resolves.toMatchObject({
      blockerCount: 0,
    });

    expect(runPluginLifecycleRecoveryScan).toHaveBeenCalledTimes(2);
  });

  it('re-evaluates mutation readiness after explicit dirty mark', async () => {
    await ensurePluginStartupReadyForMutation();
    expect(runPluginLifecycleRecoveryScan).toHaveBeenCalledTimes(1);

    runPluginLifecycleRecoveryScan.mockResolvedValueOnce({
      scannedAt: '2026-07-20T00:00:03.000Z',
      pluginCount: 1,
      results: [
        {
          pluginId: 'url-shortener',
          action: 'manual-intervention-required',
          reason: 'manual intervention required',
          operationId: 'op-manual',
        },
      ],
    });

    markPluginStartupReconciliationStateDirty();

    await expect(ensurePluginStartupReadyForMutation()).rejects.toMatchObject({
      code: 'LIFECYCLE_RECOVERY_REQUIRED',
    });

    expect(runPluginLifecycleRecoveryScan).toHaveBeenCalledTimes(2);
  });
});
