import { pathToFileURL } from 'url';
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
import { getBundledPluginManifests } from '@core/lib/plugin-registry.server';

const LIFECYCLE_LOCK_NAMESPACE = 'devholm.plugin.lifecycle';

function getRegistryPath(): string {
  const resolved = resolvePluginRegistryPath(process.cwd());
  if (!resolved) {
    throw new Error(
      `Plugin migration registry not found. Expected generated/plugins/registry.json`
    );
  }

  return resolved;
}

async function executeMigration(
  absolutePath: string,
  trx: Awaited<ReturnType<typeof getDb>>
): Promise<void> {
  const mod = await import(/* webpackIgnore: true */ pathToFileURL(absolutePath).href);
  if (typeof mod.up !== 'function') {
    throw new Error(`Plugin migration ${absolutePath} does not export an up() function`);
  }

  await mod.up(trx);
}

async function executeMigrationDown(
  absolutePath: string,
  trx: Awaited<ReturnType<typeof getDb>>
): Promise<void> {
  const mod = await import(/* webpackIgnore: true */ pathToFileURL(absolutePath).href);
  if (typeof mod.down !== 'function') {
    throw new Error(`Plugin migration ${absolutePath} does not export a down() function`);
  }

  await mod.down(trx);
}

async function applyPluginMigrationsForEntry(
  entry: {
    id: string;
    version: string;
    migrationDir: string;
    migrations: Array<{ id: string; file: string; checksum: string }>;
  },
  options?: { lockAlreadyHeld?: boolean }
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

export async function applyPendingPluginMigrations(
  pluginId?: string,
  options?: { lockAlreadyHeld?: boolean }
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
    await applyPluginMigrationsForEntry(entry, options);
  }
}

export async function applyPluginMigrationDowns(
  pluginId: string,
  options?: { lockAlreadyHeld?: boolean }
): Promise<void> {
  const allEntries = loadPluginMigrationRegistry(getRegistryPath());
  const entry = allEntries.find((item) => item.id === pluginId);
  if (!entry) {
    throw new Error(`Plugin migration registry entry not found for plugin ${pluginId}`);
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

    for (const migration of [...discovered].reverse()) {
      await executeMigrationDown(migration.absolutePath, trx);
    }
  });
}

export function loadPluginMigrationRegistryEntriesForTests() {
  return loadPluginMigrationRegistry(getRegistryPath());
}

export function pluginMigrationRegistryExists(): boolean {
  return Boolean(resolvePluginRegistryPath(process.cwd()));
}
