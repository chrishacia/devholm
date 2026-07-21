import type { PluginAdminRecord } from '@core/types/plugins';
import type { LifecycleReconciliationResult } from '@core/lib/plugin-lifecycle-reconciler.server';

export type PluginCutoverClassification =
  | 'already-canonical'
  | 'safe-automatic-migration'
  | 'migration-pending'
  | 'migration-resumed'
  | 'rollback-required'
  | 'recovery-required'
  | 'ambiguous-manual-intervention'
  | 'obsolete-duplicate-record'
  | 'incompatible-legacy-state';

export interface PluginCutoverClassificationResult {
  pluginId: string;
  classification: PluginCutoverClassification;
  reason: string;
  blocking: boolean;
  evidence: {
    installed: boolean;
    enabled: boolean;
    lifecycleState: string;
    operationStatus: string;
    reconciliationAction: string;
    hasInterruptedMigrationCheckpoint: boolean;
    rollbackCompatible: boolean;
  };
}

interface ClassifierInput {
  plugin: PluginAdminRecord;
  reconciliation: LifecycleReconciliationResult;
  hasInterruptedMigrationCheckpoint: boolean;
  rollbackCompatible: boolean;
}

export function classifyPluginCutoverState(
  input: ClassifierInput
): PluginCutoverClassificationResult {
  const { plugin, reconciliation, hasInterruptedMigrationCheckpoint, rollbackCompatible } = input;

  const baseEvidence = {
    installed: plugin.installed,
    enabled: plugin.isEnabled,
    lifecycleState: plugin.lifecycleState,
    operationStatus: plugin.operationStatus,
    reconciliationAction: reconciliation.action,
    hasInterruptedMigrationCheckpoint,
    rollbackCompatible,
  };

  if (reconciliation.action === 'manual-intervention-required') {
    return {
      pluginId: plugin.id,
      classification: 'ambiguous-manual-intervention',
      reason: reconciliation.reason,
      blocking: true,
      evidence: baseEvidence,
    };
  }

  if (reconciliation.action === 'require-recovery' || hasInterruptedMigrationCheckpoint) {
    return {
      pluginId: plugin.id,
      classification: 'recovery-required',
      reason: reconciliation.reason,
      blocking: true,
      evidence: baseEvidence,
    };
  }

  if (reconciliation.action === 'schedule-rollback') {
    return {
      pluginId: plugin.id,
      classification: 'rollback-required',
      reason: reconciliation.reason,
      blocking: true,
      evidence: baseEvidence,
    };
  }

  if (plugin.operationStatus.startsWith('pending_')) {
    return {
      pluginId: plugin.id,
      classification: 'migration-pending',
      reason: `operation status ${plugin.operationStatus} is pending`,
      blocking: false,
      evidence: baseEvidence,
    };
  }

  if (
    reconciliation.action === 'resume-safe-retry' ||
    reconciliation.action === 'take-over-expired-lease'
  ) {
    return {
      pluginId: plugin.id,
      classification: 'migration-resumed',
      reason: reconciliation.reason,
      blocking: false,
      evidence: baseEvidence,
    };
  }

  if (plugin.lifecycleState === 'uninstalled' && plugin.installed) {
    return {
      pluginId: plugin.id,
      classification: 'obsolete-duplicate-record',
      reason: 'installed flag and lifecycle state are contradictory',
      blocking: true,
      evidence: baseEvidence,
    };
  }

  if (plugin.lifecycleState === 'bundled' && plugin.installed) {
    return {
      pluginId: plugin.id,
      classification: 'incompatible-legacy-state',
      reason: 'bundled lifecycle state cannot be installed=true',
      blocking: true,
      evidence: baseEvidence,
    };
  }

  if (!rollbackCompatible && plugin.installed) {
    return {
      pluginId: plugin.id,
      classification: 'incompatible-legacy-state',
      reason: 'rollback compatibility is false for installed plugin state',
      blocking: true,
      evidence: baseEvidence,
    };
  }

  if (
    plugin.installed &&
    (plugin.lifecycleState === 'installed' || plugin.lifecycleState === 'disabled')
  ) {
    return {
      pluginId: plugin.id,
      classification: 'already-canonical',
      reason: 'installed plugin has canonical lifecycle state and no reconciliation blockers',
      blocking: false,
      evidence: baseEvidence,
    };
  }

  if (!plugin.installed && plugin.lifecycleState === 'bundled') {
    return {
      pluginId: plugin.id,
      classification: 'safe-automatic-migration',
      reason:
        'bundled-only state with no blockers is eligible for automatic canonical reconciliation',
      blocking: false,
      evidence: baseEvidence,
    };
  }

  return {
    pluginId: plugin.id,
    classification: 'ambiguous-manual-intervention',
    reason: 'state could not be deterministically classified by cutover rules',
    blocking: true,
    evidence: baseEvidence,
  };
}
