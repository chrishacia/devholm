import { createHash } from 'node:crypto';
import type { PluginCutoverCleanupPlan } from './plugin-cutover-cleanup-planner.server';

export interface PluginCutoverCleanupExecutionIntent {
  planVersion: string;
  pluginId: string;
}

export function computePluginCutoverCleanupPlanVersion(plan: PluginCutoverCleanupPlan): string {
  const canonical = {
    pluginId: plan.pluginId,
    mode: plan.mode,
    cleanupEligible: plan.cleanupEligible,
    blockers: [...plan.blockers].sort(),
    rollbackAvailable: plan.rollbackAvailable,
    irreversibleBoundary: plan.irreversibleBoundary,
    hasLegacyEnabledSetting: plan.hasLegacyEnabledSetting,
    hasLogicalDecommissionMarker: plan.hasLogicalDecommissionMarker,
    hasCleanupTombstoneMarker: plan.hasCleanupTombstoneMarker,
    proposedChanges: [...plan.proposedChanges].sort(),
    excludedDomainDataTables: [...plan.excludedDomainDataTables].sort(),
  };

  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export function assertCleanupExecutionIntentMatchesPlan(
  intent: PluginCutoverCleanupExecutionIntent | undefined,
  plan: PluginCutoverCleanupPlan
): void {
  if (!intent) {
    throw new Error('cleanup execution intent is required');
  }

  if (intent.pluginId !== plan.pluginId) {
    throw new Error('cleanup execution intent plugin mismatch');
  }

  const expectedPlanVersion = computePluginCutoverCleanupPlanVersion(plan);
  if (intent.planVersion !== expectedPlanVersion) {
    throw new Error('stale-cleanup-plan-version');
  }
}
