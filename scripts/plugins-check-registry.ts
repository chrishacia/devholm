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
  productionMigrationDir: string;
  seedDir: string;
  migrations: GeneratedMigrationAsset[];
}

interface GeneratedRegistry {
  plugins: GeneratedRegistryEntry[];
}

function checksumFile(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath, 'utf8')).digest('hex');
}

function expectedRegistry(rootDir: string): GeneratedRegistry {
  return {
    plugins: bundledPlugins
      .map(({ manifest }) => ({
        id: manifest.id,
        version: manifest.version,
        migrationDir: `src/user/extensions/plugins/${manifest.id}/db/migrations`,
        productionMigrationDir: `plugins/${manifest.id}/migrations`,
        seedDir: `src/user/extensions/plugins/${manifest.id}/db/seeds`,
        migrations: (manifest.migrations ?? []).map((migration) => {
          const relativePath = `src/user/extensions/plugins/${manifest.id}/${migration.file}`;
          const absolutePath = path.join(rootDir, relativePath);
          if (!fs.existsSync(absolutePath)) {
            throw new Error(
              `Migration asset is missing for plugin ${manifest.id}: ${relativePath}`
            );
          }

          return {
            id: migration.id,
            file: migration.file,
            checksum: checksumFile(absolutePath),
          };
        }),
      }))
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
      'Generated registry is stale. Run pnpm plugins:generate and commit the result.'
    );
  }

  for (const plugin of generated.plugins) {
    const migrationDir = path.join(rootDir, plugin.migrationDir);
    if (!fs.existsSync(migrationDir)) {
      throw new Error(
        `Migration directory is missing for plugin ${plugin.id}: ${plugin.migrationDir}`
      );
    }

    for (const migration of plugin.migrations) {
      const sourceFile = path.join(
        rootDir,
        'src/user/extensions/plugins',
        plugin.id,
        migration.file
      );
      if (!fs.existsSync(sourceFile)) {
        throw new Error(`Migration file is missing for plugin ${plugin.id}: ${migration.file}`);
      }

      const actualChecksum = checksumFile(sourceFile);
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
