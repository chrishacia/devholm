export interface PluginAdminSurface {
  href: `/admin/${string}`;
  label?: string;
}

export type PluginLifecycleState = 'bundled' | 'installed' | 'disabled' | 'uninstalled';

export type PluginOperationStatus =
  | 'idle'
  | 'pending_install'
  | 'pending_upgrade'
  | 'pending_disable'
  | 'pending_uninstall'
  | 'pending_purge'
  | 'error';

export type PluginLifecycleEvent = 'install' | 'upgrade' | 'disable' | 'uninstall' | 'purge';

export interface PluginLifecycleContext {
  pluginId: string;
  fromVersion?: string;
  toVersion?: string;
  initiatedBy?: string;
  dryRun?: boolean;
}

export type PluginLifecycleHook = (context: PluginLifecycleContext) => Promise<void> | void;

export interface PluginMigration {
  id: string;
  file: string;
  checksum?: string;
}

export interface PluginSeed {
  id: string;
  file: string;
  checksum?: string;
}

export interface PluginSettingsDefinition {
  key: string;
  type: 'string' | 'number' | 'boolean' | 'json';
  defaultValue?: string | number | boolean | Record<string, unknown> | null;
  description?: string;
  category?: string;
}

export interface DevholmBundledPlugin {
  manifest: DevholmPluginManifest;
  settings?: readonly PluginSettingsDefinition[];
  apiExtensions?: readonly import('@core/types/extensions.server').ApiExtension[];
  publicRouteExtensions?: readonly import('@core/types/extensions.server').PublicRouteExtension[];
  adminPageExtensions?: readonly import('@core/types/extensions.server').AdminPageExtension[];
}

export interface DevholmPluginManifest {
  id: string;
  name: string;
  description?: string;
  version: string;
  devholmVersion?: string;

  enablementSettingKey: string;

  dependencies?: {
    plugins?: Record<string, string>;
    packages?: Record<string, string>;
  };

  /** Package source descriptor for retrieval and updates */
  packageSource?: PluginPackageSource;

  /** Release channel metadata */
  releaseChannel?: 'stable' | 'beta' | 'alpha';

  /** Migration metadata for reversibility and risk assessment */
  migrations?: readonly (PluginMigration | PluginMigrationMetadata)[];
  seeds?: readonly PluginSeed[];
  settings?: readonly PluginSettingsDefinition[];
  publicRouteExtensionIds?: readonly string[];
  adminPageHrefs?: readonly `/admin/${string}`[];

  lifecycle?: {
    afterInstall?: PluginLifecycleHook;
    afterUpgrade?: PluginLifecycleHook;
    beforeDisable?: PluginLifecycleHook;
    beforeUninstall?: PluginLifecycleHook;
    purge?: PluginLifecycleHook;
  };
}

export interface DevHolmPluginDefinition {
  id: string;
  name: string;
  description?: string;
  source: 'core' | 'user';
  enabledByDefault?: boolean;
  adminSurface?: PluginAdminSurface;
  capabilities?: {
    admin?: boolean;
    api?: boolean;
    publicRoutes?: boolean;
    navigation?: boolean;
    sitemap?: boolean;
    embeds?: boolean;
  };
}

export interface PluginRuntimeState {
  id: string;
  bundled: boolean;
  installed: boolean;
  isEnabled: boolean;
  lifecycleState: PluginLifecycleState;
  operationStatus: PluginOperationStatus;
  installedVersion: string | null;
  bundledVersion: string | null;
  updatedAt: Date | null;
}

export interface PluginAdminRecord extends PluginRuntimeState {
  name: string;
  description: string | null;
  source: 'core' | 'user';
  enabledByDefault: boolean;
  adminSurface: PluginAdminSurface | null;
  capabilities: NonNullable<DevHolmPluginDefinition['capabilities']>;
}

/**
 * Package source descriptor - identifies where a plugin package comes from
 * and how to retrieve it
 */
export type PluginPackageSource =
  | { type: 'bundled'; bundleId?: string }
  | { type: 'local'; path: string }
  | { type: 'git'; repo: string; ref: string; path?: string }
  | { type: 'registry'; registryUrl: string; packageName: string }
  | { type: 'marketplace'; publisherId: string; packageId: string };

