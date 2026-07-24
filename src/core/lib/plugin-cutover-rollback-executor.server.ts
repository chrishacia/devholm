import type { Knex } from 'knex';
import { getDb } from '@/db';
import {
  appendPluginCutoverReconciliationEvent,
  upsertPluginCutoverReconciliationState,
} from '@core/db/plugin-cutover-reconciliation';
import {
  upsertPluginCutoverRollbackCheckpoint,
  type PluginCutoverRollbackStage,
} from '@core/db/plugin-cutover-rollback';
import { getBundledPluginManifests } from '@core/lib/plugin-registry.server';
import { getInstalledPlugin, upsertPluginLedgerRecord } from '@core/db/plugin-lifecycle';
import { buildPluginCutoverRollbackExecutionPlan } from './plugin-cutover-rollback-planner.server';
import { legacyCleanupMarkerKeys } from './plugin-cutover-cleanup-planner.server';
import { acquirePluginLifecycleTransactionLock } from '@core/lib/plugin-lifecycle-coordination.server';

export interface PluginCutoverRollbackExecutionResult {
  pluginId: string;
  executed: boolean;
  stage: PluginCutoverRollbackStage;
  status: 'succeeded' | 'blocked' | 'failed' | 'noop';
  reason: string;
  attemptCount: number;
  checkpointId: string | null;
  secondaryFailures?: Array<{
    phase: 'failure-persistence';
    message: string;
  }>;
}

export type PluginRollbackExecutionContext =
  | {
      kind: 'root-db';
      db?: Knex;
    }
  | {
      kind: 'existing-transaction';
      trx: Knex.Transaction;
      lockAlreadyHeld: true;
      failurePersistenceDb?: Knex;
    };

export interface PluginRollbackFailureDetails {
  pluginId: string;
  stage: PluginCutoverRollbackStage;
  attemptCount: number;
  checkpointId: string | null;
  operationId: string | null;
  correlationId: string | null;
  primaryError: Error;
}

export class PluginRollbackExecutionError extends Error {
  readonly details: PluginRollbackFailureDetails;

