import {
  findActivePluginLifecycleOperation,
  readLatestPluginLifecycleTransitionEventRecord,
} from '@core/db/plugin-lifecycle';
import {
  determinePluginRollbackCompatibility,
  readInterruptedPluginMigrationCheckpoint,
} from '@core/db/plugin-migration-checkpoints';
import { evaluateRollbackAvailability } from '@core/lib/plugin-lifecycle-rollback-evaluator.server';

export type LifecycleReconciliationAction =
  | 'none'
  | 'resume-safe-retry'
  | 'take-over-expired-lease'
  | 'finalize-proven-success'
  | 'mark-failed'
  | 'schedule-rollback'
  | 'require-recovery'
  | 'manual-intervention-required';

export interface LifecycleReconciliationResult {
  action: LifecycleReconciliationAction;
  reason: string;
  operationId: string | null;
}

function isLeaseExpired(leaseExpiresAt?: string): boolean {
  if (!leaseExpiresAt) {
    return false;
  }

  const expiresAtMs = Date.parse(leaseExpiresAt);
  if (!Number.isFinite(expiresAtMs)) {
    return false;
  }

  return expiresAtMs <= Date.now();
}

export async function reconcilePluginLifecycleState(
  pluginId: string
): Promise<LifecycleReconciliationResult> {
  const activeOperation = await findActivePluginLifecycleOperation(pluginId);
  if (!activeOperation) {
    return {
      action: 'none',
      reason: 'No nonterminal lifecycle operation detected.',
      operationId: null,
    };
  }

  const latestEvent = await readLatestPluginLifecycleTransitionEventRecord(pluginId);
  const interruptedMigration = await readInterruptedPluginMigrationCheckpoint(pluginId);

  if (!isLeaseExpired(activeOperation.leaseExpiresAt)) {
    return {
      action: 'resume-safe-retry',
      reason: 'Active operation lease is still valid and may continue safely.',
      operationId: activeOperation.operationId,
    };
  }

  if (
    latestEvent?.operationId === activeOperation.operationId &&
    latestEvent.result === 'succeeded'
  ) {
    return {
      action: 'finalize-proven-success',
      reason: 'Success event exists for expired operation; finalize terminal record.',
      operationId: activeOperation.operationId,
    };
  }

  if (interruptedMigration) {
    return {
      action: 'require-recovery',
      reason: `Interrupted migration checkpoint ${interruptedMigration.migrationId} requires explicit reconciliation.`,
      operationId: activeOperation.operationId,
    };
  }

  const rollbackCompatibility = await determinePluginRollbackCompatibility(pluginId);
  const rollbackEvaluation = evaluateRollbackAvailability({
    currentDeploymentRef: 'unknown-current',
    targetDeploymentRef: 'unknown-target',
    currentPluginVersion: activeOperation.nextStateSnapshot?.installedVersion ?? null,
    targetPluginVersion: activeOperation.priorStateSnapshot?.installedVersion ?? null,
    targetArtifactDigest: latestEvent?.artifactDigest ?? null,
    artifactAvailable: Boolean(latestEvent?.artifactDigest),
    buildIncluded: true,
    migrationCompatible: rollbackCompatibility.rollbackCompatible,
    migrationIrreversible: !rollbackCompatibility.rollbackCompatible,
    configurationCompatible: true,
    lastKnownSafeState: activeOperation.priorStateSnapshot ? 'known' : 'unknown',
    deploymentHistoryHasTarget: Boolean(activeOperation.priorStateSnapshot),
  });

  if (
    rollbackEvaluation.outcome === 'available' ||
    rollbackEvaluation.outcome === 'application-only'
  ) {
    return {
      action: 'schedule-rollback',
      reason: `Expired operation requires rollback path: ${rollbackEvaluation.outcome}.`,
      operationId: activeOperation.operationId,
    };
  }

  if (
    rollbackEvaluation.outcome === 'blocked-artifact-missing' ||
    rollbackEvaluation.outcome === 'blocked-image-mismatch' ||
    rollbackEvaluation.outcome === 'blocked-migration-incompatible' ||
    rollbackEvaluation.outcome === 'blocked-migration-irreversible'
  ) {
    return {
      action: 'require-recovery',
      reason: rollbackEvaluation.reason,
      operationId: activeOperation.operationId,
    };
  }

  if (rollbackEvaluation.outcome === 'recovery-required') {
    return {
      action: 'require-recovery',
      reason: rollbackEvaluation.reason,
      operationId: activeOperation.operationId,
    };
  }

  if (rollbackEvaluation.outcome === 'manual-intervention-required') {
    return {
      action: 'manual-intervention-required',
      reason: rollbackEvaluation.reason,
      operationId: activeOperation.operationId,
    };
  }

  return {
    action: 'take-over-expired-lease',
    reason: 'Expired lease detected; takeover can proceed under orchestrator authority.',
    operationId: activeOperation.operationId,
  };
}
