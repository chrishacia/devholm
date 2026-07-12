export interface MarketplaceArtifactStagingLimits {
  maxEntries: number;
  maxUncompressedBytes: number;
  maxSingleFileBytes: number;
  maxPathLength: number;
  maxCompressionRatio: number;
}

export interface MarketplaceArtifactStagingOptions {
  baseTempDir?: string;
  limits?: Partial<MarketplaceArtifactStagingLimits>;
}

export interface MarketplaceArchiveEntrySummary {
  path: string;
  type: 'file' | 'directory' | 'unsupported';
  size: number;
}

export interface MarketplaceStagedPackageValidationSummary {
  packageRoot: string;
  manifestRelativePath: string;
  pluginId: string;
  version: string;
  capabilitySnapshot: {
    permissionKeys: string[];
    capabilities: string[];
    scopes: string[];
    publicRouteExtensionIds: string[];
    adminPageHrefs: string[];
    apiPaths: string[];
    settingKeys: string[];
  };
  hasLifecycleDeclarations: boolean;
  hasMigrationDeclarations: boolean;
  lifecycleDeclarationKeys: string[];
  migrationCount: number;
}

export interface MarketplaceArchiveInspection {
  entries: MarketplaceArchiveEntrySummary[];
  totalEntries: number;
  totalUncompressedBytes: number;
  compressedBytes: number;
  compressionRatio: number;
}

export interface MarketplaceArtifactExtractionResult {
  stagingDirectory: string;
  extractedFiles: string[];
  extractedDirectories: string[];
  totalUncompressedBytes: number;
  totalEntries: number;
  compressedBytes: number;
  compressionRatio: number;
  validation: MarketplaceStagedPackageValidationSummary;
}
