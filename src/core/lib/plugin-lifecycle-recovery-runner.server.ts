import { randomUUID } from 'node:crypto';
import { getDb } from '@/db';
import { listPluginStates } from '@/db/plugins';
import {
  findActivePluginLifecycleOperation,
  writePluginLifecycleOperationRecord,
  writePluginLifecycleTransitionEvent,
} from '@core/db/plugin-lifecycle';
import {
  reconcilePluginLifecycleState,
  type LifecycleReconciliationResult,
} from '@core/lib/plugin-lifecycle-reconciler.server';
import { markPluginStartupReconciliationStateDirty } from '@core/lib/plugin-startup-reconciliation.server';
import {
  determinePluginRollbackCompatibility,
  readInterruptedPluginMigrationCheckpoint,
} from '@core/db/plugin-migration-checkpoints';
import {
  classifyPluginCutoverState,
  type PluginCutoverClassificationResult,
} from '@core/lib/plugin-cutover-reconciliation-classifier.server';
import {
  readPluginCutoverStateSnapshots,
  type PluginCutoverStateSnapshot,
} from '@core/lib/plugin-cutover-state-snapshot.server';
import {
  appendPluginCutoverReconciliationEvent,
  readPluginCutoverReconciliationState,
  upsertPluginCutoverReconciliationState,
  type PluginCutoverReconciliationPhase,
  type PluginCutoverReconciliationStateRecord,
} from '@core/db/plugin-cutover-reconciliation';
import {
  deriveCutoverRollbackPlanFromPhase,
  readLatestPluginCutoverRollbackCheckpoint,
  upsertPluginCutoverRollbackCheckpoint,
} from '@core/db/plugin-cutover-rollback';
import { executePluginCutoverRollback } from '@core/lib/plugin-cutover-rollback-executor.server';
import { reconcileLegacyAndCanonicalPluginState } from '@core/lib/plugin-cutover-legacy-reconciler.server';
import { logicallyDecommissionLegacyPluginState } from '@core/lib/plugin-cutover-legacy-decommission.server';
import { buildPluginCutoverCleanupPlan } from '@core/lib/plugin-cutover-cleanup-planner.server';
import { withPluginLifecycleSessionLock } from '@core/lib/plugin-lifecycle-coordination.server';

export interface PluginLifecycleRecoveryScanResult {
  scannedAt: string;
  pluginCount: number;
  results: Array<
    LifecycleReconciliationResult & {
      pluginId: string;
      cutover?: PluginCutoverClassificationResult;
      snapshot?: PluginCutoverStateSnapshot;
      durableCutoverState?: PluginCutoverReconciliationStateRecord | null;
      recoveryCenter?: {
        pluginId: string;
        classification: string;
        blocker: string | null;
        safeEvidence: Record<string, unknown>;
        recommendedAction: string;
        automaticRepairAllowed: boolean;
        rollbackAvailable: boolean;
        rollbackStage?: string | null;
      };
    }
  >;
}

export interface PluginLifecycleRecoveryExecutionResult extends LifecycleReconciliationResult {
  executed: boolean;
  executedAt: string | null;
}

function toDurableCutoverPhase(input: {
  action: LifecycleReconciliationResult['action'];
  classification?: string;
  blocking?: boolean;
  executed?: boolean;
}): PluginCutoverReconciliationPhase {
  if (
    input.action === 'manual-intervention-required' ||
    input.classification === 'ambiguous-manual-intervention'
  ) {
    return 'manual-intervention-required';
  }

  if (
    input.action === 'require-recovery' ||
    input.classification === 'recovery-required' ||
    input.classification === 'rollback-required'
  ) {
    return 'recovery-required';
  }

  if (input.action === 'schedule-rollback') {
    return 'rollback-pending';
  }

  if (input.action === 'resume-safe-retry' || input.action === 'take-over-expired-lease') {
    return 'migration-running';
  }

  if (input.executed) {
    return 'lifecycle-state-reconciled';
  }

  if (input.classification === 'safe-automatic-migration') {
    return 'safe-migration-planned';
  }

  if (input.classification === 'already-canonical') {
    return 'canonical-ownership-activated';
  }

  if (input.classification === 'incompatible-legacy-state') {
    return 'manual-intervention-required';
  }

  return input.blocking ? 'recovery-required' : 'inspected';
}

