import { describe, expect, it } from 'vitest';
import { derivePluginLifecycleActionAuthority } from '@core/lib/plugin-lifecycle-action-authority.server';

function buildInput(
  overrides: Partial<Parameters<typeof derivePluginLifecycleActionAuthority>[0]> = {}
): Parameters<typeof derivePluginLifecycleActionAuthority>[0] {
  return {
    installed: false,
    enabled: false,
    hasActiveOperation: false,
    leaseExpired: false,
    trustAllowed: true,
    runtimeInstallSupported: true,
    sourceResolutionHasErrors: false,
    rollbackEligible: false,
    rollbackReason: 'rollback-not-eligible',
    reconciliationAction: 'none',
    canonical: {
      axes: {
        desired: 'configured',
        resolution: 'verified',
        build: 'build-included',
        deployment: 'deployed',
        runtime: 'disabled',
        trust: 'verified',
        health: 'healthy',
        recovery: 'none',
      },
      summaryState: 'configured',
    },
    canMutate: true,
    ...overrides,
  };
}

describe('derivePluginLifecycleActionAuthority', () => {
  it('enables install when canonical gates are satisfied', () => {
    const authority = derivePluginLifecycleActionAuthority(buildInput());

    expect(authority.byId.install.enabled).toBe(true);
    expect(authority.byId.install.reasonCode).toBeNull();
  });

  it('blocks install when active non-expired operation exists', () => {
    const authority = derivePluginLifecycleActionAuthority(
      buildInput({ hasActiveOperation: true, leaseExpired: false })
    );

    expect(authority.byId.install.enabled).toBe(false);
    expect(authority.byId.install.reasonCode).toBe('operation-in-progress');
  });

  it('enables takeover action for expired lease reconciliation', () => {
    const authority = derivePluginLifecycleActionAuthority(
      buildInput({
        hasActiveOperation: true,
        leaseExpired: true,
        reconciliationAction: 'take-over-expired-lease',
      })
    );

    expect(authority.byId['take-over-expired-operation'].enabled).toBe(true);
    expect(authority.byId.retry.enabled).toBe(false);
  });

  it('enables recover and blocks enable when reconciliation requires recovery', () => {
    const authority = derivePluginLifecycleActionAuthority(
      buildInput({ installed: true, reconciliationAction: 'require-recovery' })
    );

    expect(authority.byId.recover.enabled).toBe(true);
    expect(authority.byId.enable.enabled).toBe(false);
    expect(authority.byId.enable.reasonCode).toBe('recovery-required');
  });

  it('enables rollback when rollback is eligible and safe', () => {
    const authority = derivePluginLifecycleActionAuthority(
      buildInput({
        installed: true,
        enabled: true,
        rollbackEligible: true,
        rollbackReason: 'compatible',
      })
    );

    expect(authority.byId.rollback.enabled).toBe(true);
    expect(authority.byId.rollback.reasonCode).toBeNull();
  });

  it('enables manual intervention acknowledgement when required', () => {
    const authority = derivePluginLifecycleActionAuthority(
      buildInput({ reconciliationAction: 'manual-intervention-required' })
    );

    expect(authority.byId['acknowledge-manual-intervention'].enabled).toBe(true);
    expect(authority.byId.recover.enabled).toBe(true);
  });
});
