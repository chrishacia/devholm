export interface MarketplaceArtifactStagingLimits {
  maxEntries: number;
  maxUncompressedBytes: number;
  maxSingleFileBytes: number;
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

export interface MarketplaceArchiveInspection {
  entries: MarketplaceArchiveEntrySummary[];
  totalEntries: number;
  totalUncompressedBytes: number;
}

export interface MarketplaceArtifactExtractionResult {
  stagingDirectory: string;
  extractedFiles: string[];
  extractedDirectories: string[];
  totalUncompressedBytes: number;
  totalEntries: number;
}
