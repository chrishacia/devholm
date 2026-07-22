import { createHash } from 'node:crypto';
import type { Knex } from 'knex';
import { getDb } from '@/db';
import {
  appendPluginCutoverReconciliationEvent,
  upsertPluginCutoverReconciliationState,
} from '@core/db/plugin-cutover-reconciliation';
import {
  buildPluginCutoverCleanupPlan,
  legacyCleanupMarkerKeys,
} from './plugin-cutover-cleanup-planner.server';
import {
  assertCleanupExecutionIntentMatchesPlan,
  computePluginCutoverCleanupPlanVersion,
  CLEANUP_PLAN_SCHEMA_VERSION,
  type PluginCutoverCleanupExecutionIntent,
} from './plugin-cutover-cleanup-contract.server';

async function appendCleanupRejectionAudit(
  db: Knex,
  input: {
    pluginId: string;
    phase: 'legacy-path-decommissioned' | 'cleanup-completed';
    result: 'blocked' | 'failed';
    classification: string;
    reason: string;
    operationId?: string | null;
    correlationId?: string | null;
    evidence?: Record<string, unknown>;
  }
): Promise<void> {
  await appendPluginCutoverReconciliationEvent(
    {
      pluginId: input.pluginId,
      phase: input.phase,
      result: input.result,
      operationId: input.operationId ?? null,
      correlationId: input.correlationId ?? null,
      classification: input.classification,
      blocking: true,
      reason: input.reason,
      evidence: input.evidence ?? null,
    },
    db
  );
}

function isReplayState(
  row: {
    cleanup_execution_token_hash?: string | null;
    cleanup_executed_at?: string | Date | null;
  },
  tokenHash: string | null
): boolean {
  return Boolean(
    tokenHash &&
      row.cleanup_execution_token_hash &&
      row.cleanup_execution_token_hash === tokenHash &&
      row.cleanup_executed_at
  );
}

function hashCleanupExecutionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface PluginCutoverCleanupExecutionResult {
  pluginId: string;
  mode: 'tombstone';
  dryRun: boolean;
  cleanupEligible: boolean;
  executed: boolean;
  blockers: string[];
  affectedRows: number;
}

