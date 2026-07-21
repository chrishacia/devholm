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

export interface PluginLifecycleRecoveryScanResult {
  scannedAt: string;
  pluginCount: number;
  results: Array<
    LifecycleReconciliationResult & {
      pluginId: string;
      cutover?: PluginCutoverClassificationResult;
      snapshot?: PluginCutoverStateSnapshot;
    }
  >;
}

export interface PluginLifecycleRecoveryExecutionResult extends LifecycleReconciliationResult {
  executed: boolean;
  executedAt: string | null;
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
  const result = await reconcilePluginLifecycleState(pluginId);
  const execution = await applySafeRecoveryAction(pluginId, result);
  markPluginStartupReconciliationStateDirty();

  return {
    ...result,
    executed: execution.executed,
    executedAt: execution.executedAt,
  };
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

      return {
        pluginId: plugin.id,
        ...reconciliation,
        snapshot: snapshotByPluginId.get(plugin.id),
        cutover: classifyPluginCutoverState({
          plugin,
          reconciliation,
          hasInterruptedMigrationCheckpoint: interruptedCheckpoint !== null,
          rollbackCompatible: rollbackCompatibility.rollbackCompatible,
        }),
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
