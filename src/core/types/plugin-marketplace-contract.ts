import type { PluginPackageSource, PluginPackageIntegrity } from '@core/types/plugins';

export interface MarketplacePackagePermissionSummary {
  permissionKeys: string[];
  capabilities: string[];
  scopes: string[];
}

export interface MarketplacePackageLifecycleSummary {
  hasAfterInstall: boolean;
  hasAfterUpgrade: boolean;
  hasBeforeDisable: boolean;
  hasBeforeUninstall: boolean;
  hasPurge: boolean;
  disablePolicy?: 'non-destructive';
  uninstallPolicy?: 'non-destructive';
  dataRetention?: string;
}

export interface MarketplacePackageMigrationPolicySummary {
  migrationCount: number;
  policy: 'none' | 'declared' | 'baseline-adoption';
  destructiveDataWipe: 'blocked' | 'allowed-with-confirmation' | 'unknown';
}

export interface MarketplacePackagePublicRouteSummary {
  extensionIds: string[];
  claimsReservedRoutes: boolean;
}

export interface MarketplacePackageAdminApiSummary {
  adminPageHrefs: string[];
  apiPaths: string[];
}

export interface MarketplacePackageSettingsSummary {
  settingKeys: string[];
  count: number;
}

export interface MarketplacePackageDocumentationMetadata {
  readmePath: string;
  indexPagePath: string;
  manifestJsonPath: string;
  docsPath?: string;
  assetsPath?: string;
  fixturesPath?: string;
}

export interface MarketplacePackageSourceDescriptor {
  sourceType: PluginPackageSource['type'];
  repositoryUrl: string;
  ref: string;
}

export interface MarketplacePluginPackageMetadata {
  pluginId: string;
  displayName: string;
  version: string;
  pluginSubdirectory: string;
  manifestPath: string;
  source: MarketplacePackageSourceDescriptor;
  integrity?: Partial<PluginPackageIntegrity>;
  permissions: MarketplacePackagePermissionSummary;
  lifecycle: MarketplacePackageLifecycleSummary;
  migrationPolicy: MarketplacePackageMigrationPolicySummary;
  publicRoutes: MarketplacePackagePublicRouteSummary;
  adminAndApi: MarketplacePackageAdminApiSummary;
  settings: MarketplacePackageSettingsSummary;
  documentation: MarketplacePackageDocumentationMetadata;
}

export type MarketplaceCatalogInstallReadiness =
  | 'scaffold-only'
  | 'catalog-contract-ready'
  | 'production-eligible';

export type MarketplaceArtifactFormat = 'tar.gz';

export type MarketplaceArtifactReadiness = 'planned' | 'available';

export interface MarketplaceArtifactSignaturePlaceholder {
  status: 'not-provided' | 'provided';
  algorithm?: 'Ed25519';
  keyId?: string;
  signedPayloadVersion?: 'v1';
  signedAt?: string;
  signature?: string;
  transparencyLogRef?: string;
  certificateChain?: readonly string[];
}

export interface MarketplaceArtifactReference {
  format: MarketplaceArtifactFormat;
  readiness: MarketplaceArtifactReadiness;
  immutable: boolean;
  immutableRefType?: 'release-url' | 'content-addressed-url';
  artifactUrl?: string;
  sha256?: string;
  compressedSizeBytes?: number;
  maxUncompressedSizeBytes?: number;
  signature?: MarketplaceArtifactSignaturePlaceholder;
}

export interface MarketplaceArtifactTrustVerification {
  algorithm: 'Ed25519';
  keyId: string;
  signedPayloadVersion: 'v1';
  signedPayloadSha256: string;
  verificationTimestamp: string;
  trustDecision: 'trusted' | 'blocked' | 'untrusted';
  verificationStatus:
    | 'verified'
    | 'missing-signature'
    | 'invalid-signature'
    | 'unknown-key'
    | 'revoked-key'
    | 'retired-key'
    | 'pending-key'
    | 'algorithm-mismatch'
    | 'payload-version-mismatch'
    | 'publisher-mismatch';
  publisherId: string;
  revocationState: 'none' | 'pending' | 'retired' | 'revoked';
  notes: readonly string[];
}

export type MarketplacePublisherClass = 'first-party' | 'private' | 'third-party' | 'unknown';

export type MarketplacePublisherStatus =
  | 'active'
  | 'suspended'
  | 'revoked'
  | 'expired'
  | 'misconfigured';

export type MarketplacePublisherKeyStatus = 'active' | 'rotating' | 'retired' | 'revoked';

export type MarketplaceTrustDecisionReasonCode =
  | 'publisher-unknown'
  | 'publisher-revoked'
  | 'publisher-suspended'
  | 'key-unknown'
  | 'key-revoked'
  | 'key-publisher-mismatch'
  | 'enrollment-missing'
  | 'enrollment-expired'
  | 'scope-denied'
  | 'plugin-denied'
  | 'site-denied'
  | 'channel-denied'
  | 'policy-version-unsupported'
  | 'policy-malformed'
  | 'allowed';

