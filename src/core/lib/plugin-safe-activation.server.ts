import { getDb } from '@/db';
import { getPluginLock, lockPluginVersion, recordPluginUpdate } from '@core/db/plugin-versioning';
import type {
  PluginActivationCheckpoint,
  PluginPackageIntegrity,
  PluginPackageSource,
  PluginPackageLock,
} from '@core/types/plugins';

/**
 * Safe staged activation engine for plugin updates with automatic rollback on failure
 */
export class PluginSafeActivationEngine {
  private checkpoints: Map<string, PluginActivationCheckpoint> = new Map();
  private previousLocks: Map<string, PluginPackageLock | null> = new Map();

  /**
   * Start a safe activation flow for a plugin update
   */
  async startActivation(
    pluginId: string,
    targetVersion: string,
    targetChecksum: string
  ): Promise<PluginActivationCheckpoint> {
    // Get current lock before making changes
    const currentLock = await getPluginLock(pluginId);
    this.previousLocks.set(pluginId, currentLock);

    const checkpoint: PluginActivationCheckpoint = {
      stage: 'pre-validation',
      version: targetVersion,
      packageChecksum: targetChecksum,
      timestampMs: Date.now(),
      rollbackPath: currentLock
        ? {
            previousVersion: currentLock.version,
            previousPackageChecksum: currentLock.integrity.packageChecksum,
          }
        : undefined,
    };

    this.checkpoints.set(pluginId, checkpoint);
    return checkpoint;
  }

  /**
   * Advance to pre-migration stage (after validation, before migrations)
   */
  advanceToPreMigration(pluginId: string): void {
    const checkpoint = this.checkpoints.get(pluginId);
    if (!checkpoint) {
      throw new Error(`No activation checkpoint for plugin ${pluginId}`);
    }

    checkpoint.stage = 'pre-migration';
    checkpoint.timestampMs = Date.now();
  }

  /**
   * Advance to post-migration stage (after migrations complete)
   */
  advanceToPostMigration(pluginId: string): void {
    const checkpoint = this.checkpoints.get(pluginId);
    if (!checkpoint) {
      throw new Error(`No activation checkpoint for plugin ${pluginId}`);
    }

    checkpoint.stage = 'post-migration';
    checkpoint.timestampMs = Date.now();
  }

  /**
   * Finalize activation (mark as activated)
   */
  async finalizeActivation(
    pluginId: string,
    source: PluginPackageSource,
    integrity: PluginPackageIntegrity,
    devholmVersion: string,
    lockedBy?: string
  ): Promise<void> {
    const checkpoint = this.checkpoints.get(pluginId);
    if (!checkpoint) {
      throw new Error(`No activation checkpoint for plugin ${pluginId}`);
    }

    // Lock the new version in the lockfile
    await lockPluginVersion(
      pluginId,
      checkpoint.version,
      devholmVersion,
      source,
      integrity,
      lockedBy
    );

    // Record successful update
    const previousLock = this.previousLocks.get(pluginId);
    if (previousLock && checkpoint) {
      await recordPluginUpdate(
        pluginId,
        previousLock.version,
        checkpoint.version,
        'success',
        lockedBy
      );
    }
  }

  /**
   * Rollback to previous version on failure
   */
  async rollbackActivation(pluginId: string, reason: string, initiatedBy?: string): Promise<void> {
    const checkpoint = this.checkpoints.get(pluginId);
    if (!checkpoint) {
      throw new Error(`No activation checkpoint for plugin ${pluginId}`);
    }

    const previousLock = this.previousLocks.get(pluginId);
    if (!previousLock) {
      throw new Error(
        `Cannot rollback plugin ${pluginId}: no previous lock available. Manual intervention required.`
      );
    }

    // Restore previous lock
    await lockPluginVersion(
      pluginId,
      previousLock.version,
      previousLock.devholmVersion,
      previousLock.source,
      previousLock.integrity,
      initiatedBy
    );

    // Record failed update with rollback
    await recordPluginUpdate(
      pluginId,
      checkpoint.version,
      previousLock.version,
      'rolled_back',
      initiatedBy
    );

    this.checkpoints.delete(pluginId);
    this.previousLocks.delete(pluginId);
  }

  /**
   * Get current activation state
   */
  getCheckpoint(pluginId: string): PluginActivationCheckpoint | undefined {
    return this.checkpoints.get(pluginId);
  }

  /**
   * Clear activation state (for cleanup)
   */
  clearCheckpoint(pluginId: string): void {
    this.checkpoints.delete(pluginId);
    this.previousLocks.delete(pluginId);
  }
}

/**
 * Perform a safe plugin update with automatic rollback on error
 */
export async function performSafePluginUpdate(
  pluginId: string,
  fromVersion: string,
  toVersion: string,
  targetPackageSource: PluginPackageSource,
  targetIntegrity: PluginPackageIntegrity,
  devholmVersion: string,
  updateContext?: Record<string, unknown>,
  onMigrationsStart?: () => Promise<void>,
  onMigrationsComplete?: () => Promise<void>,
  initiatedBy?: string
): Promise<{ success: boolean; checkpoint?: PluginActivationCheckpoint; error?: string }> {
  const engine = new PluginSafeActivationEngine();

  try {
    // Stage 1: Validation
    const checkpoint = await engine.startActivation(
      pluginId,
      toVersion,
      targetIntegrity.packageChecksum
    );

    // Stage 2: Pre-migration
    engine.advanceToPreMigration(pluginId);

    // Stage 3: Execute migrations
    if (onMigrationsStart) {
      await onMigrationsStart();
    }

    engine.advanceToPostMigration(pluginId);

    if (onMigrationsComplete) {
      await onMigrationsComplete();
    }

    // Stage 4: Finalize activation
    await engine.finalizeActivation(
      pluginId,
      targetPackageSource,
      targetIntegrity,
      devholmVersion,
      initiatedBy
    );

    engine.clearCheckpoint(pluginId);

    return {
      success: true,
      checkpoint: {
        stage: 'activated',
        version: toVersion,
        packageChecksum: targetIntegrity.packageChecksum,
        timestampMs: Date.now(),
      },
    };
  } catch (error) {
    // Automatic rollback on error
    try {
      await engine.rollbackActivation(
        pluginId,
        error instanceof Error ? error.message : String(error),
        initiatedBy
      );

      return {
        success: false,
        checkpoint: engine.getCheckpoint(pluginId),
        error: `Update failed and was rolled back: ${error instanceof Error ? error.message : String(error)}`,
      };
    } catch (rollbackError) {
      // Critical: rollback itself failed
      return {
        success: false,
        checkpoint: engine.getCheckpoint(pluginId),
        error: `Update failed with rollback error: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}. Manual intervention required.`,
      };
    }
  }
}
