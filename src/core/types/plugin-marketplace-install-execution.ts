import type {
  MarketplaceCatalogEntry,
  MarketplaceInstallSourceDescriptor,
} from '@core/types/plugin-marketplace-contract';
import type { MarketplaceArtifactTrustVerification } from '@core/types/plugin-marketplace-contract';
import type {
  MarketplaceArchiveInspection,
  MarketplaceStagedPackageValidationSummary,
} from '@core/types/plugin-marketplace-staging';
import type { MarketplaceArtifactAcquisitionResult } from '@core/types/plugin-marketplace-acquisition';
import type { MarketplaceCapabilityContractEvaluation } from '@core/types/plugin-marketplace-capability-contract';
import type { MarketplaceInstallOperationState } from '@core/types/plugin-marketplace-install-operation';

export interface MarketplaceFirstPartyInstallExecutionInput {
  descriptor: MarketplaceInstallSourceDescriptor;
  catalogEntry: MarketplaceCatalogEntry;
  artifactPath?: string;
  acquisitionMode?: 'local-path' | 'remote-first-party';
  offlineOnly?: boolean;
  explicitAdminApproval: boolean;
  initiatedBy?: string;
  generatedPluginsRoot?: string;
}

export interface MarketplaceFirstPartyInstallExecutionResult {
  pluginId: string;
  version: string;
  sha256: string;
  plannerSummary: string;
  inspection: MarketplaceArchiveInspection;
  validation: MarketplaceStagedPackageValidationSummary;
  capabilityContract: MarketplaceCapabilityContractEvaluation;
  acquisition?: MarketplaceArtifactAcquisitionResult;
  operation: MarketplaceInstallOperationState;
  installRoot: string;
  activePath: string;
  versionPath: string;
  previousVersion: string | null;
  rollbackPath: string | null;
  lifecycleExecution: 'skipped';
  migrationExecution: 'skipped';
  installedAt: string;
  trust?: MarketplaceArtifactTrustVerification;
}
