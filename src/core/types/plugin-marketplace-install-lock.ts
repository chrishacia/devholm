export interface MarketplaceInstallLeaseMetadata {
  schemaVersion: 1;
  pluginId: string;
  operationId: string;
  ownerToken: string;
  pid: number;
  hostIdentity: string;
  createdAt: string;
  heartbeatAt: string;
  leaseExpiresAt: string;
}

export interface MarketplaceInstallLeaseAcquireOptions {
  lockRoot: string;
  pluginId: string;
  operationId: string;
  ownerToken?: string;
  hostIdentity?: string;
  leaseMs?: number;
  waitTimeoutMs?: number;
  pollIntervalMs?: number;
  heartbeatMs?: number;
}

export interface MarketplaceInstallLeaseHandle {
  lockDirectory: string;
  metadataPath: string;
  metadata: MarketplaceInstallLeaseMetadata;
  renew: () => Promise<void>;
  release: () => Promise<void>;
  startHeartbeat: () => void;
  stopHeartbeat: () => void;
}
