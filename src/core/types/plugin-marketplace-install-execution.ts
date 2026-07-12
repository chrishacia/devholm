import type {
  MarketplaceCatalogEntry,
  MarketplaceInstallSourceDescriptor,
} from '@core/types/plugin-marketplace-contract';
import type {
  MarketplaceArchiveInspection,
  MarketplaceStagedPackageValidationSummary,
} from '@core/types/plugin-marketplace-staging';

export interface MarketplaceFirstPartyInstallExecutionInput {
  descriptor: MarketplaceInstallSourceDescriptor;
  catalogEntry: MarketplaceCatalogEntry;
  artifactPath: string;
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
  installRoot: string;
  activePath: string;
  versionPath: string;
  previousVersion: string | null;
  rollbackPath: string | null;
  lifecycleExecution: 'skipped';
  migrationExecution: 'skipped';
  installedAt: string;
}
