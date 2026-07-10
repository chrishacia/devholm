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
