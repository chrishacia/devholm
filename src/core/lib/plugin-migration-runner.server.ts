import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { getDb } from '@/db';
import {
  discoverPluginMigrations,
  ensureChecksumsUnchanged,
  ensureUniqueMigrationIds,
  loadPluginMigrationRegistry,
  resolvePluginRegistryPath,
} from '@core/lib/plugin-migration-discovery.server';
import {
  getPluginMigrationLedgerWithDb,
  insertPluginMigrationLedger,
} from '@core/db/plugin-lifecycle';
import {
  markPluginMigrationCheckpointCompleted,
  markPluginMigrationCheckpointFailed,
  readCompletedPluginMigrationCheckpoints,
  startPluginMigrationCheckpoint,
} from '@core/db/plugin-migration-checkpoints';
import { getBundledPluginManifests } from '@core/lib/plugin-registry.server';
import { executePluginMigrationWithGate } from '@core/lib/plugin-migration-contract.server';
import type { MigrationExecutionLockIdentity } from '@core/lib/plugin-migration-contract.server';
import { runIsolatedMigrationPlan } from '@core/lib/plugin-isolation-runtime.server';
import { executeMigrationPlanWithBroker } from '@core/lib/plugin-migration-broker.server';
import type { DevholmPluginManifest } from '@core/types/plugins';
import type { PluginMigrationMetadata } from '@core/types/plugins';

const LIFECYCLE_LOCK_NAMESPACE = 'devholm.plugin.lifecycle';

type MigrationRunnerOptions = {
  lockAlreadyHeld?: boolean;
  operationId?: string;
  migrationExecutionLock?: MigrationExecutionLockIdentity;
};

function getRegistryPath(): string {
  const resolved = resolvePluginRegistryPath(process.cwd());
  if (!resolved) {
    throw new Error(
      `Plugin migration registry not found. Expected generated/plugins/registry.json`
    );
  }

  return resolved;
}

function buildArtifactIdentity(manifest: DevholmPluginManifest): string {
  const manifestChecksum = createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
  return `bundled:${manifest.id}@${manifest.version}:${manifestChecksum}`;
}

function isIrreversibleMigration(manifest: DevholmPluginManifest, migrationId: string): boolean {
  const matched = (manifest.migrations ?? []).find((entry) => entry.id === migrationId) as
    | PluginMigrationMetadata
    | undefined;

  return matched?.reversibility === 'irreversible';
}

