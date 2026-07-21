import { createHash } from 'node:crypto';
import type { PluginCutoverCleanupPlan } from './plugin-cutover-cleanup-planner.server';

export const CLEANUP_PLAN_SCHEMA_VERSION = 2;

export interface PluginCutoverCleanupExecutionIntent {
  schemaVersion: number;
  planVersion: string;
  stateFingerprint: string;
  pluginId: string;
  executionToken: string;
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

export interface PluginCutoverCleanupStateBindingInput {
  pluginId: string;
  canonicalIdentity: {
    lifecycleState: string | null;
    installedVersion: string | null;
    bundledVersion: string | null;
    enabled: boolean | null;
    manifestChecksum: string | null;
    updatedAtIso: string | null;
  };
  legacyIdentity: {
    hasLegacyEnabledSetting: boolean;
    hasLogicalDecommissionMarker: boolean;
    hasCleanupTombstoneMarker: boolean;
  };
  cutoverIdentity: {
    phase: string | null;
    classification: string | null;
    blocking: boolean;
    updatedAtIso: string | null;
  };
  rollbackIdentity: {
    status: string | null;
    rollbackEligible: boolean;
    irreversibleBoundary: boolean;
    attemptCount: number | null;
  };
  operationIdentity: {
    hasActiveOperation: boolean;
    activeOperationId: string | null;
  };
}

export function computePluginCutoverCleanupStateFingerprint(
  input: PluginCutoverCleanupStateBindingInput
): string {
  const canonical = {
    schemaVersion: CLEANUP_PLAN_SCHEMA_VERSION,
    pluginId: input.pluginId,
    canonicalIdentity: input.canonicalIdentity,
    legacyIdentity: input.legacyIdentity,
    cutoverIdentity: input.cutoverIdentity,
    rollbackIdentity: input.rollbackIdentity,
    operationIdentity: input.operationIdentity,
  };

  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export function assertCleanupExecutionIntentMatchesPlan(
  intent: PluginCutoverCleanupExecutionIntent | undefined,
  plan: PluginCutoverCleanupPlan,
  expectedStateFingerprint: string,
  consumedExecutionTokens: ReadonlySet<string>
): void {
  if (!intent) {
    throw new Error('cleanup execution intent is required');
  }

  if (intent.schemaVersion !== CLEANUP_PLAN_SCHEMA_VERSION) {
    throw new Error('unsupported-cleanup-plan-schema-version');
  }

  if (intent.pluginId !== plan.pluginId) {
    throw new Error('cleanup execution intent plugin mismatch');
  }

  if (intent.stateFingerprint !== expectedStateFingerprint) {
    throw new Error('cleanup-state-fingerprint-mismatch');
  }

  if (!intent.executionToken || intent.executionToken.trim().length === 0) {
    throw new Error('cleanup execution token is required');
  }

  if (consumedExecutionTokens.has(intent.executionToken)) {
    throw new Error('cleanup-execution-token-replayed');
  }

  const expectedPlanVersion = computePluginCutoverCleanupPlanVersion(plan);
  if (intent.planVersion !== expectedPlanVersion) {
    throw new Error('stale-cleanup-plan-version');
  }
}
