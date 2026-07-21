import type { Knex } from 'knex';
import { getInstalledPlugin } from '@core/db/plugin-lifecycle';
import {
  deriveCutoverRollbackPlanFromPhase,
  readLatestPluginCutoverRollbackCheckpoint,
  type PluginCutoverRollbackCheckpointRecord,
  type PluginCutoverRollbackStage,
  type PluginCutoverRollbackStatus,
} from '@core/db/plugin-cutover-rollback';
import {
  readPluginCutoverReconciliationState,
  type PluginCutoverReconciliationStateRecord,
} from '@core/db/plugin-cutover-reconciliation';

export interface PluginCutoverRollbackExecutionPlan {
  pluginId: string;
  stage: PluginCutoverRollbackStage;
  checkpointStatus: PluginCutoverRollbackStatus;
  attemptCount: number;
  rollbackEligible: boolean;
  irreversibleBoundary: boolean;
  shouldExecute: boolean;
  blockingReason: string | null;
  evidenceSnapshot: Record<string, unknown>;
  reconciliationState: PluginCutoverReconciliationStateRecord | null;
  latestCheckpoint: PluginCutoverRollbackCheckpointRecord | null;
}

function normalizeAttemptCount(
  checkpoint: PluginCutoverRollbackCheckpointRecord | null,
  status: PluginCutoverRollbackStatus
): number {
  if (!checkpoint) {
    return 1;
  }

  if (status === 'failed') {
    return checkpoint.attemptCount + 1;
  }

  return checkpoint.attemptCount;
}

export async function buildPluginCutoverRollbackExecutionPlan(
  pluginId: string,
  db: Knex
): Promise<PluginCutoverRollbackExecutionPlan> {
  const [reconciliationState, latestCheckpoint, installed] = await Promise.all([
    readPluginCutoverReconciliationState(pluginId, db),
    readLatestPluginCutoverRollbackCheckpoint(pluginId, db),
    getInstalledPlugin(pluginId, db),
  ]);

  const phase = reconciliationState?.phase ?? 'inspected';
  const rollbackPlan = deriveCutoverRollbackPlanFromPhase(phase);

  const checkpointStatus = latestCheckpoint?.status ?? 'pending';
  const attemptCount = normalizeAttemptCount(latestCheckpoint, checkpointStatus);

  let shouldExecute = rollbackPlan.rollbackEligible;
  let blockingReason: string | null = null;

  if (rollbackPlan.irreversibleBoundary) {
    shouldExecute = false;
    blockingReason = 'irreversible-boundary-reached';
  }

  if (!installed) {
    shouldExecute = false;
    blockingReason = 'canonical-record-missing';
  }

  if (latestCheckpoint?.status === 'succeeded') {
    shouldExecute = false;
    blockingReason = 'rollback-already-succeeded';
  }

  if (latestCheckpoint?.status === 'running') {
    shouldExecute = true;
  }

  const evidenceSnapshot = {
    phase,
    lifecycleState: installed?.lifecycleState ?? null,
    enabled: installed?.enabled ?? null,
    installedVersion: installed?.installedVersion ?? null,
    checkpointId: latestCheckpoint?.checkpointId ?? null,
    checkpointStatus,
    attemptCount,
  };

  return {
    pluginId,
    stage: rollbackPlan.stage,
    checkpointStatus,
    attemptCount,
    rollbackEligible: rollbackPlan.rollbackEligible,
    irreversibleBoundary: rollbackPlan.irreversibleBoundary,
    shouldExecute,
    blockingReason,
    evidenceSnapshot,
    reconciliationState,
    latestCheckpoint,
  };
}
