import type { Knex } from 'knex';
import { getDb } from '@/db';
import { getInstalledPlugin } from '@core/db/plugin-lifecycle';
import {
  appendPluginCutoverReconciliationEvent,
  upsertPluginCutoverReconciliationState,
} from '@core/db/plugin-cutover-reconciliation';

export interface LegacyDecommissionResult {
  pluginId: string;
  applied: boolean;
  reason: string;
  decommissionedAt: string | null;
}

function markerKey(pluginId: string): string {
  return `plugin:${pluginId}:legacy-state-decommissioned-at`;
}

export async function logicallyDecommissionLegacyPluginState(
  pluginId: string,
  options?: { operationId?: string | null; correlationId?: string | null; db?: Knex }
): Promise<LegacyDecommissionResult> {
  const db = options?.db ?? getDb();
  const installed = await getInstalledPlugin(pluginId, db);

  if (
    !installed ||
    (installed.lifecycleState !== 'installed' && installed.lifecycleState !== 'disabled')
  ) {
    return {
      pluginId,
      applied: false,
      reason: 'canonical-runtime-authority-not-active',
      decommissionedAt: null,
    };
  }

  const decommissionedAt = new Date().toISOString();

  await db.transaction(async (trx) => {
    await trx('site_settings')
      .insert({
        key: markerKey(pluginId),
        value: decommissionedAt,
        type: 'string',
        category: 'plugins',
        description: `${pluginId} legacy state logical decommission timestamp`,
        updated_at: new Date(decommissionedAt),
      })
      .onConflict('key')
      .merge({
        value: decommissionedAt,
        updated_at: new Date(decommissionedAt),
      });

    const state = await upsertPluginCutoverReconciliationState(
      {
        pluginId,
        phase: 'legacy-path-decommissioned',
        operationId: options?.operationId ?? null,
        correlationId: options?.correlationId ?? null,
        classification: 'legacy-logically-decommissioned',
        blocking: false,
        reason: 'Legacy runtime authority logically decommissioned.',
        evidence: {
          canonicalLifecycleState: installed.lifecycleState,
          canonicalEnabled: installed.enabled,
          decommissionedAt,
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
        reason: state.reason ?? 'Legacy runtime authority logically decommissioned.',
        evidence: state.evidence,
        snapshot: state.snapshot,
      },
      trx
    );
  });

  return {
    pluginId,
    applied: true,
    reason: 'legacy-logically-decommissioned',
    decommissionedAt,
  };
}
