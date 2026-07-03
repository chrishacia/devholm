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
    throw new Error(`Plugin migration registry not found at ${registryPath}`);
  }

  const parsed = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as {
    plugins?: PluginRegistryEntry[];
  };

  if (!Array.isArray(parsed.plugins)) {
    throw new Error(`Plugin migration registry is malformed at ${registryPath}`);
  }

  for (const [index, entry] of parsed.plugins.entries()) {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`Plugin migration registry entry ${index} is invalid`);
    }

    if (!entry.id || !entry.id.trim()) {
      throw new Error(`Plugin migration registry entry ${index} is missing id`);
    }

    if (!entry.version || !entry.version.trim()) {
      throw new Error(`Plugin migration registry entry ${entry.id} is missing version`);
    }

    if (!entry.migrationDir || !entry.migrationDir.trim()) {
      throw new Error(`Plugin migration registry entry ${entry.id} is missing migrationDir`);
    }
  }

  return parsed.plugins;
}

export function resolvePluginRegistryPath(rootDir: string): string | null {
  const candidatePaths = [
    path.join(rootDir, 'generated/plugins/registry.json'),
    path.join(rootDir, 'generated/plugins/migration-registry.json'),
    path.join(rootDir, 'plugins/registry.json'),
    path.join(rootDir, 'plugins/migration-registry.json'),
    path.join(rootDir, 'src/user/extensions/plugins/migration-registry.json'),
  ];

  return candidatePaths.find((candidate) => fs.existsSync(candidate)) ?? null;
}

export function resolvePluginMigrationDir(rootDir: string, entry: PluginRegistryEntry): string {
  const candidates = [entry.migrationDir, entry.productionMigrationDir]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .map((value) => (path.isAbsolute(value) ? value : path.join(rootDir, value)));

  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(
      `Migration directory is missing for plugin ${entry.id}. Checked: ${candidates.join(', ')}`
    );
  }

  return found;
}

export function discoverPluginMigrations(
  registryEntries: readonly PluginRegistryEntry[],
  rootDir: string
): PluginMigrationFile[] {
  const discovered: PluginMigrationFile[] = [];

  for (const entry of registryEntries) {
    const migrationDir = resolvePluginMigrationDir(rootDir, entry);

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
  const discoveredIds = new Set(migrations.map((migration) => migration.migrationId));

  for (const migration of migrations) {
    const existing = applied.get(migration.migrationId);
    if (existing && existing !== migration.checksum) {
      throw new Error(`Checksum mismatch for already-applied migration ${migration.migrationId}`);
    }
  }

  for (const appliedMigrationId of applied.keys()) {
    if (!discoveredIds.has(appliedMigrationId)) {
      throw new Error(
        `Previously applied migration is missing from manifest: ${appliedMigrationId}`
      );
    }
  }
}
