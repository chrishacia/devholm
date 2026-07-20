import { describe, expect, it } from 'vitest';
import { derivePluginManagementPresentation } from './presentation-model';

function createInput(
  overrides: Partial<Parameters<typeof derivePluginManagementPresentation>[0]> = {}
) {
  const base = {
    plugin: {
      name: 'URL Shortener',
      installed: true,
      isEnabled: true,
      installedVersion: '0.1.0',
      bundledVersion: '0.1.0',
    },
    lifecycleState: {
      axes: {
        desired: 'configured',
        resolution: 'verified',
        build: 'build-included',
        deployment: 'deployed',
        runtime: 'active',
        trust: 'verified',
        health: 'healthy',
        recovery: 'none',
      },
      summaryState: 'active',
    },
    actionAuthority: {
      byId: {
        install: {
          id: 'install',
          enabled: false,
          reasonCode: 'already-installed',
          safeExplanation:
            'Install is blocked until policy, trust, and recovery gates are satisfied.',
          approvalRequired: true,
          destructive: false,
          recoveryClassification: 'none',
        },
        resolve: {
          id: 'resolve',
          enabled: false,
          reasonCode: 'resolution-not-exposed',
          safeExplanation: 'Resolution is currently managed by internal lifecycle orchestration.',
          approvalRequired: false,
          destructive: false,
          recoveryClassification: 'retryable',
        },
        approve: {
          id: 'approve',
          enabled: false,
          reasonCode: 'approval-not-exposed',
          safeExplanation: 'Approval path is not yet exposed in the admin runtime API.',
          approvalRequired: true,
          destructive: false,
          recoveryClassification: 'none',
        },
        build: {
          id: 'build',
          enabled: false,
          reasonCode: 'build-not-exposed',
          safeExplanation:
            'Build orchestration is tracked through deployment automation and not manually triggered here.',
          approvalRequired: false,
          destructive: false,
          recoveryClassification: 'none',
        },
        deploy: {
          id: 'deploy',
          enabled: false,
          reasonCode: 'deploy-not-exposed',
          safeExplanation: 'Deployment orchestration is handled by the framework release pipeline.',
          approvalRequired: false,
          destructive: false,
          recoveryClassification: 'none',
        },
        activate: {
          id: 'activate',
          enabled: false,
          reasonCode: 'use-enable',
          safeExplanation: 'Activation is not available from the current lifecycle state.',
          approvalRequired: false,
          destructive: false,
          recoveryClassification: 'none',
        },
        enable: {
          id: 'enable',
          enabled: false,
          reasonCode: 'already-enabled',
          safeExplanation: 'Enable is blocked by current lifecycle or recovery constraints.',
          approvalRequired: false,
          destructive: false,
          recoveryClassification: 'none',
        },
        disable: {
          id: 'disable',
          enabled: true,
          reasonCode: null,
          safeExplanation: 'Disable can proceed safely.',
          approvalRequired: false,
          destructive: true,
          recoveryClassification: 'none',
        },
        update: {
          id: 'update',
          enabled: false,
          reasonCode: 'update-not-yet-supported',
          safeExplanation:
            'Update flow is not yet exposed for marketplace-admin runtime operations.',
          approvalRequired: false,
          destructive: false,
          recoveryClassification: 'none',
        },
        rollback: {
          id: 'rollback',
          enabled: false,
          reasonCode: 'no-eligible-rollback-candidate',
          safeExplanation: 'Rollback is blocked by migration, artifact, or recovery constraints.',
          approvalRequired: false,
          destructive: true,
          recoveryClassification: 'recovery-required',
        },
        recover: {
          id: 'recover',
          enabled: false,
          reasonCode: 'recovery-not-required',
          safeExplanation: 'Recovery action is not required for this plugin.',
          approvalRequired: false,
          destructive: false,
          recoveryClassification: 'recovery-required',
        },
        retry: {
          id: 'retry',
          enabled: false,
          reasonCode: 'retry-not-safe',
          safeExplanation: 'Retry is unsafe until reconciliation marks this operation retryable.',
          approvalRequired: false,
          destructive: false,
          recoveryClassification: 'none',
        },
        'take-over-expired-operation': {
          id: 'take-over-expired-operation',
          enabled: false,
          reasonCode: 'takeover-not-available',
          safeExplanation:
            'Operation takeover is unavailable until lease expiry and reconciler approval.',
          approvalRequired: false,
          destructive: false,
          recoveryClassification: 'none',
        },
        'acknowledge-manual-intervention': {
          id: 'acknowledge-manual-intervention',
          enabled: false,
          reasonCode: 'manual-intervention-not-required',
          safeExplanation: 'Manual intervention acknowledgement is not currently required.',
          approvalRequired: false,
          destructive: false,
          recoveryClassification: 'manual-intervention-required',
        },
      },
      available: [
        {
          id: 'disable',
          enabled: true,
          reasonCode: null,
          safeExplanation: 'Disable can proceed safely.',
          approvalRequired: false,
          destructive: true,
          recoveryClassification: 'none',
        },
      ],
      blocked: [],
    },
    sourceResolution: {
      configuredSourceKind: 'bundled-fallback-artifact',
      resolvedSourceKind: 'bundled-fallback-artifact',
      localOverrideEnabled: false,
    },
    trustPolicy: {
      outcome: 'allow' as const,
      reasonCode: 'allowed',
    },
    reconciliation: {
      action: 'none',
      message: 'No action required.',
      remediation: 'Proceed with canonical server-provided lifecycle actions.',
    },
    rollback: {
      eligible: false,
    },
    operation: {
      hasActive: false,
      recoveryRequired: false,
    },
    catalogEntry: {
      version: '0.1.0',
    },
  } satisfies Parameters<typeof derivePluginManagementPresentation>[0];

  return {
    ...base,
    ...overrides,
  } as Parameters<typeof derivePluginManagementPresentation>[0];
}