function deriveRecoveryCenterPayload(input: {
  pluginId: string;
  cutover: PluginCutoverClassificationResult;
  rollbackCompatible: boolean;
  snapshot: PluginCutoverStateSnapshot | undefined;
}): {
  pluginId: string;
  classification: string;
  blocker: string | null;
  safeEvidence: Record<string, unknown>;
  recommendedAction: string;
  automaticRepairAllowed: boolean;
  rollbackAvailable: boolean;
  rollbackStage: string | null;
} {
  const blocker = input.cutover.blocking ? input.cutover.reason : null;

  let recommendedAction = 'none';
  let automaticRepairAllowed = false;

  switch (input.cutover.classification) {
    case 'already-canonical':
      recommendedAction = 'no-action-required';
      automaticRepairAllowed = true;
      break;
    case 'safe-automatic-migration':
      recommendedAction = 'run-automatic-reconciliation';
      automaticRepairAllowed = true;
      break;
    case 'rollback-required':
      recommendedAction = input.rollbackCompatible
        ? 'execute-rollback-path'
        : 'manual-recovery-required';
      automaticRepairAllowed = input.rollbackCompatible;
      break;
    case 'recovery-required':
      recommendedAction = 'manual-recovery-required';
      automaticRepairAllowed = false;
      break;
    case 'incompatible-legacy-state':
      recommendedAction = 'manual-state-reconciliation';
      automaticRepairAllowed = false;
      break;
    case 'ambiguous-manual-intervention':
      recommendedAction = 'manual-intervention-required';
      automaticRepairAllowed = false;
      break;
    default:
      recommendedAction = 'manual-review-required';
      automaticRepairAllowed = false;
      break;
  }

  return {
    pluginId: input.pluginId,
    classification: input.cutover.classification,
    blocker,
    safeEvidence: {
      ...input.cutover.evidence,
      contradictoryState: input.snapshot?.contradictoryState ?? false,
      contradictionReasons: input.snapshot?.contradictionReasons ?? [],
    },
    recommendedAction,
    automaticRepairAllowed,
    rollbackAvailable: input.rollbackCompatible,
    rollbackStage:
      input.cutover.classification === 'rollback-required'
        ? 'after-enabled-settings-reconciliation'
        : null,
  };
}

async function applySafeRecoveryAction(
  pluginId: string,
  reconciliation: LifecycleReconciliationResult
): Promise<{ executed: boolean; executedAt: string | null }> {
  if (
    reconciliation.action !== 'finalize-proven-success' &&
    reconciliation.action !== 'take-over-expired-lease'
  ) {
    return { executed: false, executedAt: null };
  }

  const db = getDb();
  const activeOperation = await findActivePluginLifecycleOperation(pluginId, db);
  if (!activeOperation) {
    return { executed: false, executedAt: null };
  }

  const reconciledAt = new Date().toISOString();

  if (reconciliation.action === 'finalize-proven-success') {
    await db.transaction(async (trx) => {
      await writePluginLifecycleOperationRecord(
        {
          ...activeOperation,
          status: 'succeeded',
          currentPhase: 'completed',
          updatedAt: reconciledAt,
          finishedAt: reconciledAt,
        },
        trx
      );
    });

    return { executed: true, executedAt: reconciledAt };
  }

  await db.transaction(async (trx) => {
    await writePluginLifecycleOperationRecord(
      {
        ...activeOperation,
        status: 'interrupted',
        currentPhase: 'completed',
        updatedAt: reconciledAt,
        finishedAt: reconciledAt,
        error: {
          code: 'LIFECYCLE_STALE_OPERATION',
          message: 'Lifecycle lease expired before operation completion.',
          retryable: true,
          recoveryClassification: 'reconcile-on-restart',
        },
      },
      trx
    );

    await writePluginLifecycleTransitionEvent(
      {
        schemaVersion: 1,
        eventId: randomUUID(),
        operationId: activeOperation.operationId,
        pluginId: activeOperation.pluginId,
        transition: activeOperation.action,
        result: 'failed',
        actor: activeOperation.actor,
        correlationId: activeOperation.correlationId,
        timestamp: reconciledAt,
        previousState: activeOperation.priorStateSnapshot,
        nextState: activeOperation.priorStateSnapshot,
        error: {
          code: 'LIFECYCLE_STALE_OPERATION',
          message: 'Lifecycle lease expired before operation completion.',
          retryable: true,
          recoveryClassification: 'reconcile-on-restart',
        },
      },
      trx
    );
  });

  return { executed: true, executedAt: reconciledAt };
}

