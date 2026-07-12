export type MarketplaceArtifactAcquisitionSource = 'cache' | 'network';

export interface MarketplaceArtifactAcquisitionPolicy {
  allowedHosts: string[];
  allowPrivateAddressHosts: string[];
  allowedPorts: number[];
  maxCompressedBytes: number;
  requestTimeoutMs: number;
  connectTimeoutMs: number;
  maxRedirects: number;
  maxArtifactAgeMs: number;
  maxCacheBytes: number;
}

export interface MarketplaceArtifactAcquisitionInput {
  artifactUrl: string;
  expectedSha256: string;
  expectedPluginId: string;
  expectedVersion: string;
  cacheRootDir?: string;
  offlineOnly?: boolean;
  policyOverrides?: Partial<MarketplaceArtifactAcquisitionPolicy>;
}

export interface MarketplaceArtifactAcquisitionResult {
  artifactUrl: string;
  approvedHost: string;
  expectedSha256: string;
  verifiedSha256: string;
  expectedVersion: string;
  downloadedBytes: number;
  cacheKey: string;
  cachePath: string;
  source: MarketplaceArtifactAcquisitionSource;
  redirectChain: string[];
  durationMs: number;
  warnings: string[];
  blockers: string[];
  readyForStaging: boolean;
}
