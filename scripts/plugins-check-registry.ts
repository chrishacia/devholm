import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { bundledPlugins } from '../src/user/extensions/plugins/registry';

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
  plugins: GeneratedRegistryEntry[];
}

function checksumFile(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/');
}

function expectedRegistry(rootDir: string): GeneratedRegistry {
  return {
    plugins: bundledPlugins
      .map(({ manifest }) => {
        const sourceMigrationDir = path.join(
          rootDir,
          'src/user/extensions/plugins',
          manifest.id,
          'db/migrations'
        );

        const sourceFiles = fs
          .readdirSync(sourceMigrationDir)
          .filter((file) => file.endsWith('.ts') || file.endsWith('.js'))
          .sort((a, b) => a.localeCompare(b));

        const declaredMigrations = manifest.migrations ?? [];
        const declaredSourceFiles = new Set(
          declaredMigrations.map((item) => path.basename(item.file))
        );
        const undeclared = sourceFiles.filter((file) => !declaredSourceFiles.has(file));
        if (undeclared.length > 0) {
          throw new Error(
            `Plugin ${manifest.id} has undeclared migration source files: ${undeclared.join(', ')}`
          );
        }

        return {
          id: manifest.id,
          version: manifest.version,
          migrationDir: `generated/plugins/${manifest.id}/migrations`,
          seedDir: `src/user/extensions/plugins/${manifest.id}/db/seeds`,
          migrations: declaredMigrations.map((migration) => {
            const outputFile = path.join(
              rootDir,
              'generated/plugins',
              manifest.id,
              'migrations',
              path.basename(migration.file)
            );
            if (!fs.existsSync(outputFile)) {
              throw new Error(
                `Generated migration asset is missing for plugin ${manifest.id}: ${outputFile}`
              );
            }

            return {
              id: migration.id,
              file: `${manifest.id}/migrations/${path.basename(migration.file)}`,
              checksum: checksumFile(outputFile),
            };
          }),
        };
      })
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}

function readGenerated(rootDir: string): GeneratedRegistry {
  const filePath = path.join(rootDir, 'generated/plugins/registry.json');
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Generated registry is missing at ${filePath}. Run pnpm plugins:generate first.`
    );
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as GeneratedRegistry;
}

function main(): void {
  const rootDir = process.cwd();
  const expected = expectedRegistry(rootDir);
  const generated = readGenerated(rootDir);

  const expectedJson = JSON.stringify(expected);
  const generatedJson = JSON.stringify(generated);
  if (expectedJson !== generatedJson) {
    throw new Error(
      'Generated registry is stale. Run pnpm plugins:generate to refresh derived plugin assets.'
    );
  }

  for (const plugin of generated.plugins) {
    const migrationDir = path.join(rootDir, normalizePath(plugin.migrationDir));
    if (!fs.existsSync(migrationDir)) {
      throw new Error(
        `Migration directory is missing for plugin ${plugin.id}: ${plugin.migrationDir}`
      );
    }

    const packagedFiles = fs
      .readdirSync(migrationDir)
      .filter((file) => file.endsWith('.ts') || file.endsWith('.js'))
      .sort((a, b) => a.localeCompare(b));
    const declaredFiles = plugin.migrations
      .map((migration) => path.basename(migration.file))
      .sort();
    if (JSON.stringify(packagedFiles) !== JSON.stringify(declaredFiles)) {
      throw new Error(
        `Packaged migrations for ${plugin.id} do not match declarations. packaged=${packagedFiles.join(',')} declared=${declaredFiles.join(',')}`
      );
    }

    for (const migration of plugin.migrations) {
      const packagedFile = path.join(rootDir, 'generated/plugins', normalizePath(migration.file));
      if (!fs.existsSync(packagedFile)) {
        throw new Error(`Packaged migration is missing for plugin ${plugin.id}: ${migration.file}`);
      }

      const actualChecksum = checksumFile(packagedFile);
      if (actualChecksum !== migration.checksum) {
        throw new Error(
          `Checksum mismatch for ${plugin.id}:${migration.id}. Expected ${migration.checksum}, found ${actualChecksum}.`
        );
      }
    }
  }

  console.log('Plugin registry check passed');
}

main();