export async function reconcileSinglePluginLifecycle(
  pluginId: string
): Promise<PluginLifecycleRecoveryExecutionResult> {
  return withPluginLifecycleSessionLock(pluginId, async () => {
    const result = await reconcilePluginLifecycleState(pluginId);
    const execution = await applySafeRecoveryAction(pluginId, result);

    const phase = toDurableCutoverPhase({
      action: result.action,
      executed: execution.executed,
    });
    const state = await upsertPluginCutoverReconciliationState({
      pluginId,
      phase,
      operationId: result.operationId,
      blocking:
        result.action === 'require-recovery' ||
        result.action === 'manual-intervention-required' ||
        result.action === 'schedule-rollback',
      classification: result.action,
      reason: result.reason,
      evidence: {
        executed: execution.executed,
        executedAt: execution.executedAt,
        reconciliationAction: result.action,
      },
    });

    await appendPluginCutoverReconciliationEvent({
      pluginId,
      phase: state.phase,
      result: execution.executed ? 'applied' : state.blocking ? 'blocked' : 'noop',
      operationId: result.operationId,
      correlationId: result.operationId,
      classification: state.classification,
      blocking: state.blocking,
      reason: state.reason,
      evidence: state.evidence,
      snapshot: state.snapshot,
    });

    if (result.action === 'schedule-rollback') {
      const rollbackResult = await executePluginCutoverRollback(pluginId, {
        operationId: result.operationId,
        correlationId: result.operationId,
      });

      execution.executed = rollbackResult.executed;
      execution.executedAt = rollbackResult.executed
        ? new Date().toISOString()
        : execution.executedAt;
    }

    markPluginStartupReconciliationStateDirty();

    return {
      ...result,
      executed: execution.executed,
      executedAt: execution.executedAt,
    };
  });
}