describe('derivePluginManagementPresentation', () => {
  it('uses canonical active state as the primary truth', () => {
    const presentation = derivePluginManagementPresentation(createInput());

    expect(presentation.primaryStatus.id).toBe('active');
    expect(presentation.primaryStatus.label).toBe('Active');
    expect(presentation.primaryStatus.tone).toBe('success');
    expect(presentation.primaryAction?.id).toBe('disable');
    expect(presentation.sourceLabel).toBe('Bundled default');
    expect(presentation.secondaryActions[0]?.id).toBe('inspect');
  });

  it('prefers recovery-required over active-looking runtime details', () => {
    const presentation = derivePluginManagementPresentation(
      createInput({
        lifecycleState: {
          axes: {
            ...createInput().lifecycleState.axes,
            recovery: 'recovery-required',
            runtime: 'active',
          },
          summaryState: 'recovery-required',
        },
        operation: {
          hasActive: false,
          recoveryRequired: true,
        },
        reconciliation: {
          action: 'require-recovery',
          message: 'Recovery is required before further lifecycle changes can proceed.',
          remediation: 'Open recovery flow and reconcile interrupted lifecycle phases.',
        },
      })
    );

    expect(presentation.primaryStatus.id).toBe('recovery-required');
    expect(presentation.primaryStatus.label).toBe('Needs recovery');
    expect(presentation.remediation?.title).toBe('Recovery required');
    expect(presentation.flags.recoveryRequired).toBe(true);
  });

  it('surfaces pending deployment distinctly from active or disabled states', () => {
    const presentation = derivePluginManagementPresentation(
      createInput({
        lifecycleState: {
          axes: {
            ...createInput().lifecycleState.axes,
            deployment: 'deploy-pending',
            runtime: 'disabled',
          },
          summaryState: 'deploy-pending',
        },
      })
    );

    expect(presentation.primaryStatus.label).toBe('Pending deployment');
    expect(presentation.flags.pendingDeployment).toBe(true);
  });

  it('uses action authority as the only action source and shows blocked remediation', () => {
    const presentation = derivePluginManagementPresentation(
      createInput({
        actionAuthority: {
          ...createInput().actionAuthority,
          byId: {
            ...createInput().actionAuthority.byId,
            install: {
              ...createInput().actionAuthority.byId.install,
              enabled: false,
              reasonCode: 'trust-blocked',
              safeExplanation:
                'Trust requirements must be satisfied before installation can proceed.',
            },
            disable: {
              ...createInput().actionAuthority.byId.disable,
              enabled: false,
              reasonCode: 'operation-in-progress',
              safeExplanation: 'Disable is blocked by current lifecycle or recovery constraints.',
            },
          },
          available: [],
          blocked: [],
        },
      })
    );

    expect(presentation.primaryAction).toBeNull();
    expect(presentation.blockedActions.some((action) => action.id === 'install')).toBe(true);
    expect(presentation.remediation?.detail).toContain('Trust requirements');
  });

  it('marks local override safely without inventing a different lifecycle state', () => {
    const presentation = derivePluginManagementPresentation(
      createInput({
        sourceResolution: {
          configuredSourceKind: 'local-development-checkout',
          resolvedSourceKind: 'local-development-checkout',
          localOverrideEnabled: true,
        },
      })
    );

    expect(presentation.sourceLabel).toBe('Local override');
    expect(presentation.flags.localOverride).toBe(true);
    expect(presentation.primaryStatus.id).toBe('active');
  });
});
