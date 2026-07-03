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

function isWindowsAbsolutePath(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('\\\\');
}

function assertWithinRoot(root: string, target: string, message: string): void {
  const relativePath = path.relative(root, target);

  if (
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(message);
  }
}

function listMigrationFilesRecursively(dir: string): string[] {
  const discovered: string[] = [];
  const stack = [dir];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    if (!currentDir) {
      continue;
    }

    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const absolutePath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        stack.push(absolutePath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (entry.name.endsWith('.ts') || entry.name.endsWith('.js')) {
        discovered.push(path.relative(dir, absolutePath).replace(/\\/g, '/'));
      }
    }
  }

  return discovered.sort((a, b) => a.localeCompare(b));
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
  const generatedPluginsRoot = path.resolve(rootDir, 'generated/plugins');

  if (isWindowsAbsolutePath(entry.migrationDir)) {
    throw new Error(`Migration directory escapes generated plugins root: ${entry.migrationDir}`);
  }

  const migrationDir = path.isAbsolute(entry.migrationDir)
    ? path.resolve(entry.migrationDir)
    : path.resolve(rootDir, entry.migrationDir);

  assertWithinRoot(
    generatedPluginsRoot,
    migrationDir,
    `Migration directory escapes generated plugins root: ${entry.migrationDir}`
  );

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
  const generatedPluginsRoot = path.resolve(rootDir, 'generated/plugins');

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

      if (path.isAbsolute(declared.file) || isWindowsAbsolutePath(declared.file)) {
        throw new Error(`Migration file path escapes generated plugins root: ${declared.file}`);
      }

      const declaredFile = declared.file.replace(/\\/g, '/');
      if (declaredFiles.has(declaredFile)) {
        throw new Error(`Duplicate declared migration file for ${entry.id}: ${declaredFile}`);
      }
      declaredFiles.add(declaredFile);

      const absolutePath = path.resolve(generatedPluginsRoot, declaredFile);
      assertWithinRoot(
        generatedPluginsRoot,
        absolutePath,
        `Migration file path escapes generated plugins root: ${declared.file}`
      );

      if (!fs.existsSync(absolutePath)) {
        throw new Error(`Declared migration file is missing: ${declared.file}`);
      }

      const migrationPrefix = `${entry.id}/migrations/`;
      if (!declaredFile.startsWith(migrationPrefix)) {
        throw new Error(
          `Declared migration file ${declared.file} does not exist under ${entry.migrationDir}`
        );
      }

      const declaredRelativeToPluginDir = declaredFile.slice(migrationPrefix.length);
      const expectedMigrationPath = path.resolve(migrationDir, declaredRelativeToPluginDir);
      assertWithinRoot(
        migrationDir,
        expectedMigrationPath,
        `Declared migration file ${declared.file} does not exist under ${entry.migrationDir}`
      );

      if (!fs.existsSync(expectedMigrationPath)) {
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
        file: declaredRelativeToPluginDir,
        absolutePath,
        checksum: declared.checksum,
      });
    }

    const packagedFiles = listMigrationFilesRecursively(migrationDir);
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