async function applyPluginMigrationsForEntry(
  entry: {
    id: string;
    version: string;
    migrationDir: string;
    migrations: Array<{ id: string; file: string; checksum: string }>;
  },
  manifest: DevholmPluginManifest,
  options?: MigrationRunnerOptions
): Promise<void> {
  const db = getDb();
  await db.transaction(async (trx) => {
    if (!options?.lockAlreadyHeld) {
      await trx.raw('select pg_advisory_xact_lock(hashtext(?), hashtext(?))', [
        LIFECYCLE_LOCK_NAMESPACE,
        entry.id,
      ]);
    }

    const discovered = discoverPluginMigrations([entry], process.cwd());
    ensureUniqueMigrationIds(discovered);

    const applied = await getPluginMigrationLedgerWithDb(entry.id, trx);
    const appliedMap = new Map(applied.map((row) => [row.migrationId, row.checksum]));

    ensureChecksumsUnchanged(discovered, appliedMap);

    const pending = discovered.filter((migration) => !appliedMap.has(migration.migrationId));
    if (pending.length === 0) {
      return;
    }

    let batchOrder = 0;
    const operationId = options?.operationId ?? randomUUID();
    for (const migration of pending) {
      const startedAt = Date.now();
      const sourceVersion =
        applied.length === 0 ? '0.0.0' : applied[applied.length - 1]?.pluginVersion;
      const targetVersion = migration.pluginVersion;
      const isolatedPlan = await runIsolatedMigrationPlan({
        pluginId: migration.pluginId,
        migrationId: migration.migrationId,
        checksum: migration.checksum,
        artifactIdentity: buildArtifactIdentity(manifest),
        direction: 'up',
        absolutePath: migration.absolutePath,
        sourceVersion: sourceVersion ?? '0.0.0',
        targetVersion,
      });
      const previousAttempts = await readCompletedPluginMigrationCheckpoints(
        migration.pluginId,
        trx
      );
      const attemptCount =
        previousAttempts.filter((entry) => entry.migrationId === migration.migrationId).length + 1;

      const checkpoint = await startPluginMigrationCheckpoint(
        {
          operationId,
          pluginId: migration.pluginId,
          pluginVersion: migration.pluginVersion,
          migrationId: migration.migrationId,
          direction: 'up',
          attemptCount,
          irreversible: isIrreversibleMigration(manifest, migration.migrationId),
          checksum: migration.checksum,
        },
        trx
      );

      try {
        const execution = await executePluginMigrationWithGate({
          manifest,
          migrationId: migration.migrationId,
          pluginVersion: migration.pluginVersion,
          checksum: migration.checksum,
          direction: 'up',
          operationId,
          lockIdentity: options?.migrationExecutionLock,
          execute: () =>
            executeMigrationPlanWithBroker({
              trx,
              pluginId: migration.pluginId,
              plan: isolatedPlan.plan,
              migrationId: migration.migrationId,
              checksum: migration.checksum,
              artifactIdentity: buildArtifactIdentity(manifest),
              direction: 'up',
              sourceVersion: sourceVersion ?? '0.0.0',
              targetVersion,
            }).then(() => undefined),
        });
        if (execution.state !== 'succeeded') {
          await markPluginMigrationCheckpointFailed(
            {
              checkpointId: checkpoint.checkpointId,
              status: execution.state === 'blocked' ? 'blocked' : 'failed',
              errorCode:
                execution.state === 'blocked'
                  ? 'LIFECYCLE_MIGRATION_BLOCKED'
                  : 'LIFECYCLE_MIGRATION_FAILED',
              publicMessage: execution.detail ?? execution.state,
              internalDiagnostic: execution.detail ?? execution.state,
            },
            trx
          );

          throw new Error(
            `Plugin migration execution failed for ${migration.migrationId}: ${execution.detail ?? execution.state}`
          );
        }

        await markPluginMigrationCheckpointCompleted(checkpoint.checkpointId, trx);

        batchOrder += 1;

        await insertPluginMigrationLedger({
          pluginId: migration.pluginId,
          migrationId: migration.migrationId,
          pluginVersion: migration.pluginVersion,
          checksum: migration.checksum,
          appliedAt: new Date(),
          durationMs: Date.now() - startedAt,
          batchOrder,
          direction: 'up',
          operationId,
          executionId: execution.executionId,
          sourceVersion: sourceVersion ?? '0.0.0',
          targetVersion,
          artifactIdentity: buildArtifactIdentity(manifest),
          assignedSchema: 'public',
          state: 'succeeded',
          startedAt: new Date(startedAt),
          completedAt: new Date(),
          db: trx,
        });
      } catch (error) {
        await markPluginMigrationCheckpointFailed(
          {
            checkpointId: checkpoint.checkpointId,
            status: 'failed',
            errorCode: 'LIFECYCLE_MIGRATION_FAILED',
            publicMessage: error instanceof Error ? error.message : String(error),
            internalDiagnostic:
              error instanceof Error ? error.stack ?? error.message : String(error),
          },
          trx
        );
        throw error;
      }

      applied.push({
        migrationId: migration.migrationId,
        checksum: migration.checksum,
        pluginVersion: migration.pluginVersion,
      });
    }
  });
}

export async function applyPendingPluginMigrations(
  pluginId?: string,
  options?: MigrationRunnerOptions
): Promise<void> {
  const allEntries = loadPluginMigrationRegistry(getRegistryPath());
  const registryEntries = allEntries.filter((entry) => (pluginId ? entry.id === pluginId : true));

  if (pluginId && registryEntries.length === 0) {
    throw new Error(`Plugin migration registry entry not found for plugin ${pluginId}`);
  }

  if (registryEntries.length === 0) {
    return;
  }

  const bundledManifestById = new Map(
    getBundledPluginManifests().map((manifest) => [manifest.id, manifest])
  );
  for (const entry of registryEntries) {
    const manifest = bundledManifestById.get(entry.id);
    if (!manifest) {
      throw new Error(`Plugin registry entry ${entry.id} has no bundled manifest`);
    }

    if (manifest.version !== entry.version) {
      throw new Error(
        `Plugin registry version drift for ${entry.id}: registry=${entry.version} manifest=${manifest.version}`
      );
    }

    const manifestMigrationIds = new Set(
      (manifest.migrations ?? []).map((migration) => migration.id)
    );
    const registryMigrationIds = new Set(entry.migrations.map((migration) => migration.id));
    for (const migrationId of manifestMigrationIds) {
      if (!registryMigrationIds.has(migrationId)) {
        throw new Error(`Registry is missing declared manifest migration ${migrationId}`);
      }
    }
  }

  const discovered = discoverPluginMigrations(registryEntries, process.cwd());
  ensureUniqueMigrationIds(discovered);

  for (const entry of registryEntries) {
    const manifest = bundledManifestById.get(entry.id);
    if (!manifest) {
      throw new Error(`Plugin registry entry ${entry.id} has no bundled manifest`);
    }

    await applyPluginMigrationsForEntry(entry, manifest, options);
  }
}

