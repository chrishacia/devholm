import type {
  CanonicalPluginStateAxes,
  CanonicalPluginSummaryState,
} from '@core/types/plugin-canonical-contracts';
import type { LifecycleReconciliationAction } from '@core/lib/plugin-lifecycle-reconciler.server';

export type PluginLifecycleActionId =
  | 'install'
  | 'resolve'
  | 'approve'
  | 'build'
  | 'deploy'
  | 'activate'
  | 'enable'
  | 'disable'
  | 'update'
  | 'rollback'
  | 'recover'
  | 'retry'
  | 'take-over-expired-operation'
  | 'acknowledge-manual-intervention';

export type PluginLifecycleRecoveryClass =
  | 'none'
  | 'retryable'
  | 'rollback-eligible'
  | 'recovery-required'
  | 'manual-intervention-required';

export interface PluginLifecycleActionDecision {
  id: PluginLifecycleActionId;
  enabled: boolean;
  reasonCode: string | null;
  safeExplanation: string;
  approvalRequired: boolean;
  destructive: boolean;
  recoveryClassification: PluginLifecycleRecoveryClass;
}

export interface PluginLifecycleActionAuthority {
  byId: Record<PluginLifecycleActionId, PluginLifecycleActionDecision>;
  available: PluginLifecycleActionDecision[];
  blocked: PluginLifecycleActionDecision[];
}

export interface PluginLifecycleActionAuthorityInput {
  installed: boolean;
  enabled: boolean;
  hasActiveOperation: boolean;
  leaseExpired: boolean;
  trustAllowed: boolean;
  runtimeInstallSupported: boolean;
  sourceResolutionHasErrors: boolean;
  rollbackEligible: boolean;
  rollbackReason: string;
  reconciliationAction: LifecycleReconciliationAction;
  canonical: {
    axes: CanonicalPluginStateAxes;
    summaryState: CanonicalPluginSummaryState;
  };
  canMutate: boolean;
}

function createDecision(
  id: PluginLifecycleActionId,
  enabled: boolean,
  reasonCode: string | null,
  safeExplanation: string,
  options?: {
    approvalRequired?: boolean;
    destructive?: boolean;
    recoveryClassification?: PluginLifecycleRecoveryClass;
  }
): PluginLifecycleActionDecision {
  return {
    id,
    enabled,
    reasonCode,
    safeExplanation,
    approvalRequired: Boolean(options?.approvalRequired),
    destructive: Boolean(options?.destructive),
    recoveryClassification: options?.recoveryClassification ?? 'none',
  };
}