/**
 * Package integrity and provenance tracking
 */
export interface PluginPackageIntegrity {
  /** SHA256 hash of package contents */
  packageChecksum: string;
  /** Manifest checksum for change detection */
  manifestChecksum: string;
  /** Checksums of each migration file for determinism verification */
  migrationChecksums: Record<string, string>;
  /** Optional: publisher signature for marketplace packages */
  publisherSignature?: string;
}

/**
 * Update policy and pin settings
 */
export type PluginUpdatePolicy = 'manual' | 'stable' | 'beta';

export interface PluginUpdatePin {
  /** Exact version to pin to, e.g., "1.2.3" */
  exactVersion?: string;
  /** Compatible range pin, e.g., "^1.2.3" */
  compatibleRange?: string;
  /** Release channel filter: stable, beta, or alpha */
  channel?: 'stable' | 'beta' | 'alpha';
  /** Update policy: manual, stable-only, or beta */
  policy: PluginUpdatePolicy;
}

/**
 * Migration reversibility and risk metadata
 */
export type MigrationReversibility = 'reversible' | 'irreversible' | 'partial';

export interface PluginMigrationMetadata extends PluginMigration {
  reversibility: MigrationReversibility;
  description?: string;
  requiredDownMigration?: string;
  /** Warnings for irreversible migrations */
  irreversibleWarning?: string;
}

/**
 * Locked plugin package with exact pinned version
 */
export interface PluginPackageLock {
  pluginId: string;
  /** Exact installed version */
  version: string;
  /** DevHolm version it was pinned against */
  devholmVersion: string;
  /** Where the package comes from */
  source: PluginPackageSource;
  /** Integrity information */
  integrity: PluginPackageIntegrity;
  /** When this lock was created/updated */
  lockedAt: string;
  /** User or system that initiated the lock */
  lockedBy?: string;
}

/**
 * Plugin lockfile - master record of all installed/pinned plugins
 */
export interface PluginLockfile {
  /** Lockfile format version for compatibility */
  lockfileVersion: 1;
  /** DevHolm version this lockfile was created for */
  devholmVersion: string;
  /** All locked plugin packages */
  packages: Record<string, PluginPackageLock>;
  /** When the lockfile was last updated */
  updatedAt: string;
  /** Hash of lockfile contents for change detection */
  lockfileChecksum: string;
}

/**
 * Update plan preflight analysis
 */
export interface PluginUpdatePreflight {
  pluginId: string;
  currentVersion: string;
  proposedVersion: string;
  /** Whether update is compatible with current DevHolm version */
  isCompatibleWithCurrentDevholm: boolean;
  /** Whether update is compatible with pinned dependencies */
  isCompatibleWithDependencies: boolean;
  /** Migrations that would be applied */
  migrationsToApply: PluginMigrationMetadata[];
  /** Migrations that would be reverted if rolling back */
  migrationsToRevert: PluginMigrationMetadata[];
  /** Changes in plugin capabilities */
  capabilityChanges?: {
    added: string[];
    removed: string[];
  };
  /** Changes in dependencies */
  dependencyChanges?: {
    added: Record<string, string>;
    removed: Record<string, string>;
    upgraded: Record<string, { from: string; to: string }>;
  };
  /** Warnings for risky operations */
  warnings: string[];
  /** Irreversible changes in this update */
  irreversibleChanges: string[];
  /** Estimated time to apply update in ms */
  estimatedDurationMs?: number;
}

/**
 * Safe staged activation state
 */
export type PluginActivationStage =
  | 'pre-validation'
  | 'pre-migration'
  | 'post-migration'
  | 'activated';

export interface PluginActivationCheckpoint {
  stage: PluginActivationStage;
  version: string;
  packageChecksum: string;
  timestampMs: number;
  rollbackPath?: {
    previousVersion: string;
    previousPackageChecksum: string;
  };
}

/**
 * Plugin update history for rollback capability
 */
export interface PluginUpdateRecord {
  pluginId: string;
  /** Version before update */
  fromVersion: string;
  /** Version after update */
  toVersion: string;
  status: 'success' | 'failed' | 'rolled_back';
  appliedAt: string;
  appliedBy?: string;
  rollbackAvailableUntil?: string;
  lastCheckpoint?: PluginActivationCheckpoint;
}
