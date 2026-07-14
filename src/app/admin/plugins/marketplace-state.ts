export type MarketplaceUiState =
  | 'available'
  | 'unavailable'
  | 'incompatible'
  | 'untrusted'
  | 'revoked'
  | 'misconfigured'
  | 'not_installed'
  | 'install_pending'
  | 'installing'
  | 'installed_disabled'
  | 'enable_pending'
  | 'enabled'
  | 'disable_pending'
  | 'update_available'
  | 'update_pending'
  | 'updating'
  | 'rollback_available'
  | 'rollback_pending'
  | 'rolling_back'
  | 'blocked'
  | 'failed'
  | 'recovery_required'
  | 'cancelled'
  | 'degraded'
  | 'unsupported';

export interface MarketplaceUiStateDefinition {
  label: string;
  allowedActions: readonly string[];
  disabledActions: readonly string[];
  reason: string;
  remediation: string;
}

export const MARKETPLACE_UI_STATE_DEFINITIONS: Record<
  MarketplaceUiState,
  MarketplaceUiStateDefinition
> = {
  available: {
    label: 'Available',
    allowedActions: ['inspect', 'install'],
    disabledActions: ['update', 'rollback', 'enable', 'disable'],
    reason: 'Plugin is available for inspection and install planning.',
    remediation: 'Review trust, signature, and capability summaries before installing.',
  },
  unavailable: {
    label: 'Unavailable',
    allowedActions: ['inspect'],
    disabledActions: ['install', 'update', 'rollback', 'enable', 'disable'],
    reason: 'Plugin artifact or metadata is currently unavailable.',
    remediation: 'Retry after catalog refresh or verify artifact availability.',
  },
  incompatible: {
    label: 'Incompatible',
    allowedActions: ['inspect'],
    disabledActions: ['install', 'update', 'rollback', 'enable'],
    reason: 'Plugin compatibility constraints are not satisfied for this DevHolm version.',
    remediation: 'Use a compatible plugin release line or upgrade DevHolm.',
  },
  untrusted: {
    label: 'Untrusted',
    allowedActions: ['inspect'],
    disabledActions: ['install', 'update', 'rollback', 'enable'],
    reason: 'Publisher trust contract did not allow this operation.',
    remediation: 'Complete publisher enrollment and scope review before retrying.',
  },
  revoked: {
    label: 'Revoked',
    allowedActions: ['inspect'],
    disabledActions: ['install', 'update', 'rollback', 'enable'],
    reason: 'Signing key or publisher enrollment has been revoked.',
    remediation: 'Do not proceed; rotate to a trusted and active publisher key path.',
  },
  misconfigured: {
    label: 'Misconfigured',
    allowedActions: ['inspect'],
    disabledActions: ['install', 'update', 'rollback', 'enable'],
    reason: 'Marketplace contract or trust policy data is malformed.',
    remediation: 'Fix configuration issues and rerun trust validation.',
  },
  not_installed: {
    label: 'Not Installed',
    allowedActions: ['inspect', 'install'],
    disabledActions: ['update', 'rollback', 'enable', 'disable'],
    reason: 'Plugin has not been installed on this site.',
    remediation: 'Install from a trusted and compatible artifact.',
  },
  install_pending: {
    label: 'Install Pending',
    allowedActions: ['inspect'],
    disabledActions: ['install', 'update', 'rollback', 'enable', 'disable'],
    reason: 'Install is queued and awaiting execution stage advancement.',
    remediation: 'Monitor operation progress and avoid concurrent mutation actions.',
  },
  installing: {
    label: 'Installing',
    allowedActions: ['inspect', 'view_operation'],
    disabledActions: ['install', 'update', 'rollback', 'enable', 'disable'],
    reason: 'Install operation is in progress.',
    remediation: 'Wait for durable completion or cancellation result.',
  },
  installed_disabled: {
    label: 'Installed (Disabled)',
    allowedActions: ['inspect', 'enable'],
    disabledActions: ['install'],
    reason: 'Plugin package is installed but currently disabled.',
    remediation: 'Enable when approvals and policy gates are satisfied.',
  },
  enable_pending: {
    label: 'Enable Pending',
    allowedActions: ['inspect', 'view_operation'],
    disabledActions: ['install', 'update', 'rollback', 'enable', 'disable'],
    reason: 'Enable operation is pending durable completion.',
    remediation: 'Wait for completion and review operation history.',
  },
  enabled: {
    label: 'Enabled',
    allowedActions: ['inspect', 'disable'],
    disabledActions: ['install', 'enable'],
    reason: 'Plugin is installed and enabled.',
    remediation: 'Use update or rollback planning before version changes.',
  },
  disable_pending: {
    label: 'Disable Pending',
    allowedActions: ['inspect', 'view_operation'],
    disabledActions: ['install', 'update', 'rollback', 'enable', 'disable'],
    reason: 'Disable operation is pending durable completion.',
    remediation: 'Wait for completion and validate resulting plugin state.',
  },
  update_available: {
    label: 'Update Available',
    allowedActions: ['inspect', 'update'],
    disabledActions: ['install'],
    reason: 'A newer eligible plugin version is available.',
    remediation: 'Review capability and migration changes before updating.',
  },
  update_pending: {
    label: 'Update Pending',
    allowedActions: ['inspect', 'view_operation'],
    disabledActions: ['install', 'update', 'rollback', 'enable', 'disable'],
    reason: 'Update operation is pending execution.',
    remediation: 'Wait for durable completion and verify post-update state.',
  },
  updating: {
    label: 'Updating',
    allowedActions: ['inspect', 'view_operation'],
    disabledActions: ['install', 'update', 'rollback', 'enable', 'disable'],
    reason: 'Update operation is in progress.',
    remediation: 'Monitor operation and use Recovery Center if it fails.',
  },
  rollback_available: {
    label: 'Rollback Available',
    allowedActions: ['inspect', 'rollback'],
    disabledActions: ['install'],
    reason: 'At least one rollback candidate is currently eligible.',
    remediation: 'Confirm trust, signature, and migration reversibility before rollback.',
  },
  rollback_pending: {
    label: 'Rollback Pending',
    allowedActions: ['inspect', 'view_operation'],
    disabledActions: ['install', 'update', 'rollback', 'enable', 'disable'],
    reason: 'Rollback has been requested and is pending execution.',
    remediation: 'Wait for durable completion and review recovery guidance.',
  },
  rolling_back: {
    label: 'Rolling Back',
    allowedActions: ['inspect', 'view_operation'],
    disabledActions: ['install', 'update', 'rollback', 'enable', 'disable'],
    reason: 'Rollback is currently in progress.',
    remediation: 'Do not issue concurrent operations while rollback is active.',
  },
  blocked: {
    label: 'Blocked',
    allowedActions: ['inspect'],
    disabledActions: ['install', 'update', 'rollback', 'enable', 'disable'],
    reason: 'Operation is blocked by policy, trust, approval, or lock constraints.',
    remediation: 'Address blocker reason code, then refresh state and retry.',
  },
  failed: {
    label: 'Failed',
    allowedActions: ['inspect', 'view_operation'],
    disabledActions: ['install', 'update', 'rollback'],
    reason: 'A durable operation failed.',
    remediation: 'Review failure details and follow guided recovery actions.',
  },
  recovery_required: {
    label: 'Recovery Required',
    allowedActions: ['inspect', 'open_recovery'],
    disabledActions: ['install', 'update', 'rollback', 'enable', 'disable'],
    reason: 'Operation requires explicit recovery handling before continuing.',
    remediation: 'Open Recovery Center and complete the required intervention.',
  },
  cancelled: {
    label: 'Cancelled',
    allowedActions: ['inspect'],
    disabledActions: ['install', 'update', 'rollback', 'enable', 'disable'],
    reason: 'The operation was cancelled before durable completion.',
    remediation: 'Re-run from a valid starting state if still needed.',
  },
  degraded: {
    label: 'Degraded',
    allowedActions: ['inspect', 'view_operation'],
    disabledActions: ['install', 'update', 'rollback'],
    reason: 'Plugin is active with known non-fatal issues.',
    remediation: 'Use operation history and diagnostics to restore full health.',
  },
  unsupported: {
    label: 'Unsupported',
    allowedActions: ['inspect'],
    disabledActions: ['install', 'update', 'rollback', 'enable', 'disable'],
    reason: 'The current state is unknown and treated as unsafe by default.',
    remediation: 'Refresh data and resolve unsupported state before mutating.',
  },
};

