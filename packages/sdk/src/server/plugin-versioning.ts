/**
 * Plugin Package Versioning and Update Management
 * Public SDK interface for managing plugin versions, pins, and safe updates
 */

// Re-export types from SDK contracts
export type {
  PluginPackageSource,
  PluginPackageIntegrity,
  PluginUpdatePolicy,
  PluginUpdatePin,
  MigrationReversibility,
  PluginMigrationMetadata,
  PluginPackageLock,
  PluginLockfile,
  PluginUpdatePreflight,
  PluginActivationStage,
  PluginActivationCheckpoint,
  PluginUpdateRecord,
} from '../types/plugin-versioning';
