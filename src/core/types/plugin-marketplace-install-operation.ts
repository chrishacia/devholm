export type MarketplaceInstallOperationStatus =
  | 'in_progress'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'interrupted';

export type MarketplaceInstallOperationStage =
  | 'initialize'
  | 'acquire_artifact'
  | 'verify_artifact'
  | 'stage_and_validate'
  | 'promote_active'
  | 'write_metadata'
  | 'complete';

export interface MarketplaceInstallCancellationState {
  requested: boolean;
  requestedAt?: string;
  requestedBy?: string;
  policy: 'best-effort-before-promotion';
}

export interface MarketplaceInstallOperationState {
  operationId: string;
  pluginId: string;
  targetVersion: string;
  targetSha256: string;
  status: MarketplaceInstallOperationStatus;
  stage: MarketplaceInstallOperationStage;
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
  initiatedBy?: string;
  acquisitionMode: 'local-path' | 'remote-first-party';
  offlineOnly: boolean;
  cancellation: MarketplaceInstallCancellationState;
  notes: string[];
  error?: string;
  trust?: import('@core/types/plugin-marketplace-contract').MarketplaceArtifactTrustVerification;
}