export interface MarketplaceUiStateInput {
  installed: boolean;
  enabled: boolean;
  operationStatus?: string | null;
  signatureDecision?: 'trusted' | 'blocked' | 'untrusted';
  trustOutcome?: 'allow' | 'deny' | 'unknown';
  trustReasonCode?: string;
  recoveryRequired?: boolean;
}

export function deriveMarketplaceUiState(input: MarketplaceUiStateInput): MarketplaceUiState {
  if (input.recoveryRequired) {
    return 'recovery_required';
  }

  if (input.operationStatus === 'failed') {
    return 'failed';
  }

  if (input.operationStatus === 'cancelled') {
    return 'cancelled';
  }

  if (input.operationStatus === 'in_progress') {
    return input.installed ? 'updating' : 'installing';
  }

  if (input.signatureDecision === 'blocked') {
    return 'revoked';
  }

  if (input.signatureDecision === 'untrusted') {
    return 'untrusted';
  }

  if (input.trustOutcome === 'deny') {
    if (input.trustReasonCode === 'policy-malformed') {
      return 'misconfigured';
    }

    if (input.trustReasonCode === 'publisher-revoked' || input.trustReasonCode === 'key-revoked') {
      return 'revoked';
    }

    return 'blocked';
  }

  if (!input.installed) {
    return 'not_installed';
  }

  if (!input.enabled) {
    return 'installed_disabled';
  }

  return 'enabled';
}

export function getMarketplaceUiStateDefinition(state: string): MarketplaceUiStateDefinition {
  if (state in MARKETPLACE_UI_STATE_DEFINITIONS) {
    return MARKETPLACE_UI_STATE_DEFINITIONS[state as MarketplaceUiState];
  }

  return MARKETPLACE_UI_STATE_DEFINITIONS.unsupported;
}