export async function runPluginLifecycleRecoveryScan(options?: {
  limit?: number;
}): Promise<PluginLifecycleRecoveryScanResult> {
  const pluginStates = await listPluginStates();
  const cutoverSnapshots = await readPluginCutoverStateSnapshots();
  const snapshotByPluginId = new Map(
    cutoverSnapshots.map((snapshot) => [snapshot.pluginId, snapshot])
  );
  const limit = Math.max(1, Math.min(options?.limit ?? pluginStates.length, 200));
  const selected = pluginStates.slice(0, limit);

  const results = await Promise.all(
    selected.map(async (plugin) => {
      const reconciliation = await reconcilePluginLifecycleState(plugin.id);
      const [interruptedCheckpoint, rollbackCompatibility] = await Promise.all([
        readInterruptedPluginMigrationCheckpoint(plugin.id),
        determinePluginRollbackCompatibility(plugin.id),
      ]);

      await reconcileLegacyAndCanonicalPluginState(plugin.id, {
        correlationId: reconciliation.operationId ?? undefined,
      });

      const cutover = classifyPluginCutoverState({
        plugin,
        reconciliation,
        hasInterruptedMigrationCheckpoint: interruptedCheckpoint !== null,
        rollbackCompatible: rollbackCompatibility.rollbackCompatible,
      });

      let legacyDecommissioned = false;
      if (
        reconciliation.action === 'none' &&
        !cutover.blocking &&
        cutover.classification === 'already-canonical'
      ) {
        const decommission = await logicallyDecommissionLegacyPluginState(plugin.id, {
          operationId: reconciliation.operationId,
          correlationId: reconciliation.operationId,
        });
        legacyDecommissioned = decommission.applied;
      }

      const phase = toDurableCutoverPhase({
        action: reconciliation.action,
        classification: cutover.classification,
        blocking: cutover.blocking,
      });

      const snapshot = snapshotByPluginId.get(plugin.id);

      const state = await upsertPluginCutoverReconciliationState({
        pluginId: plugin.id,
        phase,
        operationId: reconciliation.operationId,
        correlationId: reconciliation.operationId,
        classification: cutover.classification,
        blocking: cutover.blocking,
        reason: cutover.reason,
        evidence: cutover.evidence,
        snapshot: (snapshot ?? null) as unknown as Record<string, unknown> | null,
      });

      await appendPluginCutoverReconciliationEvent({
        pluginId: plugin.id,
        phase: state.phase,
        result: cutover.blocking ? 'blocked' : 'noop',
        operationId: reconciliation.operationId,
        correlationId: reconciliation.operationId,
        classification: cutover.classification,
        blocking: cutover.blocking,
        reason: cutover.reason,
        evidence: cutover.evidence,
        snapshot: (snapshot ?? null) as unknown as Record<string, unknown> | null,
      });

      const durableCutoverState = await readPluginCutoverReconciliationState(plugin.id);
      const rollbackPlan = deriveCutoverRollbackPlanFromPhase(state.phase);
      if (cutover.classification === 'rollback-required') {
        await upsertPluginCutoverRollbackCheckpoint({
          pluginId: plugin.id,
          stage: rollbackPlan.stage,
          status: 'pending',
          rollbackEligible: rollbackPlan.rollbackEligible,
          irreversibleBoundary: rollbackPlan.irreversibleBoundary,
          operationId: reconciliation.operationId,
          correlationId: reconciliation.operationId,
          reason: rollbackPlan.reason,
          evidence: {
            classification: cutover.classification,
            reconciliationAction: reconciliation.action,
          },
        });
      }
      const latestRollbackCheckpoint = await readLatestPluginCutoverRollbackCheckpoint(plugin.id);
      const cleanupPlan = await buildPluginCutoverCleanupPlan(plugin.id);
      const recoveryCenter = deriveRecoveryCenterPayload({
        pluginId: plugin.id,
        cutover,
        rollbackCompatible: rollbackCompatibility.rollbackCompatible,
        snapshot,
      });

      if (latestRollbackCheckpoint) {
        recoveryCenter.rollbackStage = latestRollbackCheckpoint.stage;
        recoveryCenter.rollbackAvailable = latestRollbackCheckpoint.rollbackEligible;
        recoveryCenter.safeEvidence = {
          ...recoveryCenter.safeEvidence,
          rollbackStatus: latestRollbackCheckpoint.status,
          rollbackCheckpointId: latestRollbackCheckpoint.checkpointId,
        };
      }

      recoveryCenter.safeEvidence = {
        ...recoveryCenter.safeEvidence,
        legacyPathLogicallyDecommissioned: legacyDecommissioned,
        cleanupEligible: cleanupPlan.cleanupEligible,
        cleanupBlockers: cleanupPlan.blockers,
        cleanupMode: cleanupPlan.mode,
      };

      return {
        pluginId: plugin.id,
        ...reconciliation,
        snapshot,
        cutover,
        durableCutoverState,
        recoveryCenter,
      };
    })
  );

  markPluginStartupReconciliationStateDirty();

  return {
    scannedAt: new Date().toISOString(),
    pluginCount: selected.length,
    results,
  };
}
