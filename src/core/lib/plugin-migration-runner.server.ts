import path from 'path';
import { pathToFileURL } from 'url';
import { getDb } from '@/db';
import {
  discoverPluginMigrations,
  ensureChecksumsUnchanged,
  ensureUniqueMigrationIds,
  loadPluginMigrationRegistry,
  resolvePluginRegistryPath,
} from '@core/lib/plugin-migration-discovery.server';
import { getPluginMigrationLedger, insertPluginMigrationLedger } from '@core/db/plugin-lifecycle';

function getRegistryPath(): string {
  return (
    resolvePluginRegistryPath(process.cwd()) ??
    path.join(process.cwd(), 'src/user/extensions/plugins/migration-registry.json')
  );
}

async function executeMigration(
  absolutePath: string,
  trx: Awaited<ReturnType<typeof getDb>>
): Promise<void> {
  const mod = await import(pathToFileURL(absolutePath).href);
  if (typeof mod.up !== 'function') {
    throw new Error(`Plugin migration ${absolutePath} does not export an up() function`);
  }

  await mod.up(trx);
}

async function applyPluginMigrationsForEntry(entry: {
  id: string;
  version: string;
  migrationDir: string;
  productionMigrationDir?: string;
}): Promise<void> {
  const discovered = discoverPluginMigrations([entry], process.cwd());
  ensureUniqueMigrationIds(discovered);

  const applied = await getPluginMigrationLedger(entry.id);
  const appliedMap = new Map(applied.map((row) => [row.migrationId, row.checksum]));

  ensureChecksumsUnchanged(discovered, appliedMap);

  const pending = discovered.filter((migration) => !appliedMap.has(migration.migrationId));
  if (pending.length === 0) {
    return;
  }

  const db = getDb();
  await db.transaction(async (trx) => {
    await trx.raw('select pg_advisory_xact_lock(hashtext(?))', [entry.id]);

    let batchOrder = 0;
    for (const migration of pending) {
      const startedAt = Date.now();
      await executeMigration(migration.absolutePath, trx);
      batchOrder += 1;

      await insertPluginMigrationLedger({
        pluginId: migration.pluginId,
        migrationId: migration.migrationId,
        pluginVersion: migration.pluginVersion,
        checksum: migration.checksum,
        appliedAt: new Date(),
        durationMs: Date.now() - startedAt,
        batchOrder,
        db: trx,
      });
    }
  });
}

export async function applyPendingPluginMigrations(pluginId?: string): Promise<void> {
  const registryEntries = loadPluginMigrationRegistry(getRegistryPath()).filter((entry) =>
    pluginId ? entry.id === pluginId : true
  );

  if (registryEntries.length === 0) {
    return;
  }

  const discovered = discoverPluginMigrations(registryEntries, process.cwd());
  ensureUniqueMigrationIds(discovered);

  for (const entry of registryEntries) {
    const applied = await getPluginMigrationLedger(entry.id);
    const appliedMap = new Map(applied.map((row) => [row.migrationId, row.checksum]));
    ensureChecksumsUnchanged(
      discovered.filter((migration) => migration.pluginId === entry.id),
      appliedMap
    );
  }

  for (const entry of registryEntries) {
    await applyPluginMigrationsForEntry(entry);
  }
}

export function loadPluginMigrationRegistryEntriesForTests() {
  return loadPluginMigrationRegistry(getRegistryPath());
}

export function pluginMigrationRegistryExists(): boolean {
  return Boolean(resolvePluginRegistryPath(process.cwd()));
}
