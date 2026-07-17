export type RollbackOutcome =
  | 'available'
  | 'blocked-artifact-missing'
  | 'blocked-image-mismatch'
  | 'blocked-migration-incompatible'
  | 'blocked-migration-irreversible'
  | 'application-only'
  | 'manual-intervention-required'
  | 'recovery-required';

export interface RollbackEvaluationInput {
  currentDeploymentRef: string | null;
  targetDeploymentRef: string | null;
  currentPluginVersion: string | null;
  targetPluginVersion: string | null;
  targetArtifactDigest: string | null;
  artifactAvailable: boolean;
  buildIncluded: boolean;
  migrationCompatible: boolean;
  migrationIrreversible: boolean;
  configurationCompatible: boolean;
  lastKnownSafeState: 'known' | 'unknown';
  deploymentHistoryHasTarget: boolean;
}

export interface RollbackEvaluationResult {
  outcome: RollbackOutcome;
  reason: string;
  requiredErrorCode:
    | 'LIFECYCLE_ROLLBACK_UNAVAILABLE'
    | 'LIFECYCLE_ROLLBACK_UNSAFE'
    | 'LIFECYCLE_RECOVERY_REQUIRED'
    | null;
}

export function evaluateRollbackAvailability(
  input: RollbackEvaluationInput
): RollbackEvaluationResult {
  if (input.lastKnownSafeState === 'unknown') {
    return {
      outcome: 'recovery-required',
      reason: 'Last known safe state is unknown.',
      requiredErrorCode: 'LIFECYCLE_RECOVERY_REQUIRED',
    };
  }

  if (!input.deploymentHistoryHasTarget) {
    return {
      outcome: 'manual-intervention-required',
      reason: 'Target version is not present in deployment history.',
      requiredErrorCode: 'LIFECYCLE_ROLLBACK_UNAVAILABLE',
    };
  }

  if (!input.artifactAvailable || !input.targetArtifactDigest) {
    return {
      outcome: 'blocked-artifact-missing',
      reason: 'Target artifact is unavailable or missing digest.',
      requiredErrorCode: 'LIFECYCLE_ROLLBACK_UNAVAILABLE',
    };
  }

  if (
    input.currentDeploymentRef &&
    input.targetDeploymentRef &&
    input.currentDeploymentRef === input.targetDeploymentRef
  ) {
    return {
      outcome: 'manual-intervention-required',
      reason: 'Current and target deployment references are identical.',
      requiredErrorCode: 'LIFECYCLE_ROLLBACK_UNAVAILABLE',
    };
  }

  if (!input.buildIncluded) {
    return {
      outcome: 'blocked-image-mismatch',
      reason: 'Target build artifact is not included in the current rollout set.',
      requiredErrorCode: 'LIFECYCLE_ROLLBACK_UNSAFE',
    };
  }

  if (input.migrationIrreversible) {
    return {
      outcome: 'blocked-migration-irreversible',
      reason: 'Irreversible migrations prevent safe rollback.',
      requiredErrorCode: 'LIFECYCLE_ROLLBACK_UNSAFE',
    };
  }

  if (!input.migrationCompatible) {
    return {
      outcome: 'blocked-migration-incompatible',
      reason: 'Migration state is incompatible with rollback target.',
      requiredErrorCode: 'LIFECYCLE_ROLLBACK_UNSAFE',
    };
  }

  if (!input.configurationCompatible) {
    return {
      outcome: 'application-only',
      reason: 'Configuration drift requires application-only rollback procedure.',
      requiredErrorCode: null,
    };
  }

  if (!input.targetPluginVersion || !input.currentPluginVersion) {
    return {
      outcome: 'manual-intervention-required',
      reason: 'Plugin version metadata is incomplete.',
      requiredErrorCode: 'LIFECYCLE_ROLLBACK_UNAVAILABLE',
    };
  }

  return {
    outcome: 'available',
    reason: 'Rollback is available with compatible deployment, artifact, and migration state.',
    requiredErrorCode: null,
  };
}
