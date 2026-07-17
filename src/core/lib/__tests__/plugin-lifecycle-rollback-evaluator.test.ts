import { describe, expect, it } from 'vitest';
import { evaluateRollbackAvailability } from '@core/lib/plugin-lifecycle-rollback-evaluator.server';

function baseline() {
  return {
    currentDeploymentRef: 'deploy-a',
    targetDeploymentRef: 'deploy-b',
    currentPluginVersion: '1.1.0',
    targetPluginVersion: '1.0.0',
    targetArtifactDigest: 'sha256:abc',
    artifactAvailable: true,
    buildIncluded: true,
    migrationCompatible: true,
    migrationIrreversible: false,
    configurationCompatible: true,
    lastKnownSafeState: 'known' as const,
    deploymentHistoryHasTarget: true,
  };
}

describe('plugin lifecycle rollback evaluator', () => {
  it('returns available when rollback constraints are satisfied', () => {
    const result = evaluateRollbackAvailability(baseline());
    expect(result).toMatchObject({ outcome: 'available', requiredErrorCode: null });
  });

  it('returns blocked-artifact-missing when target artifact is missing', () => {
    const result = evaluateRollbackAvailability({
      ...baseline(),
      artifactAvailable: false,
      targetArtifactDigest: null,
    });

    expect(result).toMatchObject({
      outcome: 'blocked-artifact-missing',
      requiredErrorCode: 'LIFECYCLE_ROLLBACK_UNAVAILABLE',
    });
  });

  it('returns blocked-image-mismatch when target build is not included', () => {
    const result = evaluateRollbackAvailability({ ...baseline(), buildIncluded: false });

    expect(result).toMatchObject({
      outcome: 'blocked-image-mismatch',
      requiredErrorCode: 'LIFECYCLE_ROLLBACK_UNSAFE',
    });
  });

  it('returns blocked-migration-incompatible when migrations cannot be reversed safely', () => {
    const result = evaluateRollbackAvailability({
      ...baseline(),
      migrationCompatible: false,
    });

    expect(result).toMatchObject({
      outcome: 'blocked-migration-incompatible',
      requiredErrorCode: 'LIFECYCLE_ROLLBACK_UNSAFE',
    });
  });

  it('returns blocked-migration-irreversible for irreversible migration checkpoints', () => {
    const result = evaluateRollbackAvailability({
      ...baseline(),
      migrationIrreversible: true,
    });

    expect(result).toMatchObject({
      outcome: 'blocked-migration-irreversible',
      requiredErrorCode: 'LIFECYCLE_ROLLBACK_UNSAFE',
    });
  });

  it('returns application-only when config drift blocks full rollback', () => {
    const result = evaluateRollbackAvailability({
      ...baseline(),
      configurationCompatible: false,
    });

    expect(result).toMatchObject({ outcome: 'application-only', requiredErrorCode: null });
  });

  it('returns recovery-required when safe state is unknown', () => {
    const result = evaluateRollbackAvailability({
      ...baseline(),
      lastKnownSafeState: 'unknown',
    });

    expect(result).toMatchObject({
      outcome: 'recovery-required',
      requiredErrorCode: 'LIFECYCLE_RECOVERY_REQUIRED',
    });
  });

  it('returns manual-intervention-required when deployment history lacks target', () => {
    const result = evaluateRollbackAvailability({
      ...baseline(),
      deploymentHistoryHasTarget: false,
    });

    expect(result).toMatchObject({
      outcome: 'manual-intervention-required',
      requiredErrorCode: 'LIFECYCLE_ROLLBACK_UNAVAILABLE',
    });
  });
});