  constructor(details: PluginRollbackFailureDetails) {
    super(details.primaryError.message);
    this.name = 'PluginRollbackExecutionError';
    this.details = details;
    this.cause = details.primaryError;
  }
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

async function persistRollbackFailureCheckpoint(
  details: PluginRollbackFailureDetails,
  db: Knex
): Promise<void> {
  await db.transaction(async (trx) => {
    await acquirePluginLifecycleTransactionLock(details.pluginId, trx);

    await upsertPluginCutoverRollbackCheckpoint(
      {
        pluginId: details.pluginId,
        stage: details.stage,
        status: 'failed',
        attemptCount: details.attemptCount,
        rollbackEligible: true,
        irreversibleBoundary: false,
        operationId: details.operationId,
        correlationId: details.correlationId,
        reason: details.primaryError.message,
        evidence: {
          stage: details.stage,
          checkpointId: details.checkpointId,
        },
        completedAt: new Date().toISOString(),
      },
      trx
    );
  });
}

function resolveExecutionContext(options?: {
  operationId?: string | null;
  correlationId?: string | null;
  db?: Knex;
  context?: PluginRollbackExecutionContext;
}): {
  executionDb: Knex | Knex.Transaction;
  executionKind: 'root-db' | 'existing-transaction';
  failurePersistenceDb: Knex;
} {
  if (options?.context?.kind === 'existing-transaction') {
    return {
      executionDb: options.context.trx,
      executionKind: 'existing-transaction',
      failurePersistenceDb: options.context.failurePersistenceDb ?? getDb(),
    };
  }

  if (options?.context?.kind === 'root-db') {
    const db = options.context.db ?? getDb();
    return {
      executionDb: db,
      executionKind: 'root-db',
      failurePersistenceDb: db,
    };
  }

  const db = options?.db ?? getDb();
  return {
    executionDb: db,
    executionKind: 'root-db',
    failurePersistenceDb: db,
  };
}

function manifestForPlugin(pluginId: string) {
  return getBundledPluginManifests().find((entry) => entry.id === pluginId) ?? null;
}

async function applyStageInverseAction(plan: {
  pluginId: string;
  stage: PluginCutoverRollbackStage;
  db: Knex;
}): Promise<{ lifecycleState: 'installed' | 'disabled' | 'bundled'; enabled: boolean }> {
  const installed = await getInstalledPlugin(plan.pluginId, plan.db);

  if (!installed) {
    throw new Error('canonical-record-missing');
  }

  switch (plan.stage) {
    case 'before-canonical-lifecycle-creation':
      return { lifecycleState: 'bundled', enabled: false };
    case 'after-canonical-lifecycle-creation':
      return { lifecycleState: 'bundled', enabled: false };
    case 'after-enabled-settings-reconciliation':
      return {
        lifecycleState: installed.enabled ? 'installed' : 'disabled',
        enabled: installed.enabled,
      };
    case 'before-legacy-decommission':
      return {
        lifecycleState: installed.enabled ? 'installed' : 'disabled',
        enabled: installed.enabled,
      };
    case 'after-legacy-decommission-initiation':
      return {
        lifecycleState: installed.enabled ? 'installed' : 'disabled',
        enabled: installed.enabled,
      };
    default:
      return {
        lifecycleState: installed.enabled ? 'installed' : 'disabled',
        enabled: installed.enabled,
      };
  }
}

export async function executePluginCutoverRollback(
  pluginId: string,
  options?: {
    operationId?: string | null;
    correlationId?: string | null;
    db?: Knex;
    context?: PluginRollbackExecutionContext;
  }
): Promise<PluginCutoverRollbackExecutionResult> {
  const execution = resolveExecutionContext(options);
  const manifest = manifestForPlugin(pluginId);
  if (!manifest) {
    return {
      pluginId,
      executed: false,
      stage: 'after-enabled-settings-reconciliation',
      status: 'failed',
      reason: 'missing bundled manifest for rollback',
      attemptCount: 1,
      checkpointId: null,
    };
  }

  let checkpointId: string | null = null;
  let attemptCount = 1;
  let stage: PluginCutoverRollbackStage = 'after-enabled-settings-reconciliation';
  const operationId = options?.operationId ?? null;
  const correlationId = options?.correlationId ?? null;

  try {
    const result =
      execution.executionKind === 'root-db'
        ? await (execution.executionDb as Knex).transaction(async (trx) => {
            await acquirePluginLifecycleTransactionLock(pluginId, trx);

            const plan = await buildPluginCutoverRollbackExecutionPlan(pluginId, trx);
            stage = plan.stage;
            attemptCount = plan.attemptCount;

            const checkpoint = await upsertPluginCutoverRollbackCheckpoint(
              {
                pluginId,
                stage: plan.stage,
                status: plan.shouldExecute
                  ? 'running'
                  : plan.rollbackEligible
                    ? 'pending'
                    : 'unavailable',
                attemptCount: plan.attemptCount,
                rollbackEligible: plan.rollbackEligible,
                irreversibleBoundary: plan.irreversibleBoundary,
                operationId,
                correlationId,
                reason: plan.blockingReason ?? 'rollback execution planned',
                evidence: plan.evidenceSnapshot,
              },
              trx
            );
            checkpointId = checkpoint.checkpointId;

            if (!plan.shouldExecute) {
              await appendPluginCutoverReconciliationEvent(
                {
                  pluginId,
                  phase: 'rollback-pending',
                  result: 'blocked',
                  operationId,
                  correlationId,
                  classification: 'rollback-blocked',
                  blocking: true,
                  reason: plan.blockingReason ?? 'rollback execution blocked',
                  evidence: {
                    stage: plan.stage,
                    checkpointId: checkpoint.checkpointId,
                  },
                },
                trx
              );

              return {
                pluginId,
                executed: false,
                stage: plan.stage,
                status: 'blocked' as const,
                reason: plan.blockingReason ?? 'rollback execution blocked',
                attemptCount: plan.attemptCount,
                checkpointId: checkpoint.checkpointId,
              };
            }

            const inverse = await applyStageInverseAction({
              pluginId,
              stage: plan.stage,
              db: trx,
            });

            if (
              plan.stage === 'before-legacy-decommission' ||
              plan.stage === 'after-legacy-decommission-initiation'
            ) {
              const keys = legacyCleanupMarkerKeys(pluginId);

              await trx('site_settings')
                .insert({
                  key: keys.enabled,
                  value: inverse.enabled ? 'true' : 'false',
                  type: 'boolean',
                  category: 'plugins',
                  description: `${pluginId} legacy compatibility enabled state`,
                  updated_at: new Date(),
                })
                .onConflict('key')
                .merge({
                  value: inverse.enabled ? 'true' : 'false',
                  updated_at: new Date(),
                });

              await trx('site_settings').where({ key: keys.tombstoned }).del();
            }

            await upsertPluginLedgerRecord(
              {
                manifest,
                state: inverse.lifecycleState,
                operationStatus: 'idle',
                enabled: inverse.enabled,
                installedVersion: inverse.lifecycleState === 'bundled' ? null : manifest.version,
                installedAt: inverse.lifecycleState === 'bundled' ? null : new Date(),
                upgradedAt: null,
                disabledAt: inverse.enabled ? null : new Date(),
                lastError: null,
              },
              trx
            );

            await upsertPluginCutoverReconciliationState(
              {
                pluginId,
                phase: 'settings-data-preserved',
                operationId,
                correlationId,
                classification: 'rollback-executed',
                blocking: false,
                reason: 'Rollback inverse action executed successfully.',
                evidence: {
                  stage: plan.stage,
                  checkpointId: checkpoint.checkpointId,
                  legacyDecommissioned: false,
                },
              },
              trx
            );

            await appendPluginCutoverReconciliationEvent(
              {
                pluginId,
                phase: 'settings-data-preserved',
                result: 'applied',
                operationId,
                correlationId,
                classification: 'rollback-executed',
                blocking: false,
                reason: 'Rollback inverse action executed successfully.',
                evidence: {
                  stage: plan.stage,
                  checkpointId: checkpoint.checkpointId,
                },
              },
              trx
            );

            await upsertPluginCutoverRollbackCheckpoint(
              {
                pluginId,
                stage: plan.stage,
                status: 'succeeded',
                attemptCount: plan.attemptCount,
                rollbackEligible: true,
                irreversibleBoundary: false,
                operationId,
                correlationId,
                reason: 'rollback succeeded',
                evidence: {
                  stage: plan.stage,
                  checkpointId: checkpoint.checkpointId,
                  lifecycleState: inverse.lifecycleState,
                  enabled: inverse.enabled,
                },
                completedAt: new Date().toISOString(),
              },
              trx
            );

            return {
              pluginId,
              executed: true,
              stage: plan.stage,
              status: 'succeeded' as const,
              reason: 'rollback succeeded',
              attemptCount: plan.attemptCount,
              checkpointId: checkpoint.checkpointId,
            };
          })
        : await (async () => {
            const trx = execution.executionDb as Knex.Transaction;

            const plan = await buildPluginCutoverRollbackExecutionPlan(pluginId, trx);
            stage = plan.stage;
            attemptCount = plan.attemptCount;

            const checkpoint = await upsertPluginCutoverRollbackCheckpoint(
              {
                pluginId,
                stage: plan.stage,
                status: plan.shouldExecute
                  ? 'running'
                  : plan.rollbackEligible
                    ? 'pending'
                    : 'unavailable',
                attemptCount: plan.attemptCount,
                rollbackEligible: plan.rollbackEligible,
                irreversibleBoundary: plan.irreversibleBoundary,
                operationId,
                correlationId,
                reason: plan.blockingReason ?? 'rollback execution planned',
                evidence: plan.evidenceSnapshot,
              },
              trx
            );
            checkpointId = checkpoint.checkpointId;

            if (!plan.shouldExecute) {
              await appendPluginCutoverReconciliationEvent(
                {
                  pluginId,
                  phase: 'rollback-pending',
                  result: 'blocked',
                  operationId,
                  correlationId,
                  classification: 'rollback-blocked',
                  blocking: true,
                  reason: plan.blockingReason ?? 'rollback execution blocked',
                  evidence: {
                    stage: plan.stage,
                    checkpointId: checkpoint.checkpointId,
                  },
                },
                trx
              );

              return {
                pluginId,
                executed: false,
                stage: plan.stage,
                status: 'blocked' as const,
                reason: plan.blockingReason ?? 'rollback execution blocked',
                attemptCount: plan.attemptCount,
                checkpointId: checkpoint.checkpointId,
              };
            }

            const inverse = await applyStageInverseAction({
              pluginId,
              stage: plan.stage,
              db: trx,
            });

            if (
              plan.stage === 'before-legacy-decommission' ||
              plan.stage === 'after-legacy-decommission-initiation'
            ) {
              const keys = legacyCleanupMarkerKeys(pluginId);

              await trx('site_settings')
                .insert({
                  key: keys.enabled,
                  value: inverse.enabled ? 'true' : 'false',
                  type: 'boolean',
                  category: 'plugins',
                  description: `${pluginId} legacy compatibility enabled state`,
                  updated_at: new Date(),
                })
                .onConflict('key')
                .merge({
                  value: inverse.enabled ? 'true' : 'false',
                  updated_at: new Date(),
                });

              await trx('site_settings').where({ key: keys.tombstoned }).del();
            }

            await upsertPluginLedgerRecord(
              {
                manifest,
                state: inverse.lifecycleState,
                operationStatus: 'idle',
                enabled: inverse.enabled,
                installedVersion: inverse.lifecycleState === 'bundled' ? null : manifest.version,
                installedAt: inverse.lifecycleState === 'bundled' ? null : new Date(),
                upgradedAt: null,
                disabledAt: inverse.enabled ? null : new Date(),
                lastError: null,
              },
              trx
            );

            await upsertPluginCutoverReconciliationState(
              {
                pluginId,
                phase: 'settings-data-preserved',
                operationId,
                correlationId,
                classification: 'rollback-executed',
                blocking: false,
                reason: 'Rollback inverse action executed successfully.',
                evidence: {
                  stage: plan.stage,
                  checkpointId: checkpoint.checkpointId,
                  legacyDecommissioned: false,
                },
              },
              trx
            );

            await appendPluginCutoverReconciliationEvent(
              {
                pluginId,
                phase: 'settings-data-preserved',
                result: 'applied',
                operationId,
                correlationId,
                classification: 'rollback-executed',
                blocking: false,
                reason: 'Rollback inverse action executed successfully.',
                evidence: {
                  stage: plan.stage,
                  checkpointId: checkpoint.checkpointId,
                },
              },
              trx
            );

            await upsertPluginCutoverRollbackCheckpoint(
              {
                pluginId,
                stage: plan.stage,
                status: 'succeeded',
                attemptCount: plan.attemptCount,
                rollbackEligible: true,
                irreversibleBoundary: false,
                operationId,
                correlationId,
                reason: 'rollback succeeded',
                evidence: {
                  stage: plan.stage,
                  checkpointId: checkpoint.checkpointId,
                  lifecycleState: inverse.lifecycleState,
                  enabled: inverse.enabled,
                },
                completedAt: new Date().toISOString(),
              },
              trx
            );

            return {
              pluginId,
              executed: true,
              stage: plan.stage,
              status: 'succeeded' as const,
              reason: 'rollback succeeded',
              attemptCount: plan.attemptCount,
              checkpointId: checkpoint.checkpointId,
            };
          })();

    return result;
  } catch (error) {
    const primaryError = normalizeError(error);
    const failureDetails: PluginRollbackFailureDetails = {
      pluginId,
      stage,
      attemptCount,
      checkpointId,
      operationId,
      correlationId,
      primaryError,
    };

    if (execution.executionKind === 'existing-transaction') {
      throw new PluginRollbackExecutionError(failureDetails);
    }

    let persistenceError: Error | null = null;

    try {
      await persistRollbackFailureCheckpoint(failureDetails, execution.failurePersistenceDb);
    } catch (checkpointError) {
      persistenceError = normalizeError(checkpointError);
    }

    return {
      pluginId,
      executed: false,
      stage,
      status: 'failed',
      reason: primaryError.message,
      attemptCount,
      checkpointId,
      secondaryFailures: persistenceError
        ? [
            {
              phase: 'failure-persistence',
              message: persistenceError.message,
            },
          ]
        : undefined,
    };
  }
}

export async function persistPluginCutoverRollbackFailure(
  details: PluginRollbackFailureDetails,
  db: Knex = getDb()
): Promise<void> {
  await persistRollbackFailureCheckpoint(details, db);
}