export function derivePluginLifecycleActionAuthority(
  input: PluginLifecycleActionAuthorityInput
): PluginLifecycleActionAuthority {
  const blockedForAuth = !input.canMutate;
  const blockedForActiveLease = input.hasActiveOperation && !input.leaseExpired;
  const blockedForRecovery =
    input.reconciliationAction === 'require-recovery' ||
    input.reconciliationAction === 'manual-intervention-required';

  const installEnabled =
    input.canMutate &&
    !input.installed &&
    !blockedForActiveLease &&
    !blockedForRecovery &&
    input.runtimeInstallSupported &&
    input.trustAllowed &&
    !input.sourceResolutionHasErrors;

  const enableEnabled =
    input.canMutate &&
    input.installed &&
    !input.enabled &&
    !blockedForActiveLease &&
    !blockedForRecovery;

  const disableEnabled =
    input.canMutate &&
    input.installed &&
    input.enabled &&
    !blockedForActiveLease &&
    !blockedForRecovery;

  const rollbackEnabled =
    input.canMutate &&
    input.rollbackEligible &&
    !blockedForActiveLease &&
    !blockedForRecovery &&
    !input.hasActiveOperation;

  const recoverEnabled =
    input.canMutate &&
    (input.reconciliationAction === 'require-recovery' ||
      input.reconciliationAction === 'manual-intervention-required' ||
      input.reconciliationAction === 'schedule-rollback');

  const retryEnabled =
    input.canMutate &&
    (input.reconciliationAction === 'resume-safe-retry' ||
      input.reconciliationAction === 'finalize-proven-success');

  const takeoverEnabled =
    input.canMutate &&
    input.leaseExpired &&
    input.reconciliationAction === 'take-over-expired-lease';

  const decisions: Record<PluginLifecycleActionId, PluginLifecycleActionDecision> = {
    install: createDecision(
      'install',
      installEnabled,
      installEnabled
        ? null
        : blockedForAuth
          ? 'unauthorized'
          : blockedForActiveLease
            ? 'operation-in-progress'
            : blockedForRecovery
              ? 'recovery-required'
              : !input.runtimeInstallSupported
                ? 'runtime-install-unsupported'
                : !input.trustAllowed
                  ? 'trust-blocked'
                  : input.sourceResolutionHasErrors
                    ? 'source-resolution-failed'
                    : 'already-installed',
      installEnabled
        ? 'Install can proceed with canonical lifecycle orchestration.'
        : 'Install is blocked until policy, trust, and recovery gates are satisfied.',
      {
        approvalRequired: true,
      }
    ),
    resolve: createDecision(
      'resolve',
      false,
      'resolution-not-exposed',
      'Resolution is currently managed by internal lifecycle orchestration.',
      { recoveryClassification: 'retryable' }
    ),
    approve: createDecision(
      'approve',
      false,
      'approval-not-exposed',
      'Approval path is not yet exposed in the admin runtime API.',
      { approvalRequired: true }
    ),
    build: createDecision(
      'build',
      false,
      'build-not-exposed',
      'Build orchestration is tracked through deployment automation and not manually triggered here.'
    ),
    deploy: createDecision(
      'deploy',
      false,
      'deploy-not-exposed',
      'Deployment orchestration is handled by the framework release pipeline.'
    ),
    activate: createDecision(
      'activate',
      enableEnabled,
      enableEnabled ? null : 'use-enable',
      enableEnabled
        ? 'Activation is currently represented by the enable action.'
        : 'Activation is not available from the current lifecycle state.'
    ),
    enable: createDecision(
      'enable',
      enableEnabled,
      enableEnabled
        ? null
        : blockedForAuth
          ? 'unauthorized'
          : blockedForActiveLease
            ? 'operation-in-progress'
            : blockedForRecovery
              ? 'recovery-required'
              : !input.installed
                ? 'not-installed'
                : 'already-enabled',
      enableEnabled
        ? 'Enable can proceed safely.'
        : 'Enable is blocked by current lifecycle or recovery constraints.'
    ),
    disable: createDecision(
      'disable',
      disableEnabled,
      disableEnabled
        ? null
        : blockedForAuth
          ? 'unauthorized'
          : blockedForActiveLease
            ? 'operation-in-progress'
            : blockedForRecovery
              ? 'recovery-required'
              : !input.installed
                ? 'not-installed'
                : 'already-disabled',
      disableEnabled
        ? 'Disable can proceed safely.'
        : 'Disable is blocked by current lifecycle or recovery constraints.',
      {
        destructive: true,
      }
    ),
    update: createDecision(
      'update',
      false,
      'update-not-yet-supported',
      'Update flow is not yet exposed for marketplace-admin runtime operations.'
    ),
    rollback: createDecision(
      'rollback',
      rollbackEnabled,
      rollbackEnabled ? null : input.rollbackReason,
      rollbackEnabled
        ? 'Rollback is available for the current state.'
        : 'Rollback is blocked by migration, artifact, or recovery constraints.',
      {
        destructive: true,
        recoveryClassification: rollbackEnabled ? 'rollback-eligible' : 'recovery-required',
      }
    ),
    recover: createDecision(
      'recover',
      recoverEnabled,
      recoverEnabled ? null : 'recovery-not-required',
      recoverEnabled
        ? 'Recovery action is required before normal lifecycle mutations continue.'
        : 'Recovery action is not required for this plugin.',
      {
        recoveryClassification:
          input.reconciliationAction === 'manual-intervention-required'
            ? 'manual-intervention-required'
            : 'recovery-required',
      }
    ),
    retry: createDecision(
      'retry',
      retryEnabled,
      retryEnabled ? null : 'retry-not-safe',
      retryEnabled
        ? 'Retry can proceed under reconciler guidance.'
        : 'Retry is unsafe until reconciliation marks this operation retryable.',
      {
        recoveryClassification: retryEnabled ? 'retryable' : 'none',
      }
    ),
    'take-over-expired-operation': createDecision(
      'take-over-expired-operation',
      takeoverEnabled,
      takeoverEnabled ? null : 'takeover-not-available',
      takeoverEnabled
        ? 'Expired operation lease can be taken over safely.'
        : 'Operation takeover is unavailable until lease expiry and reconciler approval.',
      {
        recoveryClassification: takeoverEnabled ? 'retryable' : 'none',
      }
    ),
    'acknowledge-manual-intervention': createDecision(
      'acknowledge-manual-intervention',
      input.reconciliationAction === 'manual-intervention-required',
      input.reconciliationAction === 'manual-intervention-required'
        ? null
        : 'manual-intervention-not-required',
      input.reconciliationAction === 'manual-intervention-required'
        ? 'Manual intervention is required and must be acknowledged by an operator.'
        : 'Manual intervention acknowledgement is not currently required.',
      {
        recoveryClassification: 'manual-intervention-required',
      }
    ),
  };

  return {
    byId: decisions,
    available: Object.values(decisions).filter((action) => action.enabled),
    blocked: Object.values(decisions).filter((action) => !action.enabled),
  };
}
