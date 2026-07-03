import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';

export interface PluginRegistryEntry {
  id: string;
  version: string;
  migrationDir: string;
  seedDir?: string;
  migrations: Array<{
    id: string;
    file: string;
    checksum: string;
  }>;
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
  const candidatePaths = [path.join(rootDir, 'generated/plugins/registry.json')];

  return candidatePaths.find((candidate) => fs.existsSync(candidate)) ?? null;
}

export function resolvePluginMigrationDir(rootDir: string, entry: PluginRegistryEntry): string {
  const migrationDir = path.isAbsolute(entry.migrationDir)
    ? entry.migrationDir
    : path.join(rootDir, entry.migrationDir);

  if (!fs.existsSync(migrationDir)) {
    throw new Error(
      `Migration directory is missing for plugin ${entry.id}. Expected: ${migrationDir}`
    );
  }

  return migrationDir;
}

export function discoverPluginMigrations(
  registryEntries: readonly PluginRegistryEntry[],
  rootDir: string
): PluginMigrationFile[] {
  const discovered: PluginMigrationFile[] = [];

  for (const entry of registryEntries) {
    const migrationDir = resolvePluginMigrationDir(rootDir, entry);

    const declaredFiles = new Set<string>();
    const declaredIds = new Set<string>();
    for (const declared of entry.migrations) {
      if (!declared.id.startsWith(`${entry.id}:`)) {
        throw new Error(`Migration ID ${declared.id} must be namespaced to ${entry.id}:*`);
      }

      if (declaredIds.has(declared.id)) {
        throw new Error(`Duplicate declared migration ID for ${entry.id}: ${declared.id}`);
      }
      declaredIds.add(declared.id);

      const declaredFile = declared.file.replace(/\\/g, '/');
      if (declaredFiles.has(declaredFile)) {
        throw new Error(`Duplicate declared migration file for ${entry.id}: ${declaredFile}`);
      }
      declaredFiles.add(declaredFile);

      const absolutePath = path.join(rootDir, 'generated/plugins', declaredFile);
      if (!absolutePath.startsWith(path.join(rootDir, 'generated/plugins'))) {
        throw new Error(`Migration file path escapes generated plugins root: ${declared.file}`);
      }

      if (!fs.existsSync(absolutePath)) {
        throw new Error(`Declared migration file is missing: ${declared.file}`);
      }

      const expectedFileName = path.basename(declared.file);
      if (!fs.existsSync(path.join(migrationDir, expectedFileName))) {
        throw new Error(
          `Declared migration file ${declared.file} does not exist under ${entry.migrationDir}`
        );
      }

      const content = fs.readFileSync(absolutePath, 'utf8');
      const actualChecksum = checksumMigrationContent(content);
      if (declared.checksum !== actualChecksum) {
        throw new Error(
          `Declared checksum mismatch for ${declared.id}: expected ${declared.checksum}, got ${actualChecksum}`
        );
      }

      discovered.push({
        pluginId: entry.id,
        pluginVersion: entry.version,
        migrationId: declared.id,
        file: path.basename(declared.file),
        absolutePath,
        checksum: declared.checksum,
      });
    }

    const packagedFiles = fs
      .readdirSync(migrationDir)
      .filter((file) => file.endsWith('.ts') || file.endsWith('.js'))
      .sort((a, b) => a.localeCompare(b));
    for (const file of packagedFiles) {
      const expectedPath = `${entry.id}/migrations/${file}`;
      if (!declaredFiles.has(expectedPath)) {
        throw new Error(`Undeclared packaged migration file for ${entry.id}: ${expectedPath}`);
      }
    }
  }

  return discovered;
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
