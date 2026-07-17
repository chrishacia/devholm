import { describe, expect, it } from 'vitest';
import {
  PluginLifecycleError,
  type LifecycleErrorCode,
  mapUnknownLifecycleError,
} from '@core/lib/plugin-lifecycle-errors';

const CASES: Array<{
  code: LifecycleErrorCode;
  expectedStatus: number;
  expectedRecovery:
    | 'retryable'
    | 'manual-intervention-required'
    | 'reconcile-on-restart'
    | 'blocked-policy';
  expectedRetryable: boolean;
}> = [
  {
    code: 'LIFECYCLE_INVALID_TRANSITION',
    expectedStatus: 409,
    expectedRecovery: 'blocked-policy',
    expectedRetryable: false,
  },
  {
    code: 'LIFECYCLE_UNAUTHORIZED',
    expectedStatus: 403,
    expectedRecovery: 'manual-intervention-required',
    expectedRetryable: false,
  },
  {
    code: 'LIFECYCLE_APPROVAL_REQUIRED',
    expectedStatus: 409,
    expectedRecovery: 'blocked-policy',
    expectedRetryable: false,
  },
  {
    code: 'LIFECYCLE_OPERATION_CONFLICT',
    expectedStatus: 409,
    expectedRecovery: 'retryable',
    expectedRetryable: true,
  },
  {
    code: 'LIFECYCLE_STALE_OPERATION',
    expectedStatus: 409,
    expectedRecovery: 'reconcile-on-restart',
    expectedRetryable: true,
  },
  {
    code: 'LIFECYCLE_TRUST_BLOCKED',
    expectedStatus: 409,
    expectedRecovery: 'blocked-policy',
    expectedRetryable: false,
  },
  {
    code: 'LIFECYCLE_INCOMPATIBLE',
    expectedStatus: 409,
    expectedRecovery: 'manual-intervention-required',
    expectedRetryable: false,
  },
  {
    code: 'LIFECYCLE_CONFIGURATION_MISSING',
    expectedStatus: 409,
    expectedRecovery: 'manual-intervention-required',
    expectedRetryable: false,
  },
  {
    code: 'LIFECYCLE_ARTIFACT_UNAVAILABLE',
    expectedStatus: 409,
    expectedRecovery: 'retryable',
    expectedRetryable: true,
  },
  {
    code: 'LIFECYCLE_BUILD_REQUIRED',
    expectedStatus: 409,
    expectedRecovery: 'retryable',
    expectedRetryable: true,
  },
  {
    code: 'LIFECYCLE_BUILD_FAILED',
    expectedStatus: 409,
    expectedRecovery: 'reconcile-on-restart',
    expectedRetryable: true,
  },
  {
    code: 'LIFECYCLE_DEPLOYMENT_REQUIRED',
    expectedStatus: 409,
    expectedRecovery: 'retryable',
    expectedRetryable: true,
  },
  {
    code: 'LIFECYCLE_DEPLOYMENT_FAILED',
    expectedStatus: 409,
    expectedRecovery: 'reconcile-on-restart',
    expectedRetryable: true,
  },
  {
    code: 'LIFECYCLE_MIGRATION_BLOCKED',
    expectedStatus: 409,
    expectedRecovery: 'blocked-policy',
    expectedRetryable: false,
  },
  {
    code: 'LIFECYCLE_MIGRATION_FAILED',
    expectedStatus: 409,
    expectedRecovery: 'reconcile-on-restart',
    expectedRetryable: true,
  },
  {
    code: 'LIFECYCLE_ACTIVATION_FAILED',
    expectedStatus: 409,
    expectedRecovery: 'reconcile-on-restart',
    expectedRetryable: true,
  },
  {
    code: 'LIFECYCLE_ROLLBACK_UNAVAILABLE',
    expectedStatus: 409,
    expectedRecovery: 'manual-intervention-required',
    expectedRetryable: false,
  },
  {
    code: 'LIFECYCLE_ROLLBACK_UNSAFE',
    expectedStatus: 409,
    expectedRecovery: 'manual-intervention-required',
    expectedRetryable: false,
  },
  {
    code: 'LIFECYCLE_RECOVERY_REQUIRED',
    expectedStatus: 409,
    expectedRecovery: 'manual-intervention-required',
    expectedRetryable: false,
  },
  {
    code: 'LIFECYCLE_INFRASTRUCTURE_UNAVAILABLE',
    expectedStatus: 503,
    expectedRecovery: 'retryable',
    expectedRetryable: true,
  },
  {
    code: 'LIFECYCLE_INTERNAL_INVARIANT',
    expectedStatus: 500,
    expectedRecovery: 'manual-intervention-required',
    expectedRetryable: false,
  },
];

describe('plugin lifecycle errors contract', () => {
  it.each(CASES)(
    'maps $code to stable metadata',
    ({ code, expectedStatus, expectedRecovery, expectedRetryable }) => {
      const error = new PluginLifecycleError({
        code,
        internalDiagnostic: `diagnostic-${code.toLowerCase()}`,
      });

      expect(error.code).toBe(code);
      expect(error.httpStatus).toBe(expectedStatus);
      expect(error.retryable).toBe(expectedRetryable);
      expect(error.recoveryClassification).toBe(expectedRecovery);
      expect(error.publicMessage.length).toBeGreaterThan(0);
      expect(error.internalDiagnostic).toContain('diagnostic-');
    }
  );

  it('maps unknown thrown errors to internal invariant', () => {
    const mapped = mapUnknownLifecycleError(new Error('unexpected failure'));
    expect(mapped.code).toBe('LIFECYCLE_INTERNAL_INVARIANT');
    expect(mapped.httpStatus).toBe(500);
  });
});
