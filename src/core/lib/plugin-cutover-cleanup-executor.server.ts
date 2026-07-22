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
  CLEANUP_PLAN_SCHEMA_VERSION,
  computePluginCutoverCleanupPlanVersion,
  type PluginCutoverCleanupExecutionIntent,
} from './plugin-cutover-cleanup-contract.server';

const LIFECYCLE_LOCK_NAMESPACE = 'devholm.plugin.lifecycle';

class CleanupPlanIneligibleError extends Error {
  readonly blockers: string[];

  constructor(blockers: string[]) {
    super('cleanup-plan-ineligible');
    this.blockers = blockers;
  }
}

async function appendCleanupAudit(
  db: Knex,
  input: {
    pluginId: string;
    phase: 'legacy-path-decommissioned' | 'cleanup-completed';
    result: 'applied' | 'blocked' | 'failed';
    classification: string;
    reason: string;
    blocking: boolean;
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
      blocking: input.blocking,
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

  if (dryRun) {
    const dryRunPlan = await buildPluginCutoverCleanupPlan(pluginId, db);
    return {
      pluginId,
      mode: 'tombstone',
      dryRun: true,
      cleanupEligible: dryRunPlan.cleanupEligible,
      executed: false,
      blockers: dryRunPlan.blockers,
      affectedRows: 0,
    };
  }

  const intent = options?.intent;
  const executionToken = intent?.executionToken ?? '';
  const executionTokenHash = executionToken ? hashCleanupExecutionToken(executionToken) : null;

  await appendCleanupAudit(db, {
    pluginId,
    phase: 'legacy-path-decommissioned',
    result: 'blocked',
    classification: 'cleanup-requested',
    reason: 'cleanup execution requested',
    blocking: false,
    operationId: options?.operationId ?? null,
    correlationId: options?.correlationId ?? null,
    evidence: {
      cleanupSchemaVersion: intent?.schemaVersion ?? null,
      cleanupPlanVersion: intent?.planVersion ?? null,
      cleanupStateFingerprint: intent?.stateFingerprint ?? null,
      executionTokenHash,
    },
  });

  if (!intent) {
    const err = new Error('cleanup execution intent is required');
    await appendCleanupAudit(db, {
      pluginId,
      phase: 'legacy-path-decommissioned',
      result: 'blocked',
      classification: 'cleanup-intent-rejected',
      reason: err.message,
      blocking: true,
      operationId: options?.operationId ?? null,
      correlationId: options?.correlationId ?? null,
      evidence: {
        cleanupSchemaVersion: null,
        cleanupPlanVersion: null,
        cleanupStateFingerprint: null,
        executionTokenHash,
      },
    });
    throw err;
  }

  if (intent.schemaVersion !== CLEANUP_PLAN_SCHEMA_VERSION) {
    const err = new Error('unsupported-cleanup-plan-schema-version');
    await appendCleanupAudit(db, {
      pluginId,
      phase: 'legacy-path-decommissioned',
      result: 'blocked',
      classification: 'cleanup-intent-rejected',
      reason: err.message,
      blocking: true,
      operationId: options?.operationId ?? null,
      correlationId: options?.correlationId ?? null,
      evidence: {
        cleanupSchemaVersion: intent.schemaVersion,
        cleanupPlanVersion: intent.planVersion,
        cleanupStateFingerprint: intent.stateFingerprint,
        executionTokenHash,
      },
    });
    throw err;
  }

  if (intent.pluginId !== pluginId) {
    const err = new Error('cleanup execution intent plugin mismatch');
    await appendCleanupAudit(db, {
      pluginId,
      phase: 'legacy-path-decommissioned',
      result: 'blocked',
      classification: 'cleanup-intent-rejected',
      reason: err.message,
      blocking: true,
      operationId: options?.operationId ?? null,
      correlationId: options?.correlationId ?? null,
      evidence: {
        cleanupSchemaVersion: intent.schemaVersion,
        cleanupPlanVersion: intent.planVersion,
        cleanupStateFingerprint: intent.stateFingerprint,
        executionTokenHash,
      },
    });
    throw err;
  }

  if (!intent.executionToken || intent.executionToken.trim().length === 0) {
    const err = new Error('cleanup execution token is required');
    await appendCleanupAudit(db, {
      pluginId,
      phase: 'legacy-path-decommissioned',
      result: 'blocked',
      classification: 'cleanup-intent-rejected',
      reason: err.message,
      blocking: true,
      operationId: options?.operationId ?? null,
      correlationId: options?.correlationId ?? null,
      evidence: {
        cleanupSchemaVersion: intent.schemaVersion,
        cleanupPlanVersion: intent.planVersion,
        cleanupStateFingerprint: intent.stateFingerprint,
        executionTokenHash,
      },
    });
    throw err;
  }

  let affectedRows = 0;
  let ineligibleBlockers: string[] | null = null;

  try {
    await db.transaction(async (trx) => {
      await trx.raw('select pg_advisory_xact_lock(hashtext(?), hashtext(?))', [
        LIFECYCLE_LOCK_NAMESPACE,
        pluginId,
      ]);

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

      const lockedStateRow = await trx('devholm_plugin_cutover_reconciliation_states')
        .select('cleanup_execution_token_hash', 'cleanup_executed_at')
        .where({ plugin_id: pluginId })
        .forUpdate()
        .first();

      if (isReplayState(lockedStateRow ?? {}, executionTokenHash)) {
        throw new Error('cleanup-execution-token-replayed');
      }

      const plan = await buildPluginCutoverCleanupPlan(pluginId, trx);
      assertCleanupExecutionIntentMatchesPlan(intent, plan, plan.stateFingerprint);
      const planVersion = computePluginCutoverCleanupPlanVersion(plan);

      if (!plan.cleanupEligible) {
        throw new CleanupPlanIneligibleError(plan.blockers);
      }

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

      await appendPluginCutoverReconciliationEvent(
        {
          pluginId,
          phase: 'legacy-path-decommissioned',
          result: 'applied',
          operationId: options?.operationId ?? null,
          correlationId: options?.correlationId ?? null,
          classification: 'cleanup-claim-acquired',
          blocking: false,
          reason: 'cleanup execution claim acquired',
          evidence: {
            cleanupSchemaVersion: CLEANUP_PLAN_SCHEMA_VERSION,
            cleanupPlanVersion: planVersion,
            cleanupStateFingerprint: plan.stateFingerprint,
            executionTokenHash,
          },
        },
        trx
      );

      const keys = legacyCleanupMarkerKeys(pluginId);

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
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));

    if (err instanceof CleanupPlanIneligibleError) {
      ineligibleBlockers = err.blockers;
      try {
        await appendCleanupAudit(db, {
          pluginId,
          phase: 'legacy-path-decommissioned',
          result: 'blocked',
          classification: 'cleanup-plan-ineligible',
          reason: 'cleanup plan is not eligible for execution',
          blocking: true,
          operationId: options?.operationId ?? null,
          correlationId: options?.correlationId ?? null,
          evidence: {
            blockers: err.blockers,
            cleanupSchemaVersion: intent.schemaVersion,
            cleanupPlanVersion: intent.planVersion,
            cleanupStateFingerprint: intent.stateFingerprint,
            executionTokenHash,
          },
        });
      } catch (auditError) {
        const auditErr = auditError instanceof Error ? auditError : new Error(String(auditError));
        console.error('cleanup audit persistence failed for ineligible execution', {
          pluginId,
          auditError: auditErr.message,
        });
      }
    } else {
      const blockedKnownError =
        err.message === 'cleanup-execution-token-replayed' ||
        err.message === 'cleanup-execution-claim-conflict' ||
        err.message === 'stale-cleanup-plan-version' ||
        err.message === 'cleanup-state-fingerprint-mismatch' ||
        err.message === 'cleanup execution intent is required' ||
        err.message === 'unsupported-cleanup-plan-schema-version' ||
        err.message === 'cleanup execution intent plugin mismatch' ||
        err.message === 'cleanup execution token is required';

      try {
        await appendCleanupAudit(db, {
          pluginId,
          phase: blockedKnownError ? 'legacy-path-decommissioned' : 'cleanup-completed',
          result: blockedKnownError ? 'blocked' : 'failed',
          classification: blockedKnownError
            ? err.message === 'cleanup-execution-token-replayed'
              ? 'cleanup-token-replay-rejected'
              : err.message === 'cleanup-execution-claim-conflict'
                ? 'cleanup-claim-conflict-rejected'
                : 'cleanup-intent-rejected'
            : 'cleanup-transaction-failed',
          reason: err.message,
          blocking: true,
          operationId: options?.operationId ?? null,
          correlationId: options?.correlationId ?? null,
          evidence: {
            cleanupSchemaVersion: intent.schemaVersion,
            cleanupPlanVersion: intent.planVersion,
            cleanupStateFingerprint: intent.stateFingerprint,
            executionTokenHash,
          },
        });
      } catch (auditError) {
        const auditErr = auditError instanceof Error ? auditError : new Error(String(auditError));
        console.error('cleanup audit persistence failed after cleanup error', {
          pluginId,
          originalError: err.message,
          auditError: auditErr.message,
        });
      }

      throw err;
    }
  }

  if (ineligibleBlockers) {
    return {
      pluginId,
      mode: 'tombstone',
      dryRun,
      cleanupEligible: false,
      executed: false,
      blockers: ineligibleBlockers,
      affectedRows: 0,
    };
  }

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
