import { beforeEach, describe, expect, it, vi } from 'vitest';

const listPluginStates = vi.hoisted(() => vi.fn());
const reconcilePluginLifecycleState = vi.hoisted(() => vi.fn());
const readInterruptedPluginMigrationCheckpoint = vi.hoisted(() => vi.fn());
const determinePluginRollbackCompatibility = vi.hoisted(() => vi.fn());
const readPluginCutoverStateSnapshots = vi.hoisted(() => vi.fn());
const upsertPluginCutoverReconciliationState = vi.hoisted(() => vi.fn());
const appendPluginCutoverReconciliationEvent = vi.hoisted(() => vi.fn());
const readPluginCutoverReconciliationState = vi.hoisted(() => vi.fn());
const reconcileLegacyAndCanonicalPluginState = vi.hoisted(() => vi.fn());
const upsertPluginCutoverRollbackCheckpoint = vi.hoisted(() => vi.fn());
const readLatestPluginCutoverRollbackCheckpoint = vi.hoisted(() => vi.fn());
const markPluginStartupReconciliationStateDirty = vi.hoisted(() => vi.fn());
const buildPluginCutoverCleanupPlan = vi.hoisted(() => vi.fn());

vi.mock('@/db/plugins', () => ({
  listPluginStates,
}));

vi.mock('@core/lib/plugin-lifecycle-reconciler.server', () => ({
  reconcilePluginLifecycleState,
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
  readPluginCutoverReconciliationState,
}));

vi.mock('@core/lib/plugin-cutover-legacy-reconciler.server', () => ({
  reconcileLegacyAndCanonicalPluginState,
}));

vi.mock('@core/db/plugin-cutover-rollback', () => ({
  deriveCutoverRollbackPlanFromPhase: vi.fn(() => ({
    stage: 'after-enabled-settings-reconciliation',
    rollbackEligible: true,
    irreversibleBoundary: false,
    reason: 'rollback required',
  })),
  upsertPluginCutoverRollbackCheckpoint,
  readLatestPluginCutoverRollbackCheckpoint,
}));

vi.mock('@core/lib/plugin-cutover-reconciliation-classifier.server', () => ({
  classifyPluginCutoverState: vi.fn(() => ({
    pluginId: 'url-shortener',
    classification: 'rollback-required',
    reason: 'rollback required',
    blocking: true,
    evidence: {
      installed: true,
      enabled: true,
      lifecycleState: 'installed',
      operationStatus: 'idle',
      reconciliationAction: 'schedule-rollback',
      hasInterruptedMigrationCheckpoint: false,
      rollbackCompatible: true,
    },
  })),
}));

vi.mock('@core/lib/plugin-startup-reconciliation.server', () => ({
  markPluginStartupReconciliationStateDirty,
}));

vi.mock('@core/lib/plugin-cutover-cleanup-planner.server', () => ({
  buildPluginCutoverCleanupPlan,
}));

import { runPluginLifecycleRecoveryScan } from '@core/lib/plugin-lifecycle-recovery-runner.server';

describe('plugin lifecycle recovery runner rollback concurrency', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    listPluginStates.mockResolvedValue([
      {
        id: 'url-shortener',
        bundled: true,
        name: 'URL Shortener',
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
    ]);

    reconcilePluginLifecycleState.mockResolvedValue({
      action: 'schedule-rollback',
      reason: 'rollback required',
      operationId: 'op-rb-1',
    });
    readInterruptedPluginMigrationCheckpoint.mockResolvedValue(null);
    determinePluginRollbackCompatibility.mockResolvedValue({
      rollbackCompatible: true,
      reason: 'compatible',
    });
    readPluginCutoverStateSnapshots.mockResolvedValue([]);
    upsertPluginCutoverReconciliationState.mockResolvedValue({
      pluginId: 'url-shortener',
      phase: 'rollback-pending',
      operationId: 'op-rb-1',
      correlationId: 'op-rb-1',
      classification: 'rollback-required',
      blocking: true,
      reason: 'rollback required',
      evidence: { rollback: true },
      snapshot: null,
      inspectedAt: new Date().toISOString(),
      phaseUpdatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    appendPluginCutoverReconciliationEvent.mockResolvedValue(undefined);
    readPluginCutoverReconciliationState.mockResolvedValue({
      pluginId: 'url-shortener',
      phase: 'rollback-pending',
      operationId: 'op-rb-1',
      correlationId: 'op-rb-1',
      classification: 'rollback-required',
      blocking: true,
      reason: 'rollback required',
      evidence: { rollback: true },
      snapshot: null,
      inspectedAt: new Date().toISOString(),
      phaseUpdatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    reconcileLegacyAndCanonicalPluginState.mockResolvedValue({
      pluginId: 'url-shortener',
      topology: 'legacy-and-canonical',
      phase: 'rollback-pending',
      blocking: true,
      reason: 'rollback required',
      actions: ['detected-enabled-intent-disagreement'],
    });
    upsertPluginCutoverRollbackCheckpoint.mockResolvedValue(undefined);
    readLatestPluginCutoverRollbackCheckpoint.mockResolvedValue({
      checkpointId: 'cp-rb-1',
      pluginId: 'url-shortener',
      stage: 'after-enabled-settings-reconciliation',
      status: 'pending',
      attemptCount: 1,
      rollbackEligible: true,
      irreversibleBoundary: false,
      operationId: 'op-rb-1',
      correlationId: 'op-rb-1',
      reason: 'rollback required',
      evidence: { rollback: true },
      startedAt: new Date().toISOString(),
      completedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    buildPluginCutoverCleanupPlan.mockResolvedValue({
      pluginId: 'url-shortener',
      mode: 'tombstone',
      cleanupEligible: false,
      blockers: ['rollback-in-progress'],
      rollbackAvailable: true,
      irreversibleBoundary: false,
      hasLegacyEnabledSetting: true,
      hasLogicalDecommissionMarker: true,
      hasCleanupTombstoneMarker: false,
      proposedChanges: ['delete-legacy-enabled-setting', 'write-legacy-tombstone-marker'],
      excludedDomainDataTables: [],
      stateBinding: {
        pluginId: 'url-shortener',
        canonicalIdentity: {
          lifecycleState: 'installed',
          installedVersion: '0.1.0',
          bundledVersion: '0.1.0',
          enabled: true,
          manifestChecksum: null,
          updatedAtIso: null,
        },
        legacyIdentity: {
          hasLegacyEnabledSetting: true,
          hasLogicalDecommissionMarker: true,
          hasCleanupTombstoneMarker: false,
        },
        cutoverIdentity: {
          phase: 'legacy-path-decommissioned',
          classification: 'legacy-logically-decommissioned',
          blocking: false,
          updatedAtIso: null,
        },
        rollbackIdentity: {
          status: 'running',
          rollbackEligible: true,
          irreversibleBoundary: false,
          attemptCount: 1,
        },
        operationIdentity: {
          hasActiveOperation: false,
          activeOperationId: null,
        },
      },
      stateFingerprint: 'fp-rollback-concurrency',
    });
  });

  it('persists rollback checkpoint when schedule-rollback appears in concurrent scan callers', async () => {
    await Promise.all([runPluginLifecycleRecoveryScan(), runPluginLifecycleRecoveryScan()]);

    expect(upsertPluginCutoverRollbackCheckpoint).toHaveBeenCalled();
    expect(markPluginStartupReconciliationStateDirty).toHaveBeenCalledTimes(2);
  });
});
