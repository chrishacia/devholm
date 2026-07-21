import { beforeEach, describe, expect, it, vi } from 'vitest';

const listPluginStates = vi.hoisted(() => vi.fn());
const reconcilePluginLifecycleState = vi.hoisted(() => vi.fn());
const markPluginStartupReconciliationStateDirty = vi.hoisted(() => vi.fn());
const readInterruptedPluginMigrationCheckpoint = vi.hoisted(() => vi.fn());
const determinePluginRollbackCompatibility = vi.hoisted(() => vi.fn());
const readPluginCutoverStateSnapshots = vi.hoisted(() => vi.fn());
const upsertPluginCutoverReconciliationState = vi.hoisted(() => vi.fn());
const appendPluginCutoverReconciliationEvent = vi.hoisted(() => vi.fn());

vi.mock('@/db/plugins', () => ({
  listPluginStates,
}));

vi.mock('@core/lib/plugin-lifecycle-reconciler.server', () => ({
  reconcilePluginLifecycleState,
}));

vi.mock('@core/lib/plugin-startup-reconciliation.server', () => ({
  markPluginStartupReconciliationStateDirty,
}));

vi.mock('@core/db/plugin-migration-checkpoints', () => ({
  readInterruptedPluginMigrationCheckpoint,
  determinePluginRollbackCompatibility,
}));

vi.mock('@core/lib/plugin-cutover-state-snapshot.server', () => ({
  readPluginCutoverStateSnapshots,
}));

vi.mock('@core/db/plugin-cutover-reconciliation', () => ({
  upsertPluginCutoverReconciliationState,
  appendPluginCutoverReconciliationEvent,
}));

import {
  runPluginLifecycleRecoveryScan,
  reconcileSinglePluginLifecycle,
} from '@core/lib/plugin-lifecycle-recovery-runner.server';

describe('plugin lifecycle recovery runner cutover behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    listPluginStates.mockResolvedValue([
      {
        id: 'calendar',
        bundled: true,
        name: 'Calendar',
        description: null,
        source: 'user',
        enabledByDefault: false,
        adminSurface: null,
        capabilities: {
          admin: true,
          api: true,
          publicRoutes: true,
          navigation: true,
          sitemap: false,
          embeds: false,
        },
        installed: true,
        isEnabled: true,
        lifecycleState: 'installed',
        operationStatus: 'idle',
        installedVersion: '0.1.0',
        bundledVersion: '0.1.0',
        updatedAt: null,
      },
      {
        id: 'gallery',
        bundled: true,
        name: 'Gallery',
        description: null,
        source: 'user',
        enabledByDefault: false,
        adminSurface: null,
        capabilities: {
          admin: true,
          api: true,
          publicRoutes: true,
          navigation: true,
          sitemap: false,
          embeds: false,
        },
        installed: true,
        isEnabled: true,
        lifecycleState: 'bundled',
        operationStatus: 'idle',
        installedVersion: '0.1.0',
        bundledVersion: '0.1.0',
        updatedAt: null,
      },
    ]);

    reconcilePluginLifecycleState
      .mockResolvedValueOnce({
        action: 'none',
        reason: 'No nonterminal lifecycle operation detected.',
        operationId: null,
      })
      .mockResolvedValueOnce({
        action: 'none',
        reason: 'No nonterminal lifecycle operation detected.',
        operationId: null,
      })
      .mockResolvedValue({
        action: 'resume-safe-retry',
        reason: 'Active operation lease is still valid and may continue safely.',
        operationId: 'op-1',
      });

    readInterruptedPluginMigrationCheckpoint
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValue(null);

    determinePluginRollbackCompatibility
      .mockResolvedValueOnce({ rollbackCompatible: true, reason: 'compatible' })
      .mockResolvedValueOnce({ rollbackCompatible: true, reason: 'compatible' })
      .mockResolvedValue({ rollbackCompatible: true, reason: 'compatible' });

    readPluginCutoverStateSnapshots.mockResolvedValue([
      {
        pluginId: 'calendar',
        hasEnabledSetting: true,
        enabledSettingValue: 'true',
        hasLifecycleRecord: true,
        lifecycleState: 'installed',
        operationStatus: 'idle',
        installedVersion: '0.1.0',
        activeLifecycleOperationCount: 0,
        runningMigrationCheckpointCount: 0,
        succeededMigrationCount: 3,
        contradictoryState: false,
        contradictionReasons: [],
      },
      {
        pluginId: 'gallery',
        hasEnabledSetting: true,
        enabledSettingValue: 'true',
        hasLifecycleRecord: true,
        lifecycleState: 'bundled',
        operationStatus: 'idle',
        installedVersion: '0.1.0',
        activeLifecycleOperationCount: 0,
        runningMigrationCheckpointCount: 0,
        succeededMigrationCount: 1,
        contradictoryState: true,
        contradictionReasons: ['bundled-state-has-installed-version'],
      },
    ]);
    upsertPluginCutoverReconciliationState.mockImplementation(async (input) => ({
      pluginId: input.pluginId,
      phase: input.phase,
      operationId: input.operationId ?? null,
      correlationId: input.correlationId ?? null,
      classification: input.classification ?? null,
      blocking: input.blocking,
      reason: input.reason ?? null,
      evidence: input.evidence ?? null,
      snapshot: input.snapshot ?? null,
      inspectedAt: new Date().toISOString(),
      phaseUpdatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    appendPluginCutoverReconciliationEvent.mockResolvedValue(undefined);
  });

  it('returns deterministic cutover + snapshot outputs and marks startup state dirty', async () => {
    const result = await runPluginLifecycleRecoveryScan({ limit: 2 });

    expect(result.pluginCount).toBe(2);
    expect(result.results[0]?.pluginId).toBe('calendar');
    expect(result.results[0]?.cutover?.classification).toBe('already-canonical');
    expect(result.results[0]?.snapshot?.contradictoryState).toBe(false);

    expect(result.results[1]?.pluginId).toBe('gallery');
    expect(result.results[1]?.cutover?.classification).toBe('incompatible-legacy-state');
    expect(result.results[1]?.snapshot?.contradictoryState).toBe(true);

    expect(markPluginStartupReconciliationStateDirty).toHaveBeenCalledTimes(1);
    expect(upsertPluginCutoverReconciliationState).toHaveBeenCalledTimes(2);
    expect(appendPluginCutoverReconciliationEvent).toHaveBeenCalledTimes(2);
  });

  it('marks startup state dirty after single-plugin reconciliation', async () => {
    const single = await reconcileSinglePluginLifecycle('calendar');

    expect(single.action).toBeTruthy();
    expect(reconcilePluginLifecycleState).toHaveBeenCalledWith('calendar');
    expect(markPluginStartupReconciliationStateDirty).toHaveBeenCalledTimes(1);
    expect(upsertPluginCutoverReconciliationState).toHaveBeenCalledTimes(1);
    expect(appendPluginCutoverReconciliationEvent).toHaveBeenCalledTimes(1);
  });
});
