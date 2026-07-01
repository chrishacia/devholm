import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';

export interface PluginRegistryEntry {
  id: string;
  version: string;
  migrationDir: string;
  productionMigrationDir?: string;
  seedDir?: string;
}

export interface PluginMigrationFile {
  pluginId: string;
  pluginVersion: string;
  migrationId: string;
  file: string;
  absolutePath: string;
  checksum: string;
}

export function checksumMigrationContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export function loadPluginMigrationRegistry(registryPath: string): PluginRegistryEntry[] {
  if (!fs.existsSync(registryPath)) {
    return [];
  }

  const parsed = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as {
    plugins?: PluginRegistryEntry[];
  };

  return Array.isArray(parsed.plugins) ? parsed.plugins : [];
}

export function resolvePluginMigrationDir(
  rootDir: string,
  entry: PluginRegistryEntry
): string | null {
  const candidates = [entry.migrationDir, entry.productionMigrationDir]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .map((value) => (path.isAbsolute(value) ? value : path.join(rootDir, value)));

  const found = candidates.find((candidate) => fs.existsSync(candidate));
  return found ?? null;
}

export function discoverPluginMigrations(
  registryEntries: readonly PluginRegistryEntry[],
  rootDir: string
): PluginMigrationFile[] {
  const discovered: PluginMigrationFile[] = [];

  for (const entry of registryEntries) {
    const migrationDir = resolvePluginMigrationDir(rootDir, entry);
    if (!migrationDir) {
      continue;
    }

    const files = fs
      .readdirSync(migrationDir)
      .filter((file) => file.endsWith('.ts') || file.endsWith('.js'))
      .sort((a, b) => a.localeCompare(b));

    for (const file of files) {
      const absolutePath = path.join(migrationDir, file);
      const content = fs.readFileSync(absolutePath, 'utf8');
      const migrationBase = file.replace(/\.(ts|js)$/u, '');
      discovered.push({
        pluginId: entry.id,
        pluginVersion: entry.version,
        migrationId: `${entry.id}:${migrationBase}`,
        file,
        absolutePath,
        checksum: checksumMigrationContent(content),
      });
    }
  }

  return discovered.sort((a, b) => a.migrationId.localeCompare(b.migrationId));
}

export function ensureUniqueMigrationIds(migrations: readonly PluginMigrationFile[]): void {
  const seen = new Set<string>();

  for (const migration of migrations) {
    if (seen.has(migration.migrationId)) {
      throw new Error(`Duplicate plugin migration ID: ${migration.migrationId}`);
    }
    seen.add(migration.migrationId);
  }
}

export function ensureChecksumsUnchanged(
  migrations: readonly PluginMigrationFile[],
  applied: ReadonlyMap<string, string>
): void {
  for (const migration of migrations) {
    const existing = applied.get(migration.migrationId);
    if (existing && existing !== migration.checksum) {
      throw new Error(`Checksum mismatch for already-applied migration ${migration.migrationId}`);
    }
  }
}