export interface MarketplacePublisherEnrollmentRecord {
  policyVersion: 1;
  enrollmentId: string;
  publisherId: string;
  publisherClass: MarketplacePublisherClass;
  publisherStatus: MarketplacePublisherStatus;
  signingKeyId: string;
  trustRootId: string;
  keyStatus: MarketplacePublisherKeyStatus;
  enrollmentScope: 'global' | 'site' | 'plugin' | 'namespace' | 'composite';
  allowedPluginIds?: readonly string[];
  allowedPluginNamespaces?: readonly string[];
  allowedSiteScopes?: readonly string[];
  allowedArtifactChannels?: readonly string[];
  allowedOperations?: readonly string[];
  effectiveAt: string;
  expiresAt?: string;
  revokedAt?: string;
  revocationReason?: string;
  policySource: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface MarketplacePublisherTrustPolicyDocument {
  policyVersion: 1;
  policySource: string;
  enrollments: readonly MarketplacePublisherEnrollmentRecord[];
  updatedAt: string;
}

export interface MarketplacePublisherTrustDecisionInput {
  publisherId: string;
  publisherClass: MarketplacePublisherClass;
  signingKeyId: string;
  pluginId: string;
  artifactChannel?: string;
  siteScope?: string;
  operation: 'install' | 'update' | 'rollback' | 'enable' | 'lifecycle' | 'migration';
  policyDocument: MarketplacePublisherTrustPolicyDocument | null;
  evaluatedAt?: string;
}

export interface MarketplacePublisherTrustDecision {
  outcome: 'allow' | 'deny';
  reasonCode: MarketplaceTrustDecisionReasonCode;
  matchedEnrollmentId: string | null;
  matchedTrustRootId: string | null;
  evaluatedScope: {
    pluginId: string;
    artifactChannel: string;
    siteScope: string;
    operation: string;
  };
  revocationState: 'none' | 'revoked' | 'expired' | 'suspended';
  metadata: {
    policyVersion: number | null;
    policySource: string | null;
    evaluatedAt: string;
  };
}

export interface MarketplaceTrustedMarketplaceKeyRecord {
  keyId: string;
  algorithm: 'Ed25519';
  publicKey: string;
  status: 'pending' | 'active' | 'retired' | 'revoked';
  activationAt?: string;
  retirementAt?: string;
  revocationAt?: string;
  revocationReason?: string;
  permittedPublisherIds: readonly string[];
  intendedUsage: 'marketplace-artifact-signing';
  metadataVersion: 1;
}

export interface MarketplacePublisherMetadata {
  publisherId: string;
  classification: MarketplacePublisherClass;
}

export interface MarketplaceCatalogEntry {
  pluginId: string;
  displayName: string;
  version: string;
  installReadiness: MarketplaceCatalogInstallReadiness;
  runtimeInstallSupported: boolean;
  bundledFallbackRequired: boolean;
  pluginSubdirectory: string;
  manifestPath: string;
  readmePath: string;
  landingPagePath: string;
  source: MarketplacePackageSourceDescriptor;
  integrity?: Partial<PluginPackageIntegrity>;
  publisher: MarketplacePublisherMetadata;
  artifact: MarketplaceArtifactReference;
}

export interface MarketplaceDirectoryContract {
  rootFiles: readonly string[];
  pluginsRootDir: string;
  requiredPluginFiles: readonly string[];
  optionalPluginDirectories: readonly string[];
}

export interface MarketplaceDirectorySnapshot {
  rootEntries: readonly string[];
  plugins: Record<string, readonly string[]>;
}

export type MarketplaceDescriptorSourceType = Extract<PluginPackageSource['type'], 'marketplace'>;

export interface MarketplaceInstallSourceTrustPolicy {
  policy?: 'allowlisted-only' | 'manual-approval' | 'unverified';
  allowPrerelease?: boolean;
  requiredApprovers?: string[];
  notes?: string;
}

export interface MarketplaceInstallSourceDescriptor {
  sourceType: MarketplaceDescriptorSourceType;
  repoUrl: string;
  ref: string;
  pluginSubdirectory: string;
  manifestPath: string;
  expectedPluginId: string;
  expectedVersion: string;
  integrity?: Partial<PluginPackageIntegrity>;
  trustPolicy?: MarketplaceInstallSourceTrustPolicy;
}

export interface MarketplaceInstallSourceDescriptorInput {
  sourceType?: PluginPackageSource['type'];
  repoUrl?: string;
  ref?: string;
  pluginSubdirectory?: string;
  manifestPath?: string;
  expectedPluginId?: string;
  expectedVersion?: string;
  integrity?: Partial<PluginPackageIntegrity>;
  trustPolicy?: MarketplaceInstallSourceTrustPolicy;
}

export interface MarketplaceInstallSourceDescriptorParseResult {
  descriptor: MarketplaceInstallSourceDescriptor | null;
  errors: string[];
}
