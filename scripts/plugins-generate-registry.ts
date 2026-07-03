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

function buildRegistry(rootDir: string): GeneratedRegistry {
  const plugins: GeneratedRegistryEntry[] = bundledPlugins
    .map(({ manifest }) => {
      const migrationDir = `src/user/extensions/plugins/${manifest.id}/db/migrations`;
      const productionMigrationDir = `plugins/${manifest.id}/migrations`;
      const seedDir = `src/user/extensions/plugins/${manifest.id}/db/seeds`;

      const migrations = (manifest.migrations ?? []).map((migration) => {
        const relativePath = `src/user/extensions/plugins/${manifest.id}/${migration.file}`;
        const absolutePath = path.join(rootDir, relativePath);
        if (!fs.existsSync(absolutePath)) {
          throw new Error(`Migration asset is missing for plugin ${manifest.id}: ${relativePath}`);
        }

        return {
          id: migration.id,
          file: migration.file,
          checksum: checksumFile(absolutePath),
        };
      });

      return {
        id: manifest.id,
        version: manifest.version,
        migrationDir,
        productionMigrationDir,
        seedDir,
        migrations,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  return { plugins };
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
  const payload = buildRegistry(rootDir);
  const outputPath = writeRegistryFile(rootDir, payload);
  console.log(`Generated plugin registry at ${outputPath}`);
}

main();
