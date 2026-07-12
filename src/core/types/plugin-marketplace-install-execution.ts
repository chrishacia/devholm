import type {
  MarketplaceCatalogEntry,
  MarketplaceInstallSourceDescriptor,
} from '@core/types/plugin-marketplace-contract';
import type {
  MarketplaceArchiveInspection,
  MarketplaceStagedPackageValidationSummary,
} from '@core/types/plugin-marketplace-staging';
import type { MarketplaceArtifactAcquisitionResult } from '@core/types/plugin-marketplace-acquisition';

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
  acquisition?: MarketplaceArtifactAcquisitionResult;
  installRoot: string;
  activePath: string;
  versionPath: string;
  previousVersion: string | null;
  rollbackPath: string | null;
  lifecycleExecution: 'skipped';
  migrationExecution: 'skipped';
  installedAt: string;
}
