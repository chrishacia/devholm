import fs from 'fs';
import path from 'path';
import { getDb } from '@/db';
import {
  discoverPluginMigrations,
  ensureChecksumsUnchanged,
  ensureUniqueMigrationIds,
  loadPluginMigrationRegistry,
  resolvePluginMigrationDir,
} from '@core/lib/plugin-migration-discovery.server';
import { getPluginMigrationLedger, insertPluginMigrationLedger } from '@core/db/plugin-lifecycle';

function getRegistryPath(): string {
  return path.join(process.cwd(), 'src/user/extensions/plugins/migration-registry.json');
}

export async function applyPendingPluginMigrations(pluginId?: string): Promise<void> {
  const registryEntries = loadPluginMigrationRegistry(getRegistryPath()).filter((entry) =>
    pluginId ? entry.id === pluginId : true
  );

  if (registryEntries.length === 0) {
    return;
  }

  const migrationDirs = registryEntries
    .map((entry) => resolvePluginMigrationDir(process.cwd(), entry))
    .filter((dir): dir is string => Boolean(dir));

  if (migrationDirs.length === 0) {
    return;
  }

  const discovered = discoverPluginMigrations(registryEntries, process.cwd());
  ensureUniqueMigrationIds(discovered);

  const db = getDb();

  for (const entry of registryEntries) {
    const applied = await getPluginMigrationLedger(entry.id);
    const appliedMap = new Map(applied.map((row) => [row.migrationId, row.checksum]));

    ensureChecksumsUnchanged(
      discovered.filter((migration) => migration.pluginId === entry.id),
      appliedMap
    );
  }

  await db.migrate.latest({
    directory: migrationDirs,
    tableName: 'knex_migrations',
    loadExtensions: ['.ts', '.js'],
  });

  const knexRows = await db('knex_migrations').select('name', 'migration_time');
  const migrationTimeByFile = new Map(
    knexRows.map((row) => [row.name, row.migration_time as Date])
  );

  let batchOrder = 0;
  for (const migration of discovered) {
    if (!migrationTimeByFile.has(migration.file)) {
      continue;
    }

    const ledger = await getPluginMigrationLedger(migration.pluginId);
    if (ledger.some((row) => row.migrationId === migration.migrationId)) {
      continue;
    }

    batchOrder += 1;
    await insertPluginMigrationLedger({
      pluginId: migration.pluginId,
      migrationId: migration.migrationId,
      pluginVersion: migration.pluginVersion,
      checksum: migration.checksum,
      appliedAt: migrationTimeByFile.get(migration.file) ?? new Date(),
      durationMs: 0,
      batchOrder,
    });
  }
}

export function loadPluginMigrationRegistryEntriesForTests() {
  return loadPluginMigrationRegistry(getRegistryPath());
}

export function pluginMigrationRegistryExists(): boolean {
  return fs.existsSync(getRegistryPath());
}
