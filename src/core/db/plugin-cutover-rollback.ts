import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { getDb } from './index';
import type { PluginCutoverReconciliationPhase } from './plugin-cutover-reconciliation';

export type PluginCutoverRollbackStage =
  | 'before-canonical-lifecycle-creation'
  | 'after-canonical-lifecycle-creation'
  | 'after-enabled-settings-reconciliation'
  | 'before-legacy-decommission'
  | 'after-legacy-decommission-initiation';

export type PluginCutoverRollbackStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'unavailable';

export interface PluginCutoverRollbackPlan {
  stage: PluginCutoverRollbackStage;
  rollbackEligible: boolean;
  irreversibleBoundary: boolean;
  reason: string;
}

export interface PluginCutoverRollbackCheckpointRecord {
  checkpointId: string;
  pluginId: string;
  stage: PluginCutoverRollbackStage;
  status: PluginCutoverRollbackStatus;
  attemptCount: number;
  rollbackEligible: boolean;
  irreversibleBoundary: boolean;
  operationId: string | null;
  correlationId: string | null;
  reason: string | null;
  evidence: Record<string, unknown> | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function parseJsonColumn<T>(value: unknown): T {
  if (value == null) {
    return value as T;
  }

  if (typeof value === 'string') {
    return JSON.parse(value) as T;
  }

  return value as T;
}

function mapRow(row: Record<string, unknown>): PluginCutoverRollbackCheckpointRecord {
  return {
    checkpointId: String(row.checkpoint_id),
    pluginId: String(row.plugin_id),
    stage: row.stage as PluginCutoverRollbackStage,
    status: row.status as PluginCutoverRollbackStatus,
    attemptCount: Number(row.attempt_count),
    rollbackEligible: Boolean(row.rollback_eligible),
    irreversibleBoundary: Boolean(row.irreversible_boundary),
    operationId: row.operation_id ? String(row.operation_id) : null,
    correlationId: row.correlation_id ? String(row.correlation_id) : null,
    reason: row.reason ? String(row.reason) : null,
    evidence: row.evidence ? parseJsonColumn<Record<string, unknown>>(row.evidence) : null,
    startedAt: String(row.started_at),
    completedAt: row.completed_at ? String(row.completed_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function deriveCutoverRollbackPlanFromPhase(
  phase: PluginCutoverReconciliationPhase
): PluginCutoverRollbackPlan {
  switch (phase) {
    case 'not-started':
    case 'inspected':
    case 'safe-migration-planned':
    case 'migration-running':
      return {
        stage: 'before-canonical-lifecycle-creation',
        rollbackEligible: true,
        irreversibleBoundary: false,
        reason: 'Rollback can safely stop before canonical lifecycle ownership is created.',
      };
    case 'canonical-record-established':
      return {
        stage: 'after-canonical-lifecycle-creation',
        rollbackEligible: true,
        irreversibleBoundary: false,
        reason: 'Rollback must revert canonical lifecycle row ownership safely.',
      };
    case 'settings-data-preserved':
    case 'lifecycle-state-reconciled':
    case 'rollback-pending':
      return {
        stage: 'after-enabled-settings-reconciliation',
        rollbackEligible: true,
        irreversibleBoundary: false,
        reason: 'Rollback should restore prior enabled/settings intent deterministically.',
      };
    case 'canonical-ownership-activated':
      return {
        stage: 'before-legacy-decommission',
        rollbackEligible: true,
        irreversibleBoundary: false,
        reason: 'Rollback remains safe before legacy decommission starts.',
      };
    case 'legacy-path-decommissioned':
      return {
        stage: 'after-legacy-decommission-initiation',
        rollbackEligible: true,
        irreversibleBoundary: false,
        reason: 'Rollback requires restoration after legacy decommission initiation.',
      };
    case 'cleanup-completed':
      return {
        stage: 'after-legacy-decommission-initiation',
        rollbackEligible: false,
        irreversibleBoundary: true,
        reason: 'Cleanup completed; rollback unavailable beyond irreversible cleanup boundary.',
      };
    case 'recovery-required':
    case 'manual-intervention-required':
      return {
        stage: 'after-enabled-settings-reconciliation',
        rollbackEligible: false,
        irreversibleBoundary: false,
        reason: 'Rollback requires manual intervention due to unresolved recovery blockers.',
      };
    default:
      return {
        stage: 'after-enabled-settings-reconciliation',
        rollbackEligible: false,
        irreversibleBoundary: false,
        reason: 'Unknown phase: rollback unavailable until state is reconciled.',
      };
  }
}

export async function readLatestPluginCutoverRollbackCheckpoint(
  pluginId: string,
  db: Knex = getDb()
): Promise<PluginCutoverRollbackCheckpointRecord | null> {
  const row = await db('devholm_plugin_cutover_rollback_checkpoints')
    .where({ plugin_id: pluginId })
    .orderBy('started_at', 'desc')
    .orderBy('id', 'desc')
    .first();

  if (!row) {
    return null;
  }

  return mapRow(row);
}

export async function upsertPluginCutoverRollbackCheckpoint(
  input: {
    pluginId: string;
    stage: PluginCutoverRollbackStage;
    status: PluginCutoverRollbackStatus;
    attemptCount?: number;
    rollbackEligible: boolean;
    irreversibleBoundary: boolean;
    operationId?: string | null;
    correlationId?: string | null;
    reason?: string | null;
    evidence?: Record<string, unknown> | null;
    startedAt?: string;
    completedAt?: string | null;
    checkpointId?: string;
  },
  db: Knex = getDb()
): Promise<PluginCutoverRollbackCheckpointRecord> {
  const now = new Date();
  const startedAt = input.startedAt ? new Date(input.startedAt) : now;
  const attemptCount = input.attemptCount ?? 1;

  const checkpointId = input.checkpointId ?? randomUUID();

  await db('devholm_plugin_cutover_rollback_checkpoints')
    .insert({
      checkpoint_id: checkpointId,
      plugin_id: input.pluginId,
      stage: input.stage,
      status: input.status,
      attempt_count: attemptCount,
      rollback_eligible: input.rollbackEligible,
      irreversible_boundary: input.irreversibleBoundary,
      operation_id: input.operationId ?? null,
      correlation_id: input.correlationId ?? null,
      reason: input.reason ?? null,
      evidence: input.evidence ? JSON.stringify(input.evidence) : null,
      started_at: startedAt,
      completed_at: input.completedAt ? new Date(input.completedAt) : null,
      created_at: now,
      updated_at: now,
    })
    .onConflict(['plugin_id', 'stage', 'attempt_count'])
    .merge({
      status: input.status,
      rollback_eligible: input.rollbackEligible,
      irreversible_boundary: input.irreversibleBoundary,
      operation_id: input.operationId ?? null,
      correlation_id: input.correlationId ?? null,
      reason: input.reason ?? null,
      evidence: input.evidence ? JSON.stringify(input.evidence) : null,
      completed_at: input.completedAt ? new Date(input.completedAt) : null,
      updated_at: now,
    });

  const row = await db('devholm_plugin_cutover_rollback_checkpoints')
    .where({ plugin_id: input.pluginId, stage: input.stage, attempt_count: attemptCount })
    .first();

  if (!row) {
    throw new Error(`Failed to persist rollback checkpoint for ${input.pluginId}`);
  }

  return mapRow(row);
}
