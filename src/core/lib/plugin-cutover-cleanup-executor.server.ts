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

const consumedCleanupExecutionTokens = new Set<string>();

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

  if (dryRun) {
    return {
      pluginId,
      mode: 'tombstone',
      dryRun: true,
      cleanupEligible: true,
      executed: false,
      blockers: [],
      affectedRows: 0,
    };
  }

  assertCleanupExecutionIntentMatchesPlan(
    options?.intent,
    plan,
    plan.stateFingerprint,
    consumedCleanupExecutionTokens
  );
  consumedCleanupExecutionTokens.add(options.intent!.executionToken);
  const planVersion = computePluginCutoverCleanupPlanVersion(plan);

  const keys = legacyCleanupMarkerKeys(pluginId);
  let affectedRows = 0;

  await db.transaction(async (trx) => {
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
          executionToken: options.intent!.executionToken,
          excludedDomainDataTables: plan.excludedDomainDataTables,
        },
      },
      trx
    );

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

export function resetCleanupExecutionTokenRegistryForTests(): void {
  consumedCleanupExecutionTokens.clear();
}
