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
import {
  acquirePluginLifecycleTransactionLock,
  withPluginLifecycleSessionLock,
} from '@core/lib/plugin-lifecycle-coordination.server';

export interface PluginCutoverRollbackExecutionResult {
  pluginId: string;
  executed: boolean;
  stage: PluginCutoverRollbackStage;
  status: 'succeeded' | 'blocked' | 'failed' | 'noop';
  reason: string;
  attemptCount: number;
  checkpointId: string | null;
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
  options?: { operationId?: string | null; correlationId?: string | null; db?: Knex }
): Promise<PluginCutoverRollbackExecutionResult> {
  const db = options?.db ?? getDb();
  return withPluginLifecycleSessionLock(
    pluginId,
    async () => {
      const plan = await buildPluginCutoverRollbackExecutionPlan(pluginId, db);

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
          operationId: options?.operationId ?? null,
          correlationId: options?.correlationId ?? null,
          reason: plan.blockingReason ?? 'rollback execution planned',
          evidence: plan.evidenceSnapshot,
        },
        db
      );

      if (!plan.shouldExecute) {
        await appendPluginCutoverReconciliationEvent(
          {
            pluginId,
            phase: 'rollback-pending',
            result: 'blocked',
            operationId: options?.operationId ?? null,
            correlationId: options?.correlationId ?? null,
            classification: 'rollback-blocked',
            blocking: true,
            reason: plan.blockingReason ?? 'rollback execution blocked',
            evidence: {
              stage: plan.stage,
              checkpointId: checkpoint.checkpointId,
            },
          },
          db
        );

        return {
          pluginId,
          executed: false,
          stage: plan.stage,
          status: 'blocked',
          reason: plan.blockingReason ?? 'rollback execution blocked',
          attemptCount: plan.attemptCount,
          checkpointId: checkpoint.checkpointId,
        };
      }

      const manifest = manifestForPlugin(pluginId);
      if (!manifest) {
        await upsertPluginCutoverRollbackCheckpoint(
          {
            pluginId,
            stage: plan.stage,
            status: 'failed',
            attemptCount: plan.attemptCount,
            rollbackEligible: false,
            irreversibleBoundary: plan.irreversibleBoundary,
            operationId: options?.operationId ?? null,
            correlationId: options?.correlationId ?? null,
            reason: 'missing bundled manifest for rollback',
            evidence: { checkpointId: checkpoint.checkpointId },
            completedAt: new Date().toISOString(),
          },
          db
        );

        return {
          pluginId,
          executed: false,
          stage: plan.stage,
          status: 'failed',
          reason: 'missing bundled manifest for rollback',
          attemptCount: plan.attemptCount,
          checkpointId: checkpoint.checkpointId,
        };
      }

      try {
        await db.transaction(async (trx) => {
          await acquirePluginLifecycleTransactionLock(pluginId, trx);
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
              operationId: options?.operationId ?? null,
              correlationId: options?.correlationId ?? null,
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
              operationId: options?.operationId ?? null,
              correlationId: options?.correlationId ?? null,
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
              operationId: options?.operationId ?? null,
              correlationId: options?.correlationId ?? null,
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
        });

        return {
          pluginId,
          executed: true,
          stage: plan.stage,
          status: 'succeeded',
          reason: 'rollback succeeded',
          attemptCount: plan.attemptCount,
          checkpointId: checkpoint.checkpointId,
        };
      } catch (error) {
        await upsertPluginCutoverRollbackCheckpoint(
          {
            pluginId,
            stage: plan.stage,
            status: 'failed',
            attemptCount: plan.attemptCount,
            rollbackEligible: true,
            irreversibleBoundary: false,
            operationId: options?.operationId ?? null,
            correlationId: options?.correlationId ?? null,
            reason: error instanceof Error ? error.message : String(error),
            evidence: {
              stage: plan.stage,
              checkpointId: checkpoint.checkpointId,
            },
            completedAt: new Date().toISOString(),
          },
          db
        );

        return {
          pluginId,
          executed: false,
          stage: plan.stage,
          status: 'failed',
          reason: error instanceof Error ? error.message : String(error),
          attemptCount: plan.attemptCount,
          checkpointId: checkpoint.checkpointId,
        };
      }
    },
    db
  );
}
