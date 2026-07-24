import { getDb } from '@/db';
import type { Knex } from 'knex';
import { getPluginDefinitions } from '@core/lib/plugins';
import { getInstalledPlugin, upsertPluginLedgerRecord } from '@core/db/plugin-lifecycle';
import { getBundledPluginManifests } from '@core/lib/plugin-registry.server';
import {
  appendPluginCutoverReconciliationEvent,
  upsertPluginCutoverReconciliationState,
  type PluginCutoverReconciliationPhase,
} from '@core/db/plugin-cutover-reconciliation';
import { acquirePluginLifecycleTransactionLock } from '@core/lib/plugin-lifecycle-coordination.server';

export type PluginLegacyTopology =
  | 'legacy-only'
  | 'canonical-only'
  | 'legacy-and-canonical'
  | 'neither';

export interface PluginLegacyReconciliationResult {
  pluginId: string;
  topology: PluginLegacyTopology;
  phase: PluginCutoverReconciliationPhase;
  blocking: boolean;
  reason: string;
  actions: string[];
}

function pluginSettingKey(pluginId: string): string {
  return `plugin:${pluginId}:enabled`;
}

function parseBooleanLike(value: unknown): boolean {
  if (value === true || value === 1) {
    return true;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return (
      normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on'
    );
  }

  return false;
}

function resolveTopology(
  hasLegacySetting: boolean,
  hasCanonicalRecord: boolean
): PluginLegacyTopology {
  if (hasLegacySetting && hasCanonicalRecord) {
    return 'legacy-and-canonical';
  }

  if (hasLegacySetting && !hasCanonicalRecord) {
    return 'legacy-only';
  }

  if (!hasLegacySetting && hasCanonicalRecord) {
    return 'canonical-only';
  }

  return 'neither';
}

export async function reconcileLegacyAndCanonicalPluginState(
  pluginId: string,
  options?: { correlationId?: string; db?: Knex }
): Promise<PluginLegacyReconciliationResult> {
  const db = options?.db ?? getDb();
  const definition = getPluginDefinitions().find((entry) => entry.id === pluginId);
  const manifest = getBundledPluginManifests().find((entry) => entry.id === pluginId);
  if (!definition) {
    throw new Error(`Unknown plugin id for reconciliation: ${pluginId}`);
  }
  if (!manifest) {
    throw new Error(`Missing bundled manifest for reconciliation: ${pluginId}`);
  }

  return db.transaction(async (trx) => {
    await acquirePluginLifecycleTransactionLock(pluginId, trx);

    const [legacySetting, canonicalRecord] = await Promise.all([
      trx('site_settings')
        .select('value', 'updated_at')
        .where({ key: pluginSettingKey(pluginId) })
        .first(),
      getInstalledPlugin(pluginId, trx),
    ]);

    const hasLegacySetting = Boolean(legacySetting);
    const hasCanonicalRecord = Boolean(canonicalRecord);
    const topology = resolveTopology(hasLegacySetting, hasCanonicalRecord);
    const actions: string[] = [];

    let phase: PluginCutoverReconciliationPhase = 'inspected';
    let blocking = false;
    let reason = 'State inspected';

    if (topology === 'legacy-only') {
      const enabledIntent = parseBooleanLike(legacySetting?.value);
      await upsertPluginLedgerRecord(
        {
          manifest,
          state: enabledIntent ? 'installed' : 'disabled',
          operationStatus: 'idle',
          enabled: enabledIntent,
          installedVersion: manifest.version,
          installedAt: new Date(),
          upgradedAt: null,
          disabledAt: enabledIntent ? null : new Date(),
          lastError: null,
        },
        trx
      );

      phase = 'canonical-record-established';
      reason = 'Canonical lifecycle record established from legacy intent.';
      actions.push('create-canonical-record-from-legacy-intent');
    } else if (topology === 'canonical-only') {
      phase = 'canonical-ownership-activated';
      reason = 'Already canonical; no migration replay needed.';
      actions.push('already-canonical-noop');
    } else if (topology === 'legacy-and-canonical') {
      const legacyEnabled = parseBooleanLike(legacySetting?.value);
      const canonicalEnabled = Boolean(canonicalRecord?.enabled);

      if (legacyEnabled !== canonicalEnabled) {
        phase = 'manual-intervention-required';
        blocking = true;
        reason =
          'Legacy enabled intent and canonical enabled state disagree; manual intervention required.';
        actions.push('detected-enabled-intent-disagreement');
      } else {
        phase = 'canonical-ownership-activated';
        reason = 'Legacy and canonical state are equivalent; canonical ownership retained.';
        actions.push('verified-equivalent-legacy-and-canonical-state');
      }
    } else {
      phase = 'inspected';
      reason = 'No legacy or canonical state found; keep default bundled policy.';
      actions.push('inspected-neither-state-no-installed-inference');
    }

    const state = await upsertPluginCutoverReconciliationState(
      {
        pluginId,
        phase,
        operationId: options?.correlationId ?? null,
        correlationId: options?.correlationId ?? null,
        classification: topology,
        blocking,
        reason,
        evidence: {
          topology,
          hasLegacySetting,
          hasCanonicalRecord,
          legacyEnabled: hasLegacySetting ? parseBooleanLike(legacySetting?.value) : null,
          canonicalEnabled: hasCanonicalRecord ? Boolean(canonicalRecord?.enabled) : null,
          actions,
        },
      },
      trx
    );

    await appendPluginCutoverReconciliationEvent(
      {
        pluginId,
        phase: state.phase,
        result: blocking ? 'blocked' : actions.length > 0 ? 'applied' : 'noop',
        operationId: options?.correlationId ?? null,
        correlationId: options?.correlationId ?? null,
        classification: topology,
        blocking,
        reason,
        evidence: state.evidence,
      },
      trx
    );
    return {
      pluginId,
      topology,
      phase,
      blocking,
      reason,
      actions,
    };
  });
}
