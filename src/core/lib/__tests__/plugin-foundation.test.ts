import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import type { DevholmPluginManifest } from '@core/types/plugins';
import {
  isVersionCompatible,
  validateDependencyGraphForManifests,
  validatePackageDependenciesForManifests,
  validatePluginManifestList,
} from '@core/lib/plugin-registry.server';
import {
  discoverPluginMigrations,
  ensureChecksumsUnchanged,
  ensureUniqueMigrationIds,
  loadPluginMigrationRegistry,
} from '@core/lib/plugin-migration-discovery.server';

function createManifest(overrides: Partial<DevholmPluginManifest> = {}): DevholmPluginManifest {
  return {
    id: 'plugin-a',
    name: 'Plugin A',
    version: '1.0.0',
    enablementSettingKey: 'plugin:plugin-a:enabled',
    ...overrides,
  };
}

describe('generic plugin foundation', () => {
  it('validates plugin manifest fields and duplicate plugin IDs', () => {
    const manifests = [
      createManifest(),
      createManifest({
        id: 'plugin-a',
        name: 'Plugin A Duplicate',
      }),
    ];

    const errors = validatePluginManifestList(manifests);
    expect(errors.some((error) => error.includes('duplicate plugin id plugin-a'))).toBe(true);
  });

  it('validates DevHolm version compatibility ranges', () => {
    expect(isVersionCompatible('3.6.0', '^3.0.0')).toBe(true);
    expect(isVersionCompatible('3.6.0', '3.6.0')).toBe(true);
    expect(isVersionCompatible('3.6.0', '^4.0.0')).toBe(false);

    expect(isVersionCompatible('3.0.0', '^3.6.0')).toBe(false);
    expect(isVersionCompatible('3.6.5', '^3.6.0')).toBe(true);
    expect(isVersionCompatible('4.0.0', '^3.6.0')).toBe(false);
  });

  it('rejects missing plugin dependencies and dependency cycles', () => {
    const missingDepErrors = validateDependencyGraphForManifests([
      createManifest({
        id: 'plugin-a',
        dependencies: {
          plugins: {
            'plugin-missing': '^1.0.0',
          },
        },
      }),
    ]);
    expect(
      missingDepErrors.some((error) => error.includes('requires missing plugin dependency'))
    ).toBe(true);

    const cycleErrors = validateDependencyGraphForManifests([
      createManifest({
        id: 'plugin-a',
        dependencies: { plugins: { 'plugin-b': '^1.0.0' } },
      }),
      createManifest({
        id: 'plugin-b',
        name: 'Plugin B',
        enablementSettingKey: 'plugin:plugin-b:enabled',
        dependencies: { plugins: { 'plugin-a': '^1.0.0' } },
      }),
    ]);

    expect(cycleErrors.some((error) => error.includes('dependency cycle detected'))).toBe(true);
  });

  it('rejects missing package dependency declarations', () => {
    const errors = validatePackageDependenciesForManifests(
      [
        createManifest({
          dependencies: {
            packages: {
              'missing-package': '^1.0.0',
            },
          },
        }),
      ],
      {
        zod: '^3.23.0',
      }
    );

    expect(errors.some((error) => error.includes('missing package dependency'))).toBe(true);
  });

  it('discovers plugin-local migrations from shared registry and production paths metadata', () => {
    const registryPath = path.join(
      process.cwd(),
      'src/user/extensions/plugins/migration-registry.json'
    );
    const entries = loadPluginMigrationRegistry(registryPath);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.some((entry) => entry.id === 'url-shortener')).toBe(true);
    expect(entries.some((entry) => Boolean(entry.productionMigrationDir))).toBe(true);

    const migrations = discoverPluginMigrations(entries, process.cwd());
    expect(migrations.some((migration) => migration.migrationId.includes('url-shortener:'))).toBe(
      true
    );
  });

  it('orders migrations deterministically and rejects duplicate IDs', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devholm-plugin-migrations-'));
    const migrationDir = path.join(tempDir, 'migrations');
    fs.mkdirSync(migrationDir, { recursive: true });

    fs.writeFileSync(path.join(migrationDir, '20260701010100_b.ts'), 'export const up = () => {}');
    fs.writeFileSync(path.join(migrationDir, '20260701010000_a.ts'), 'export const up = () => {}');

    const discovered = discoverPluginMigrations(
      [
        {
          id: 'test-plugin',
          version: '1.0.0',
          migrationDir,
        },
      ],
      process.cwd()
    );

    expect(discovered[0].migrationId).toContain('20260701010000_a');
    expect(discovered[1].migrationId).toContain('20260701010100_b');

    expect(() =>
      ensureUniqueMigrationIds([
        discovered[0],
        {
          ...discovered[0],
        },
      ])
    ).toThrow(/Duplicate plugin migration ID/);
  });

  it('detects checksum mismatch for already-applied migration', () => {
    const migrations = [
      {
        pluginId: 'test-plugin',
        pluginVersion: '1.0.0',
        migrationId: 'test-plugin:20260701010000_init',
        file: '20260701010000_init.ts',
        absolutePath: '/tmp/20260701010000_init.ts',
        checksum: 'new-checksum',
      },
    ];

    const applied = new Map<string, string>([['test-plugin:20260701010000_init', 'old-checksum']]);

    expect(() => ensureChecksumsUnchanged(migrations, applied)).toThrow(/Checksum mismatch/);
  });

  it('ensures core modules do not import URL shortener implementation directly', () => {
    const coreDir = path.join(process.cwd(), 'src/core');
    const stack = [coreDir];
    const violations: string[] = [];

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) {
        continue;
      }

      for (const entry of fs.readdirSync(current)) {
        const fullPath = path.join(current, entry);
        const stats = fs.statSync(fullPath);

        if (stats.isDirectory()) {
          stack.push(fullPath);
          continue;
        }

        if (!fullPath.endsWith('.ts') && !fullPath.endsWith('.tsx')) {
          continue;
        }

        if (fullPath.endsWith('.test.ts') || fullPath.endsWith('.test.tsx')) {
          continue;
        }

        const contents = fs.readFileSync(fullPath, 'utf8');
        if (contents.includes('plugins/url-shortener')) {
          violations.push(fullPath);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