export async function applyPluginMigrationDowns(
  pluginId: string,
  options?: MigrationRunnerOptions
): Promise<void> {
  const allEntries = loadPluginMigrationRegistry(getRegistryPath());
  const entry = allEntries.find((item) => item.id === pluginId);
  if (!entry) {
    throw new Error(`Plugin migration registry entry not found for plugin ${pluginId}`);
  }

  const manifest = getBundledPluginManifests().find((item) => item.id === pluginId);
  if (!manifest) {
    throw new Error(`Plugin registry entry ${pluginId} has no bundled manifest`);
  }

  const discovered = discoverPluginMigrations([entry], process.cwd());
  const db = getDb();
  await db.transaction(async (trx) => {
    if (!options?.lockAlreadyHeld) {
      await trx.raw('select pg_advisory_xact_lock(hashtext(?), hashtext(?))', [
        LIFECYCLE_LOCK_NAMESPACE,
        entry.id,
      ]);
    }

    const operationId = options?.operationId ?? randomUUID();
    for (const migration of [...discovered].reverse()) {
      const rollbackTarget = await trx('devholm_plugin_migrations')
        .select('execution_id')
        .where({
          plugin_id: migration.pluginId,
          migration_id: migration.migrationId,
          direction: 'up',
          state: 'succeeded',
        })
        .orderBy('completed_at', 'desc')
        .first();

      const isolatedPlan = await runIsolatedMigrationPlan({
        pluginId: migration.pluginId,
        migrationId: migration.migrationId,
        checksum: migration.checksum,
        artifactIdentity: buildArtifactIdentity(manifest),
        direction: 'down',
        absolutePath: migration.absolutePath,
        sourceVersion: migration.pluginVersion,
        targetVersion: '0.0.0',
      });
      const previousAttempts = await readCompletedPluginMigrationCheckpoints(
        migration.pluginId,
        trx
      );
      const attemptCount =
        previousAttempts.filter((entry) => entry.migrationId === migration.migrationId).length + 1;

      const checkpoint = await startPluginMigrationCheckpoint(
        {
          operationId,
          pluginId: migration.pluginId,
          pluginVersion: migration.pluginVersion,
          migrationId: migration.migrationId,
          direction: 'down',
          attemptCount,
          irreversible: false,
          checksum: migration.checksum,
        },
        trx
      );

      let execution;
      try {
        execution = await executePluginMigrationWithGate({
          manifest,
          migrationId: migration.migrationId,
          pluginVersion: migration.pluginVersion,
          checksum: migration.checksum,
          direction: 'down',
          operationId,
          lockIdentity: options?.migrationExecutionLock,
          execute: () =>
            executeMigrationPlanWithBroker({
              trx,
              pluginId: migration.pluginId,
              plan: isolatedPlan.plan,
              migrationId: migration.migrationId,
              checksum: migration.checksum,
              artifactIdentity: buildArtifactIdentity(manifest),
              direction: 'down',
              sourceVersion: migration.pluginVersion,
              targetVersion: '0.0.0',
            }).then(() => undefined),
        });
      } catch (error) {
        await markPluginMigrationCheckpointFailed(
          {
            checkpointId: checkpoint.checkpointId,
            status: 'failed',
            errorCode: 'LIFECYCLE_MIGRATION_FAILED',
            publicMessage: error instanceof Error ? error.message : String(error),
            internalDiagnostic:
              error instanceof Error ? error.stack ?? error.message : String(error),
          },
          trx
        );
        throw error;
      }

      if (execution.state !== 'succeeded') {
        await markPluginMigrationCheckpointFailed(
          {
            checkpointId: checkpoint.checkpointId,
            status: execution.state === 'blocked' ? 'blocked' : 'failed',
            errorCode:
              execution.state === 'blocked'
                ? 'LIFECYCLE_MIGRATION_BLOCKED'
                : 'LIFECYCLE_MIGRATION_FAILED',
            publicMessage: execution.detail ?? execution.state,
            internalDiagnostic: execution.detail ?? execution.state,
          },
          trx
        );
        throw new Error(
          `Plugin migration rollback failed for ${migration.migrationId}: ${execution.detail ?? execution.state}`
        );
      }

      await markPluginMigrationCheckpointCompleted(checkpoint.checkpointId, trx);

      await insertPluginMigrationLedger({
        pluginId: migration.pluginId,
        migrationId: migration.migrationId,
        pluginVersion: migration.pluginVersion,
        checksum: migration.checksum,
        appliedAt: new Date(),
        durationMs: 0,
        batchOrder: 0,
        direction: 'down',
        operationId,
        executionId: execution.executionId,
        sourceVersion: migration.pluginVersion,
        targetVersion: '0.0.0',
        artifactIdentity: buildArtifactIdentity(manifest),
        assignedSchema: 'public',
        state: 'succeeded',
        startedAt: new Date(),
        completedAt: new Date(),
        rollbackOfExecutionId: (rollbackTarget?.execution_id as string | undefined) ?? null,
        db: trx,
      });
    }
  });
}

export function loadPluginMigrationRegistryEntriesForTests() {
  return loadPluginMigrationRegistry(getRegistryPath());
}

export function pluginMigrationRegistryExists(): boolean {
  return Boolean(resolvePluginRegistryPath(process.cwd()));
}
