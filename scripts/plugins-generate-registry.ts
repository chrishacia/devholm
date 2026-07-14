import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { bundledPlugins } from '../src/user/extensions/plugins/registry';
import { toCanonicalPluginConfigEntry } from '../src/core/lib/plugin-canonical-contract-adapters';
import {
  buildDeterministicCanonicalRegistry,
  createCanonicalDocumentFromEntries,
} from '../src/core/lib/plugin-canonical-resolver.server';

interface GeneratedMigrationAsset {
  id: string;
  file: string;
  checksum: string;
}

interface GeneratedRegistryEntry {
  id: string;
  version: string;
  migrationDir: string;
  seedDir: string;
  migrations: GeneratedMigrationAsset[];
}

interface GeneratedRegistry {
  schemaVersion: 1;
  generatorVersion: string;
  contentDigestSha256: string;
  content: unknown;
  plugins: GeneratedRegistryEntry[];
}

function checksumFile(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function ensureDirectory(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function clearGeneratedPluginsDir(rootDir: string): string {
  const outputDir = path.join(rootDir, 'generated/plugins');
  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }

  ensureDirectory(outputDir);
  return outputDir;
}

function collectSourceMigrationFiles(migrationDir: string): string[] {
  return fs
    .readdirSync(migrationDir)
    .filter((file) => file.endsWith('.ts') || file.endsWith('.js'))
    .sort((a, b) => a.localeCompare(b));
}

function normalizeRelativeFile(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function buildRegistry(rootDir: string, outputDir: string): GeneratedRegistry {
  const canonicalEntries = bundledPlugins.map(toCanonicalPluginConfigEntry);
  const { registry, failures } = buildDeterministicCanonicalRegistry({
    environment: 'ci',
    document: createCanonicalDocumentFromEntries(canonicalEntries),
  });

  if (failures.length > 0 || !registry) {
    const messages = failures.map(
      (failure) => `${failure.pluginId}:${failure.code}:${failure.message}`
    );
    throw new Error(
      `Canonical resolver failed during registry generation: ${messages.join(' | ')}`
    );
  }

  const plugins: GeneratedRegistryEntry[] = bundledPlugins
    .map(({ manifest }) => {
      const sourceMigrationDir = path.join(
        rootDir,
        'src/user/extensions/plugins',
        manifest.id,
        'db/migrations'
      );
      const migrationDir = `generated/plugins/${manifest.id}/migrations`;
      const seedDir = `src/user/extensions/plugins/${manifest.id}/db/seeds`;
      const outputMigrationDir = path.join(outputDir, manifest.id, 'migrations');
      ensureDirectory(outputMigrationDir);

      const sourceFiles = collectSourceMigrationFiles(sourceMigrationDir);
      const declared = manifest.migrations ?? [];
      const declaredByFile = new Map(declared.map((migration) => [migration.file, migration]));

      const undeclared = sourceFiles.filter((file) => !declaredByFile.has(`db/migrations/${file}`));
      if (undeclared.length > 0) {
        throw new Error(
          `Plugin ${manifest.id} has undeclared migration source files: ${undeclared.join(', ')}`
        );
      }

      const duplicateIds = new Set<string>();
      const seenIds = new Set<string>();
      for (const migration of declared) {
        if (seenIds.has(migration.id)) {
          duplicateIds.add(migration.id);
        }
        seenIds.add(migration.id);
      }

      if (duplicateIds.size > 0) {
        throw new Error(
          `Plugin ${manifest.id} declares duplicate migration IDs: ${Array.from(duplicateIds).join(', ')}`
        );
      }

      const migrations = declared.map((migration) => {
        const relativePath = `src/user/extensions/plugins/${manifest.id}/${migration.file}`;
        const absolutePath = path.join(rootDir, relativePath);
        if (!fs.existsSync(absolutePath)) {
          throw new Error(`Migration asset is missing for plugin ${manifest.id}: ${relativePath}`);
        }

        const outputFileName = path.basename(migration.file);
        const outputFile = path.join(outputMigrationDir, outputFileName);
        fs.copyFileSync(absolutePath, outputFile);

        const relativeOutputFile = normalizeRelativeFile(
          path.relative(path.join(rootDir, 'generated/plugins'), outputFile)
        );

        if (!migration.id.startsWith(`${manifest.id}:`)) {
          throw new Error(
            `Plugin ${manifest.id} migration ${migration.id} must be namespaced to ${manifest.id}:*`
          );
        }

        return {
          id: migration.id,
          file: relativeOutputFile,
          checksum: checksumFile(outputFile),
        };
      });

      const duplicateFiles = new Set<string>();
      const seenFiles = new Set<string>();
      for (const migration of migrations) {
        if (seenFiles.has(migration.file)) {
          duplicateFiles.add(migration.file);
        }
        seenFiles.add(migration.file);
      }

      if (duplicateFiles.size > 0) {
        throw new Error(
          `Plugin ${manifest.id} declares duplicate migration files: ${Array.from(duplicateFiles).join(', ')}`
        );
      }

      return {
        id: manifest.id,
        version: manifest.version,
        migrationDir,
        seedDir,
        migrations,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    schemaVersion: 1,
    generatorVersion: registry.generatorVersion,
    contentDigestSha256: registry.contentDigestSha256,
    content: registry.content,
    plugins,
  };
}

function writeRegistryFile(rootDir: string, payload: GeneratedRegistry): string {
  const outputDir = path.join(rootDir, 'generated/plugins');
  const outputPath = path.join(outputDir, 'registry.json');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return outputPath;
}

function main(): void {
  const rootDir = process.cwd();
  const outputDir = clearGeneratedPluginsDir(rootDir);
  const payload = buildRegistry(rootDir, outputDir);
  const outputPath = writeRegistryFile(rootDir, payload);
  console.log(`Generated plugin registry at ${outputPath}`);
}

main();