export async function executePluginCutoverCleanup(
  pluginId: string,
  options?: {
    dryRun?: boolean;
    intent?: PluginCutoverCleanupExecutionIntent;
    operationId?: string | null;
    correlationId?: string | null;
    db?: Knex;
  }
): Promise<PluginCutoverCleanupExecutionResult> {
  const db = options?.db ?? getDb();
  const dryRun = options?.dryRun !== false;

  const plan = await buildPluginCutoverCleanupPlan(pluginId, db);
  const executionToken = options?.intent?.executionToken ?? '';
  const executionTokenHash = executionToken ? hashCleanupExecutionToken(executionToken) : null;

  if (dryRun) {
    return {
      pluginId,
      mode: 'tombstone',
      dryRun: true,
      cleanupEligible: plan.cleanupEligible,
      executed: false,
      blockers: plan.blockers,
      affectedRows: 0,
    };
  }

  let planVersion = '';
  try {
    assertCleanupExecutionIntentMatchesPlan(options?.intent, plan, plan.stateFingerprint);
    planVersion = computePluginCutoverCleanupPlanVersion(plan);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    await appendCleanupRejectionAudit(db, {
      pluginId,
      phase: 'legacy-path-decommissioned',
      result: 'blocked',
      classification: 'cleanup-intent-rejected',
      reason: err.message,
      operationId: options?.operationId ?? null,
      correlationId: options?.correlationId ?? null,
      evidence: {
        cleanupSchemaVersion: options?.intent?.schemaVersion ?? null,
        cleanupPlanVersion: options?.intent?.planVersion ?? null,
        cleanupStateFingerprint: options?.intent?.stateFingerprint ?? null,
      },
    });
    throw err;
  }

  const durableReplayState = await db('devholm_plugin_cutover_reconciliation_states')
    .select('cleanup_execution_token_hash', 'cleanup_executed_at')
    .where({ plugin_id: pluginId })
    .first();

  if (isReplayState(durableReplayState ?? {}, executionTokenHash)) {
    await appendCleanupRejectionAudit(db, {
      pluginId,
      phase: 'cleanup-completed',
      result: 'blocked',
      classification: 'cleanup-token-replay-rejected',
      reason: 'cleanup-execution-token-replayed',
      operationId: options?.operationId ?? null,
      correlationId: options?.correlationId ?? null,
      evidence: {
        cleanupSchemaVersion: CLEANUP_PLAN_SCHEMA_VERSION,
        cleanupPlanVersion: planVersion,
        cleanupStateFingerprint: plan.stateFingerprint,
        executionTokenHash,
      },
    });
    throw new Error('cleanup-execution-token-replayed');
  }

  if (!plan.cleanupEligible) {
    return {
      pluginId,
      mode: 'tombstone',
      dryRun,
      cleanupEligible: false,
      executed: false,
      blockers: plan.blockers,
      affectedRows: 0,
    };
  }

  const keys = legacyCleanupMarkerKeys(pluginId);
  let affectedRows = 0;

  await db
    .transaction(async (trx) => {
      // Ensure there is a durable state row we can atomically claim against.
      await trx('devholm_plugin_cutover_reconciliation_states')
        .insert({
          plugin_id: pluginId,
          phase: 'legacy-path-decommissioned',
          operation_id: options?.operationId ?? null,
          correlation_id: options?.correlationId ?? null,
          classification: 'cleanup-claim-initialized',
          blocking: false,
          reason: 'cleanup execution claim initialized',
          evidence: null,
          snapshot: null,
          cleanup_schema_version: null,
          cleanup_state_fingerprint: null,
          cleanup_plan_version: null,
          cleanup_execution_token_hash: null,
          cleanup_executed_at: null,
          inspected_at: new Date(),
          phase_updated_at: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
        })
        .onConflict('plugin_id')
        .ignore();

      const claimCount = await trx('devholm_plugin_cutover_reconciliation_states')
        .where({ plugin_id: pluginId })
        .whereNull('cleanup_execution_token_hash')
        .update({
          cleanup_schema_version: CLEANUP_PLAN_SCHEMA_VERSION,
          cleanup_state_fingerprint: plan.stateFingerprint,
          cleanup_plan_version: planVersion,
          cleanup_execution_token_hash: executionTokenHash,
          cleanup_executed_at: null,
          updated_at: new Date(),
        });

      if (!claimCount) {
        const state = await trx('devholm_plugin_cutover_reconciliation_states')
          .select('cleanup_execution_token_hash', 'cleanup_executed_at')
          .where({ plugin_id: pluginId })
          .first();

        if (isReplayState(state ?? {}, executionTokenHash)) {
          throw new Error('cleanup-execution-token-replayed');
        }

        throw new Error('cleanup-execution-claim-conflict');
      }

      if (plan.hasLegacyEnabledSetting) {
        const deleted = await trx('site_settings').where({ key: keys.enabled }).del();
        affectedRows += Number(deleted ?? 0);
      }

      await trx('site_settings')
        .insert({
          key: keys.tombstoned,
          value: new Date().toISOString(),
          type: 'string',
          category: 'plugins',
          description: `${pluginId} legacy state tombstone marker`,
          updated_at: new Date(),
        })
        .onConflict('key')
        .merge({
          value: new Date().toISOString(),
          updated_at: new Date(),
        });

      const state = await upsertPluginCutoverReconciliationState(
        {
          pluginId,
          phase: 'cleanup-completed',
          operationId: options?.operationId ?? null,
          correlationId: options?.correlationId ?? null,
          classification: 'legacy-cleanup-tombstoned',
          blocking: false,
          reason: 'Legacy compatibility state tombstoned and runtime authority remains canonical.',
          evidence: {
            cleanupSchemaVersion: CLEANUP_PLAN_SCHEMA_VERSION,
            cleanupMode: 'tombstone',
            affectedRows,
            planVersion,
            stateFingerprint: plan.stateFingerprint,
            excludedDomainDataTables: plan.excludedDomainDataTables,
          },
          cleanupSchemaVersion: CLEANUP_PLAN_SCHEMA_VERSION,
          cleanupStateFingerprint: plan.stateFingerprint,
          cleanupPlanVersion: planVersion,
          cleanupExecutionTokenHash: executionTokenHash,
          cleanupExecutedAt: new Date().toISOString(),
        },
        trx
      );

      await trx('devholm_plugin_cutover_reconciliation_states')
        .where({ plugin_id: pluginId })
        .update({
          cleanup_schema_version: CLEANUP_PLAN_SCHEMA_VERSION,
          cleanup_state_fingerprint: plan.stateFingerprint,
          cleanup_plan_version: planVersion,
          cleanup_execution_token_hash: executionTokenHash,
          cleanup_executed_at: new Date(),
          updated_at: new Date(),
        });

      await appendPluginCutoverReconciliationEvent(
        {
          pluginId,
          phase: state.phase,
          result: 'applied',
          operationId: options?.operationId ?? null,
          correlationId: options?.correlationId ?? null,
          classification: state.classification,
          blocking: false,
          reason: state.reason ?? 'Cleanup tombstone applied',
          evidence: state.evidence,
        },
        trx
      );
    })
    .catch(async (error: unknown) => {
      const err = error instanceof Error ? error : new Error(String(error));
      const blockedKnownError =
        err.message === 'cleanup-execution-token-replayed' ||
        err.message === 'cleanup-execution-claim-conflict';

      await appendCleanupRejectionAudit(db, {
        pluginId,
        phase: blockedKnownError ? 'legacy-path-decommissioned' : 'cleanup-completed',
        result: blockedKnownError ? 'blocked' : 'failed',
        classification: blockedKnownError
          ? err.message === 'cleanup-execution-token-replayed'
            ? 'cleanup-token-replay-rejected'
            : 'cleanup-claim-conflict-rejected'
          : 'cleanup-transaction-failed',
        reason: err.message,
        operationId: options?.operationId ?? null,
        correlationId: options?.correlationId ?? null,
        evidence: {
          cleanupSchemaVersion: CLEANUP_PLAN_SCHEMA_VERSION,
          cleanupPlanVersion: planVersion,
          cleanupStateFingerprint: plan.stateFingerprint,
          executionTokenHash,
        },
      });

      throw err;
    });

  return {
    pluginId,
    mode: 'tombstone',
    dryRun: false,
    cleanupEligible: true,
    executed: true,
    blockers: [],
    affectedRows,
  };
}
