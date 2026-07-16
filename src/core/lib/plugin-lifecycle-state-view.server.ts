import {
  summarizeCanonicalPluginState,
  validateCanonicalStateAxes,
} from '@core/lib/plugin-canonical-contract-validation';
import type {
  CanonicalPluginStateAxes,
  CanonicalPluginSummaryState,
} from '@core/types/plugin-canonical-contracts';

type MarketplaceLifecycleOperationState = {
  hasActive: boolean;
  status: string | null;
  stage: string | null;
  recoveryRequired: boolean;
};

type MarketplaceLifecycleSignatureState = {
  decision: 'trusted' | 'blocked' | 'untrusted';
  status: string;
};

type MarketplaceLifecycleTrustPolicyState = {
  outcome: 'allow' | 'deny' | 'unknown';
  reasonCode: string;
};

type MarketplaceLifecycleHistoryState = Array<{
  status: 'success' | 'failed' | 'rolled_back';
  rollbackAvailableUntil?: string;
}>;

export interface CanonicalMarketplaceLifecycleViewInput {
  installed: boolean;
  enabled: boolean;
  operation: MarketplaceLifecycleOperationState;
  signature: MarketplaceLifecycleSignatureState;
  trustPolicy: MarketplaceLifecycleTrustPolicyState;
  sourceResolutionHasErrors: boolean;
  history: MarketplaceLifecycleHistoryState;
  nowMs?: number;
}

export interface CanonicalMarketplaceLifecycleView {
  axes: CanonicalPluginStateAxes;
  summaryState: CanonicalPluginSummaryState;
  validationErrors: readonly string[];
}

function hasRollbackCandidate(history: MarketplaceLifecycleHistoryState, nowMs: number): boolean {
  return history.some((item) => {
    if (item.status !== 'success' || !item.rollbackAvailableUntil) {
      return false;
    }

    const until = Date.parse(item.rollbackAvailableUntil);
    return Number.isFinite(until) && until > nowMs;
  });
}

export function deriveCanonicalMarketplaceLifecycleView(
  input: CanonicalMarketplaceLifecycleViewInput
): CanonicalMarketplaceLifecycleView {
  const nowMs = input.nowMs ?? Date.now();
  const activeOperation = input.operation.hasActive || input.operation.status === 'in_progress';
  const recoveryCandidate = hasRollbackCandidate(input.history, nowMs);

  const resolution: CanonicalPluginStateAxes['resolution'] = input.sourceResolutionHasErrors
    ? 'failed'
    : input.signature.decision === 'blocked' || input.trustPolicy.outcome === 'deny'
      ? 'blocked'
      : input.signature.decision === 'untrusted' || input.trustPolicy.outcome === 'unknown'
        ? 'awaiting-approval'
        : input.installed || activeOperation
          ? 'verified'
          : 'resolved';

  const build: CanonicalPluginStateAxes['build'] = activeOperation
    ? input.operation.stage === 'write_metadata' || input.operation.stage === 'complete'
      ? 'build-included'
      : 'building'
    : input.installed
      ? 'build-included'
      : 'build-pending';

  const deployment: CanonicalPluginStateAxes['deployment'] =
    input.operation.status === 'failed'
      ? 'failed'
      : input.operation.status === 'interrupted'
        ? 'failed'
        : activeOperation
          ? 'deploying'
          : input.installed
            ? 'deployed'
            : 'deploy-pending';

  const runtime: CanonicalPluginStateAxes['runtime'] = input.operation.recoveryRequired
    ? 'failed'
    : input.installed && input.enabled
      ? input.sourceResolutionHasErrors
        ? 'degraded'
        : 'active'
      : 'disabled';

  const trust: CanonicalPluginStateAxes['trust'] =
    input.signature.decision === 'blocked' || input.trustPolicy.outcome === 'deny'
      ? 'blocked'
      : input.signature.decision === 'untrusted' || input.trustPolicy.outcome === 'unknown'
        ? 'awaiting-approval'
        : 'verified';

  const health: CanonicalPluginStateAxes['health'] =
    input.operation.recoveryRequired ||
    input.operation.status === 'failed' ||
    input.operation.status === 'interrupted'
      ? 'failed'
      : input.installed && input.enabled && input.sourceResolutionHasErrors
        ? 'degraded'
        : 'healthy';

  const recovery: CanonicalPluginStateAxes['recovery'] =
    input.operation.recoveryRequired ||
    input.operation.status === 'failed' ||
    input.operation.status === 'interrupted'
      ? 'recovery-required'
      : recoveryCandidate
        ? 'rollback-available'
        : 'none';

  const desired: CanonicalPluginStateAxes['desired'] = activeOperation
    ? 'updating'
    : input.installed && !input.enabled
      ? 'disabled'
      : 'configured';

  const axes: CanonicalPluginStateAxes = {
    desired,
    resolution,
    build,
    deployment,
    runtime,
    trust,
    health,
    recovery,
  };

  return {
    axes,
    summaryState: summarizeCanonicalPluginState(axes),
    validationErrors: validateCanonicalStateAxes(axes),
  };
}
