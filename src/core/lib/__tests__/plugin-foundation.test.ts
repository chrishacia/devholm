import fs from 'fs';
import os from 'os';
import path from 'path';
import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';
import type { DevholmPluginManifest } from '@core/types/plugins';
import {
  isVersionCompatible,
  validateManifest,
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

    expect(errors.some((error) => error.includes('transitive-only or missing'))).toBe(true);
  });

  it('enforces production dependency runtime package policy', () => {
    const manifests = [
      createManifest({
        dependencies: {
          packages: {
            zod: '^3.20.0',
            semver: '^7.0.0',
            tsx: '^4.0.0',
            'transitive-only': '^1.0.0',
            malformed: '^1.0.0',
          },
        },
      }),
    ];

    const errors = validatePackageDependenciesForManifests(
      manifests,
      {
        zod: '3.23.0',
        semver: '6.0.0',
        tsx: '4.21.0',
        malformed: 'x.y.z',
      },
      {
        zod: '^3.23.0',
        semver: '^7.8.0',
      },
      {
        tsx: '^4.21.0',
      }
    );

    expect(errors.some((error) => error.includes('requires semver@^7.0.0 but found 6.0.0'))).toBe(
      true
    );
    expect(
      errors.some((error) =>
        error.includes('requires tsx in production dependencies but it is only in devDependencies')
      )
    ).toBe(true);
    expect(
      errors.some((error) =>
        error.includes(
          'requires transitive-only in production dependencies but it is transitive-only or missing'
        )
      )
    ).toBe(true);
    expect(
      errors.some((error) => error.includes('requires malformed in production dependencies'))
    ).toBe(true);
  });

  it('rejects invalid manifest fields across the validation matrix', () => {
    const invalidManifest = {
      id: 'plugin-a',
      name: 'Plugin A',
      version: 'bad-version',
      devholmVersion: 'bad-range',
      enablementSettingKey: 'plugin:plugin-a:wrong-key',
      dependencies: {
        plugins: { 'plugin-b': 'not-a-range' },
        packages: { semver: 'not-a-range' },
      },
      migrations: [
        { id: 'bad-id', file: 'migrations/a.ts' },
        { id: 'bad-id', file: 'migrations/a.ts' },
      ],
      settings: [
        { key: 'plugin:plugin-a:one', type: 'string', defaultValue: 1 },
        { key: 'plugin:plugin-a:one', type: 'string', defaultValue: 'ok' },
        { key: 'not-namespaced', type: 'boolean', defaultValue: true },
      ],
      publicRouteExtensionIds: ['a', 'a'],
      adminPageHrefs: ['/admin/a', '/admin/a'],
      lifecycle: {
        afterInstall: 'not-a-function',
      },
    } as unknown as DevholmPluginManifest;

    const errors = validateManifest(invalidManifest);
    expect(errors.some((error) => error.includes('manifest.version must be valid semver'))).toBe(
      true
    );
    expect(
      errors.some((error) => error.includes('must exactly equal plugin:plugin-a:enabled'))
    ).toBe(true);
    expect(errors.some((error) => error.includes('duplicate migration id'))).toBe(true);
    expect(errors.some((error) => error.includes('duplicate migration file'))).toBe(true);
    expect(errors.some((error) => error.includes('must be declared under db/migrations/'))).toBe(
      true
    );
    expect(errors.some((error) => error.includes('duplicate setting key'))).toBe(true);
    expect(
      errors.some((error) => error.includes('must be namespaced under plugin:plugin-a:'))
    ).toBe(true);
    expect(errors.some((error) => error.includes('defaultValue must be string'))).toBe(true);
    expect(errors.some((error) => error.includes('duplicate public route extension id'))).toBe(
      true
    );
    expect(errors.some((error) => error.includes('duplicate admin page href'))).toBe(true);
    expect(
      errors.some((error) => error.includes('lifecycle.afterInstall must be a function'))
    ).toBe(true);
    expect(errors.some((error) => error.includes('invalid plugin dependency range'))).toBe(true);
    expect(errors.some((error) => error.includes('invalid runtime package range'))).toBe(true);

    const listErrors = validatePluginManifestList([invalidManifest]);
    expect(listErrors.some((error) => error.includes('invalid devholmVersion range'))).toBe(true);
  });

  it('discovers plugin-local migrations from shared registry and production paths metadata', () => {
    const registryPath = path.join(process.cwd(), 'generated/plugins/registry.json');
    const entries = loadPluginMigrationRegistry(registryPath);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.some((entry) => entry.id === 'url-shortener')).toBe(true);
    expect(entries.some((entry) => entry.migrations.length > 0)).toBe(true);

    const migrations = discoverPluginMigrations(entries, process.cwd());
    expect(migrations.some((migration) => migration.migrationId.includes('url-shortener:'))).toBe(
      true
    );
  });

  it('orders migrations deterministically and rejects duplicate IDs', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devholm-plugin-migrations-'));
    const migrationDir = path.join(tempDir, 'generated/plugins/test-plugin/migrations');
    fs.mkdirSync(migrationDir, { recursive: true });

    const fileA = path.join(migrationDir, '20260701010000_a.ts');
    const fileB = path.join(migrationDir, '20260701010100_b.ts');
    fs.writeFileSync(fileB, 'export const up = () => {}');
    fs.writeFileSync(fileA, 'export const up = () => {}');

    const checksumA = createHash('sha256').update(fs.readFileSync(fileA, 'utf8')).digest('hex');
    const checksumB = createHash('sha256').update(fs.readFileSync(fileB, 'utf8')).digest('hex');

    const discovered = discoverPluginMigrations(
      [
        {
          id: 'test-plugin',
          version: '1.0.0',
          migrationDir: 'generated/plugins/test-plugin/migrations',
          migrations: [
            {
              id: 'test-plugin:20260701010000_a',
              file: 'test-plugin/migrations/20260701010000_a.ts',
              checksum: checksumA,
            },
            {
              id: 'test-plugin:20260701010100_b',
              file: 'test-plugin/migrations/20260701010100_b.ts',
              checksum: checksumB,
            },
          ],
        },
      ],
      tempDir
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

    const allowedViolations = [path.join(process.cwd(), 'src/core/db/settings.ts')];
    expect(violations).toEqual(allowedViolations);
  });
});
