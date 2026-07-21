import type { Knex } from 'knex';
import { getDb } from '@/db';
import { getInstalledPlugin, findActivePluginLifecycleOperation } from '@core/db/plugin-lifecycle';
import { readPluginCutoverReconciliationState } from '@core/db/plugin-cutover-reconciliation';
import { readLatestPluginCutoverRollbackCheckpoint } from '@core/db/plugin-cutover-rollback';
import {
  computePluginCutoverCleanupStateFingerprint,
  type PluginCutoverCleanupStateBindingInput,
} from './plugin-cutover-cleanup-contract.server';

export interface PluginCutoverCleanupPlan {
  pluginId: string;
  mode: 'tombstone';
  cleanupEligible: boolean;
  blockers: string[];
  rollbackAvailable: boolean;
  irreversibleBoundary: boolean;
  hasLegacyEnabledSetting: boolean;
  hasLogicalDecommissionMarker: boolean;
  hasCleanupTombstoneMarker: boolean;
  proposedChanges: string[];
  excludedDomainDataTables: string[];
  stateBinding: PluginCutoverCleanupStateBindingInput;
  stateFingerprint: string;
}

function legacyEnabledKey(pluginId: string): string {
  return `plugin:${pluginId}:enabled`;
}

function legacyDecommissionMarkerKey(pluginId: string): string {
  return `plugin:${pluginId}:legacy-state-decommissioned-at`;
}

function legacyTombstoneMarkerKey(pluginId: string): string {
  return `plugin:${pluginId}:legacy-state-tombstoned-at`;
}

export async function buildPluginCutoverCleanupPlan(
  pluginId: string,
  db: Knex = getDb()
): Promise<PluginCutoverCleanupPlan> {
  const [
    installed,
    activeOperation,
    cutoverState,
    rollbackCheckpoint,
    legacyEnabled,
    decommission,
    tombstone,
  ] = await Promise.all([
    getInstalledPlugin(pluginId, db),
    findActivePluginLifecycleOperation(pluginId, db),
    readPluginCutoverReconciliationState(pluginId, db),
    readLatestPluginCutoverRollbackCheckpoint(pluginId, db),
    db('site_settings')
      .select('key')
      .where({ key: legacyEnabledKey(pluginId) })
      .first(),
    db('site_settings')
      .select('key')
      .where({ key: legacyDecommissionMarkerKey(pluginId) })
      .first(),
    db('site_settings')
      .select('key')
      .where({ key: legacyTombstoneMarkerKey(pluginId) })
      .first(),
  ]);

  const blockers: string[] = [];

  const canonicalAuthorityActive =
    installed &&
    (installed.lifecycleState === 'installed' || installed.lifecycleState === 'disabled');

  if (!canonicalAuthorityActive) {
    blockers.push('canonical-runtime-authority-not-active');
  }

  if (!cutoverState || cutoverState.phase !== 'legacy-path-decommissioned') {
    blockers.push('legacy-not-logically-decommissioned');
  }

  if (!decommission) {
    blockers.push('legacy-decommission-marker-missing');
  }

  if (activeOperation) {
    blockers.push('active-lifecycle-operation-present');
  }

  if (rollbackCheckpoint?.status === 'running') {
    blockers.push('rollback-in-progress');
  }

  const irreversibleBoundary = Boolean(rollbackCheckpoint?.irreversibleBoundary);
  if (irreversibleBoundary) {
    blockers.push('rollback-irreversible-boundary');
  }

  const hasLegacyEnabledSetting = Boolean(legacyEnabled);
  const hasLogicalDecommissionMarker = Boolean(decommission);
  const hasCleanupTombstoneMarker = Boolean(tombstone);

  const proposedChanges: string[] = [];
  if (hasLegacyEnabledSetting) {
    proposedChanges.push('delete-legacy-enabled-setting');
  }
  if (!hasCleanupTombstoneMarker) {
    proposedChanges.push('write-legacy-tombstone-marker');
  }
  proposedChanges.push('persist-cleanup-completed-cutover-phase');

  const cleanupEligible =
    blockers.length === 0 && (hasLegacyEnabledSetting || !hasCleanupTombstoneMarker);

  const stateBinding: PluginCutoverCleanupStateBindingInput = {
    pluginId,
    canonicalIdentity: {
      lifecycleState: installed?.lifecycleState ?? null,
      installedVersion: installed?.installedVersion ?? null,
      bundledVersion: installed?.bundledVersion ?? null,
      enabled: installed?.enabled ?? null,
      manifestChecksum: installed?.manifestChecksum ?? null,
      updatedAtIso: installed?.updatedAt ? new Date(installed.updatedAt).toISOString() : null,
    },
    legacyIdentity: {
      hasLegacyEnabledSetting,
      hasLogicalDecommissionMarker,
      hasCleanupTombstoneMarker,
    },
    cutoverIdentity: {
      phase: cutoverState?.phase ?? null,
      classification: cutoverState?.classification ?? null,
      blocking: cutoverState?.blocking ?? false,
      updatedAtIso: cutoverState?.updatedAt ?? null,
    },
    rollbackIdentity: {
      status: rollbackCheckpoint?.status ?? null,
      rollbackEligible: rollbackCheckpoint?.rollbackEligible ?? true,
      irreversibleBoundary,
      attemptCount: rollbackCheckpoint?.attemptCount ?? null,
    },
    operationIdentity: {
      hasActiveOperation: Boolean(activeOperation),
      activeOperationId: activeOperation?.operationId ?? null,
    },
  };
  const stateFingerprint = computePluginCutoverCleanupStateFingerprint(stateBinding);

  return {
    pluginId,
    mode: 'tombstone',
    cleanupEligible,
    blockers,
    rollbackAvailable: rollbackCheckpoint?.rollbackEligible ?? true,
    irreversibleBoundary,
    hasLegacyEnabledSetting,
    hasLogicalDecommissionMarker,
    hasCleanupTombstoneMarker,
    proposedChanges,
    excludedDomainDataTables: [
      'u_calendar_events',
      'u_gallery_assets',
      'u_gallery_collections',
      'u_url_shortener_links',
      'u_url_shortener_click_events',
    ],
    stateBinding,
    stateFingerprint,
  };
}

export function legacyCleanupMarkerKeys(pluginId: string): {
  enabled: string;
  decommissioned: string;
  tombstoned: string;
} {
  return {
    enabled: legacyEnabledKey(pluginId),
    decommissioned: legacyDecommissionMarkerKey(pluginId),
    tombstoned: legacyTombstoneMarkerKey(pluginId),
  };
}
