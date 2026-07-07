/**
 * Plugin Package Versioning and Update Management types
 * SDK contracts for plugin version management, pinning, and safe updates
 */

export type PluginPackageSourceType = 'bundled' | 'local' | 'git' | 'registry' | 'marketplace';

export type PluginPackageSource =
  | { type: 'bundled'; bundleId?: string }
  | { type: 'local'; path: string }
  | { type: 'git'; repo: string; ref: string; path?: string }
  | { type: 'registry'; registryUrl: string; packageName: string }
  | { type: 'marketplace'; publisherId: string; packageId: string };

export interface PluginPackageIntegrity {
  packageChecksum: string;
  manifestChecksum: string;
  migrationChecksums: Record<string, string>;
  publisherSignature?: string;
}

export type PluginUpdatePolicy = 'manual' | 'stable' | 'beta';

export interface PluginUpdatePin {
  exactVersion?: string;
  compatibleRange?: string;
  channel?: 'stable' | 'beta' | 'alpha';
  policy: PluginUpdatePolicy;
}

export type MigrationReversibility = 'reversible' | 'irreversible' | 'partial';

export interface PluginMigrationMetadata {
  id: string;
  file: string;
  checksum?: string;
  reversibility: MigrationReversibility;
  description?: string;
  requiredDownMigration?: string;
  irreversibleWarning?: string;
}

export interface PluginPackageLock {
  pluginId: string;
  version: string;
  devholmVersion: string;
  source: PluginPackageSource;
  integrity: PluginPackageIntegrity;
  lockedAt: string;
  lockedBy?: string;
}

export interface PluginLockfile {
  lockfileVersion: 1;
  devholmVersion: string;
  packages: Record<string, PluginPackageLock>;
  updatedAt: string;
  lockfileChecksum: string;
}

export interface PluginUpdatePreflight {
  pluginId: string;
  currentVersion: string;
  proposedVersion: string;
  isCompatibleWithCurrentDevholm: boolean;
  isCompatibleWithDependencies: boolean;
  migrationsToApply: PluginMigrationMetadata[];
  migrationsToRevert: PluginMigrationMetadata[];
  capabilityChanges?: {
    added: string[];
    removed: string[];
  };
  dependencyChanges?: {
    added: Record<string, string>;
    removed: Record<string, string>;
    upgraded: Record<string, { from: string; to: string }>;
  };
  warnings: string[];
  irreversibleChanges: string[];
  estimatedDurationMs?: number;
}

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

export interface PluginUpdateRecord {
  pluginId: string;
  fromVersion: string;
  toVersion: string;
  status: 'success' | 'failed' | 'rolled_back';
  appliedAt: string;
  appliedBy?: string;
  rollbackAvailableUntil?: string;
  lastCheckpoint?: PluginActivationCheckpoint;
}
