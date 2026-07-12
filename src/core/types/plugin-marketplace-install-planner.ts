import type {
  MarketplaceCatalogEntry,
  MarketplaceInstallSourceDescriptor,
  MarketplaceTrustedMarketplaceKeyRecord,
} from '@core/types/plugin-marketplace-contract';

export type MarketplaceInstallPlannerStateId =
  | 'validate_descriptor'
  | 'validate_catalog_entry'
  | 'verify_signature_trust'
  | 'consistency_checks'
  | 'approval_gate'
  | 'ready_for_staging';

export type MarketplaceInstallPlannerStateStatus = 'passed' | 'blocked' | 'pending_approval';

export interface MarketplaceInstallPlannerStateResult {
  state: MarketplaceInstallPlannerStateId;
  status: MarketplaceInstallPlannerStateStatus;
  notes: string[];
}

export interface MarketplaceInstallPlannerBlocker {
  code:
    | 'descriptor-invalid'
    | 'catalog-entry-invalid'
    | 'plugin-id-mismatch'
    | 'version-mismatch'
    | 'plugin-subdirectory-mismatch'
    | 'manifest-path-mismatch'
    | 'repo-url-mismatch'
    | 'ref-mismatch'
    | 'readiness-not-production-eligible'
    | 'runtime-install-unsupported'
    | 'artifact-not-available'
    | 'artifact-missing-url'
    | 'artifact-missing-sha256'
    | 'artifact-not-immutable'
    | 'third-party-production-blocked'
    | 'artifact-signature-untrusted'
    | 'capability-escalation-blocked';
  message: string;
}

export interface MarketplaceInstallPlannerApprovalRequirement {
  code: 'manual-approval-required' | 'capability-escalation-review-required';
  message: string;
  requiredApprovers: string[];
}

export type MarketplaceInstallPlannerOutcome = 'blocked' | 'approval-required' | 'ready';

export interface MarketplaceInstallPlannerInput {
  descriptor: MarketplaceInstallSourceDescriptor;
  catalogEntry: MarketplaceCatalogEntry;
  trustedKeys?: MarketplaceTrustedMarketplaceKeyRecord[];
  verificationTimestamp?: string;
  capabilityContract?: {
    approvals?: string[];
    blockers?: string[];
  };
}

export interface MarketplaceInstallPlannerResult {
  outcome: MarketplaceInstallPlannerOutcome;
  states: MarketplaceInstallPlannerStateResult[];
  blockers: MarketplaceInstallPlannerBlocker[];
  approvals: MarketplaceInstallPlannerApprovalRequirement[];
  summary: string;
}
