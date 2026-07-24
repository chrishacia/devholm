/** @vitest-environment node */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { createHash } from 'crypto';
import knex, { type Knex } from 'knex';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  URL_SHORTENER_CAPABILITY_ADMIN_MANAGEMENT,
  URL_SHORTENER_ENABLEMENT_KEY,
  URL_SHORTENER_LEGACY_PREFIX_ENABLED_KEY,
  URL_SHORTENER_PERMISSION_ADMIN_MANAGE,
  URL_SHORTENER_PUBLIC_CREATION_MODE_KEY,
  URL_SHORTENER_ROUTE_PREFIX_KEY,
} from '@user/extensions/plugins/url-shortener/constants';
import { validateRoutePrefix } from '@user/extensions/plugins/url-shortener/validation/prefix-validation';
import {
  discoverPluginMigrations,
  resolvePluginRegistryPath,
} from '@core/lib/plugin-migration-discovery.server';
import { validateDependencyGraphForManifests } from '@core/lib/plugin-registry.server';
import type { DevholmPluginManifest } from '@core/types/plugins';

const TEST_DB_SUFFIX = `_phase2_it_${process.pid}`;
const PLUGIN_TABLES = [
  'u_url_shortener_prefix_aliases',
  'u_url_shortener_audit_records',
  'u_url_shortener_public_submissions',
  'u_url_shortener_daily_stats',
  'u_url_shortener_click_events',
  'u_url_shortener_links',
] as const;

let adminDb: Knex;
let integrationDb: Knex;
let integrationDbUrl = '';
let integrationDbName = '';
let baseDatabaseUrl = '';

const configuredTestDbUrl = process.env.PHASE2_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const integrationRequired = process.env.PHASE2_REQUIRE_POSTGRES_INTEGRATION === 'true';
const shouldRunPostgresIntegration = Boolean(configuredTestDbUrl);

if (integrationRequired && !configuredTestDbUrl) {
  throw new Error(
    'PostgreSQL lifecycle integration is required but no test database URL is configured'
  );
}

function requireBaseDatabaseUrl(): string {
  if (!configuredTestDbUrl) {
    throw new Error(
      'plugin-lifecycle-postgres.integration.test requires PHASE2_TEST_DATABASE_URL or DATABASE_URL'
    );
  }

  return configuredTestDbUrl;
}

function withDatabaseName(urlValue: string, dbName: string): string {
  const parsed = new URL(urlValue);
  parsed.pathname = `/${dbName}`;
  return parsed.toString();
}

function getDatabaseName(urlValue: string): string {
  const parsed = new URL(urlValue);
  return parsed.pathname.replace(/^\//u, '') || 'postgres';
}

async function closeModuleDb(): Promise<void> {
  try {
    vi.resetModules();
    const dbModule = await import('@/db');
    await dbModule.closeDb();
  } catch {
    // ignore during cleanup paths
  }
}

async function importLifecycleModule(mocks?: () => void) {
  await closeModuleDb();
  vi.clearAllMocks();
  vi.resetModules();
  vi.doUnmock('@core/lib/plugin-migration-runner.server');
  vi.doUnmock('@core/lib/plugin-registry.server');
  vi.doUnmock('@user/extensions/plugins/registry');

  if (mocks) {
    mocks();
  }

  return import('@core/lib/plugin-lifecycle.server');
}

async function migrateCoreAndUserSchemas(db: Knex): Promise<void> {
  await db.migrate.latest({
    directory: [
      path.join(process.cwd(), 'src/core/db/migrations'),
      path.join(process.cwd(), 'src/user/extensions/db/migrations'),
    ],
    tableName: 'knex_migrations',
    loadExtensions: ['.ts'],
  });
}

async function pluginTableExists(tableName: string): Promise<boolean> {
  const row = await integrationDb.raw<{ rows: Array<{ exists: boolean }> }>(
    'select exists(select 1 from information_schema.tables where table_schema = ? and table_name = ?) as exists',
    ['public', tableName]
  );

  return Boolean(row.rows[0]?.exists);
}

async function dropPluginDomainTables(): Promise<void> {
  for (const tableName of PLUGIN_TABLES) {
    await integrationDb.raw(`DROP TABLE IF EXISTS ${tableName} CASCADE`);
  }

  await integrationDb.raw('DROP TYPE IF EXISTS u_url_shortener_submission_status');
}

async function resetLifecycleState(): Promise<void> {
  await integrationDb('devholm_plugin_migrations').del();
  await integrationDb('devholm_plugins').del();
  await integrationDb('site_settings').where('key', 'like', 'plugin:%').del();
}

async function readPluginRow(pluginId = 'url-shortener') {
  return integrationDb('devholm_plugins').where({ plugin_id: pluginId }).first();
}

function makeManifest(overrides: Partial<DevholmPluginManifest> = {}): DevholmPluginManifest {
  return {
    id: 'url-shortener',
    name: 'URL Shortener',
    version: '0.1.0',
    enablementSettingKey: 'plugin:url-shortener:enabled',
    dependencies: { plugins: {}, packages: {} },
    permissions: [
      {
        key: URL_SHORTENER_PERMISSION_ADMIN_MANAGE,
        capability: URL_SHORTENER_CAPABILITY_ADMIN_MANAGEMENT,
        scope: 'admin',
        description: 'Manage URL shortener lifecycle operations in tests.',
        runtimeOwner: 'plugin-extension',
      },
    ],
    lifecycleAuthorization: {
      capability: URL_SHORTENER_CAPABILITY_ADMIN_MANAGEMENT,
      permissionKeys: [URL_SHORTENER_PERMISSION_ADMIN_MANAGE],
    },
    settings: [
      { key: URL_SHORTENER_ROUTE_PREFIX_KEY, type: 'string', defaultValue: '/s' },
      {
        key: URL_SHORTENER_PUBLIC_CREATION_MODE_KEY,
        type: 'string',
        defaultValue: 'admin-only',
      },
      {
        key: URL_SHORTENER_LEGACY_PREFIX_ENABLED_KEY,
        type: 'boolean',
        defaultValue: false,
      },
    ],
    ...overrides,
  };
}

const postgresIntegrationDescribe = shouldRunPostgresIntegration
  ? describe.sequential
  : describe.skip;

postgresIntegrationDescribe('plugin lifecycle PostgreSQL integration', () => {
  beforeAll(async () => {
    baseDatabaseUrl = requireBaseDatabaseUrl();
    integrationDbName = `${getDatabaseName(baseDatabaseUrl)}${TEST_DB_SUFFIX}`;
    integrationDbUrl = withDatabaseName(baseDatabaseUrl, integrationDbName);

    const adminUrl = withDatabaseName(baseDatabaseUrl, 'postgres');
    adminDb = knex({
      client: 'pg',
      connection: adminUrl,
      pool: { min: 0, max: 2 },
    });

    await adminDb.raw(
      `SELECT pg_terminate_backend(pid)
       FROM pg_stat_activity
       WHERE datname = ? AND pid <> pg_backend_pid()`,
      [integrationDbName]
    );
    await adminDb.raw(`DROP DATABASE IF EXISTS "${integrationDbName}"`);
    await adminDb.raw(`CREATE DATABASE "${integrationDbName}"`);

    integrationDb = knex({
      client: 'pg',
      connection: integrationDbUrl,
      pool: { min: 0, max: 4 },
    });

    process.env.DATABASE_URL = integrationDbUrl;
    Object.assign(process.env, { NODE_ENV: 'development' });

    await migrateCoreAndUserSchemas(integrationDb);
  });

  afterAll(async () => {
    await closeModuleDb();
    if (integrationDb) {
      await integrationDb.destroy();
    }

    if (adminDb) {
      await adminDb.raw(
        `SELECT pg_terminate_backend(pid)
         FROM pg_stat_activity
         WHERE datname = ? AND pid <> pg_backend_pid()`,
        [integrationDbName]
      );
      await adminDb.raw(`DROP DATABASE IF EXISTS "${integrationDbName}"`);
      await adminDb.destroy();
    }
  });

  beforeEach(async () => {
    await closeModuleDb();
    await dropPluginDomainTables();
    await resetLifecycleState();
  });

  it('1) bundled/uninstalled URL shortener remains inactive', async () => {
    const { getPluginState } = await import('@core/db/plugins');

    const state = await getPluginState('url-shortener');

    expect(state?.bundled).toBe(true);
    expect(state?.installed).toBe(false);
    expect(state?.isEnabled).toBe(false);
    expect(state?.lifecycleState).toBe('bundled');
  });

  it('2) core migration setup creates no URL shortener domain tables', async () => {
    expect(await pluginTableExists('u_url_shortener_links')).toBe(false);
    expect(await pluginTableExists('u_url_shortener_click_events')).toBe(false);
  });

  it('3) successful install', async () => {
    const { installPlugin } = await importLifecycleModule();

    await installPlugin('url-shortener');

    expect(await pluginTableExists('u_url_shortener_links')).toBe(true);
    const row = await readPluginRow();
    expect(row.lifecycle_state).toBe('installed');
    expect(row.enabled).toBe(false);
  });

  it('4) migration failure records error state and remains disabled', async () => {
    const { installPlugin } = await importLifecycleModule(() => {
      vi.doMock('@core/lib/plugin-migration-runner.server', async () => {
        const actual = await vi.importActual<
          typeof import('@core/lib/plugin-migration-runner.server')
        >('@core/lib/plugin-migration-runner.server');
        return {
          ...actual,
          applyPendingPluginMigrations: vi.fn(async () => {
            throw new Error('forced migration failure');
          }),
        };
      });
    });

    await expect(installPlugin('url-shortener')).rejects.toThrow(/forced migration failure/);

    const row = await readPluginRow();
    expect(row.lifecycle_state).toBe('bundled');
    expect(row.operation_status).toBe('error');
    expect(row.enabled).toBe(false);
  });

  it('5) afterInstall failure records error state', async () => {
    const { installPlugin } = await importLifecycleModule(() => {
      vi.doMock('@core/lib/plugin-registry.server', async () => {
        const actual = await vi.importActual<typeof import('@core/lib/plugin-registry.server')>(
          '@core/lib/plugin-registry.server'
        );

        const failingManifest = makeManifest({
          lifecycle: {
            afterInstall: async () => {
              throw new Error('forced afterInstall failure');
            },
          },
        });

        return {
          ...actual,
          getBundledPluginManifests: () => [failingManifest],
          validateBundledPluginRegistry: () => [],
          validateDependencyGraph: () => [],
          validatePackageDependencies: () => [],
        };
      });
    });

    await expect(installPlugin('url-shortener')).rejects.toThrow(/afterInstall failure/);
    const row = await readPluginRow();
    expect(row.lifecycle_state).toBe('bundled');
    expect(row.operation_status).toBe('error');
    expect(row.enabled).toBe(false);
  });

  it('6) install does not prematurely enable plugin', async () => {
    const { installPlugin } = await importLifecycleModule();

    await installPlugin('url-shortener');

    const row = await readPluginRow();
    expect(row.enabled).toBe(false);
    const setting = await integrationDb('site_settings')
      .where({ key: URL_SHORTENER_ENABLEMENT_KEY })
      .first();
    expect(setting).toBeUndefined();
  });

  it('7) successful upgrade updates version and timestamp', async () => {
    const { installPlugin } = await importLifecycleModule();
    await installPlugin('url-shortener');

    const { upgradePlugin } = await importLifecycleModule(() => {
      vi.doMock('@core/lib/plugin-migration-runner.server', async () => {
        const actual = await vi.importActual<
          typeof import('@core/lib/plugin-migration-runner.server')
        >('@core/lib/plugin-migration-runner.server');
        return {
          ...actual,
          applyPendingPluginMigrations: vi.fn(async () => undefined),
        };
      });

      vi.doMock('@core/lib/plugin-registry.server', async () => {
        const actual = await vi.importActual<typeof import('@core/lib/plugin-registry.server')>(
          '@core/lib/plugin-registry.server'
        );

        const upgradedManifest = makeManifest({
          version: '0.2.0',
          lifecycle: {
            afterUpgrade: async () => undefined,
          },
        });

        return {
          ...actual,
          getBundledPluginManifests: () => [upgradedManifest],
          validateBundledPluginRegistry: () => [],
          validateDependencyGraph: () => [],
          validatePackageDependencies: () => [],
        };
      });
    });

    await upgradePlugin('url-shortener');
    const row = await readPluginRow();
    expect(row.installed_version).toBe('0.2.0');
    expect(row.upgraded_at).not.toBeNull();
  });

  it('8) failed upgrade preserves previous version and enabled state', async () => {
    const { installPlugin, enablePlugin } = await importLifecycleModule();
    await installPlugin('url-shortener');
    await enablePlugin('url-shortener');

    const before = await readPluginRow();

    const { upgradePlugin } = await importLifecycleModule(() => {
      vi.doMock('@core/lib/plugin-migration-runner.server', async () => {
        const actual = await vi.importActual<
          typeof import('@core/lib/plugin-migration-runner.server')
        >('@core/lib/plugin-migration-runner.server');
        return {
          ...actual,
          applyPendingPluginMigrations: vi.fn(async () => undefined),
        };
      });

      vi.doMock('@core/lib/plugin-registry.server', async () => {
        const actual = await vi.importActual<typeof import('@core/lib/plugin-registry.server')>(
          '@core/lib/plugin-registry.server'
        );

        const upgradedManifest = makeManifest({
          version: '0.9.0',
          lifecycle: {
            afterUpgrade: async () => {
              throw new Error('forced upgrade failure');
            },
          },
        });

        return {
          ...actual,
          getBundledPluginManifests: () => [upgradedManifest],
          validateBundledPluginRegistry: () => [],
          validateDependencyGraph: () => [],
          validatePackageDependencies: () => [],
        };
      });
    });

    await expect(upgradePlugin('url-shortener')).rejects.toThrow(/forced upgrade failure/);

    const after = await readPluginRow();
    expect(after.installed_version).toBe(before.installed_version);
    expect(after.enabled).toBe(before.enabled);
    expect(after.last_error).toMatch(/forced upgrade failure/);
  });

  it('9) missing dependency blocks install', async () => {
    const { installPlugin } = await importLifecycleModule(() => {
      vi.doMock('@core/lib/plugin-registry.server', async () => {
        const actual = await vi.importActual<typeof import('@core/lib/plugin-registry.server')>(
          '@core/lib/plugin-registry.server'
        );

        return {
          ...actual,
          getBundledPluginManifests: () => [
            makeManifest({
              dependencies: { plugins: { 'plugin-missing': '^1.0.0' }, packages: {} },
            }),
          ],
          validateBundledPluginRegistry: () => [],
          validateDependencyGraph: () => [],
          validatePackageDependencies: () => [],
        };
      });
    });

    await expect(installPlugin('url-shortener')).rejects.toThrow(/not bundled|not installed/);
  });

  it('10) incompatible installed dependency version blocks install', async () => {
    await integrationDb('devholm_plugins').insert({
      plugin_id: 'dependency-a',
      bundled_version: '1.0.0',
      installed_version: '1.0.0',
      enabled: true,
      lifecycle_state: 'installed',
      operation_status: 'idle',
      installed_at: new Date(),
      upgraded_at: null,
      disabled_at: null,
      last_error: null,
      manifest_checksum: null,
      updated_at: new Date(),
    });

    const { installPlugin } = await importLifecycleModule(() => {
      vi.doMock('@core/lib/plugin-registry.server', async () => {
        const actual = await vi.importActual<typeof import('@core/lib/plugin-registry.server')>(
          '@core/lib/plugin-registry.server'
        );

        return {
          ...actual,
          getBundledPluginManifests: () => [
            makeManifest({
              dependencies: {
                plugins: {
                  'dependency-a': '^2.0.0',
                },
                packages: {},
              },
            }),
            {
              id: 'dependency-a',
              name: 'Dependency A',
              version: '2.0.0',
              enablementSettingKey: 'plugin:dependency-a:enabled',
            } as DevholmPluginManifest,
          ],
          validateBundledPluginRegistry: () => [],
          validateDependencyGraph: () => [],
          validatePackageDependencies: () => [],
        };
      });
    });

    await expect(installPlugin('url-shortener')).rejects.toThrow(/does not satisfy/);
  });

  it('11) dependency cycle detection rejects cyclic manifests', async () => {
    const errors = validateDependencyGraphForManifests([
      {
        id: 'plugin-a',
        name: 'Plugin A',
        version: '1.0.0',
        enablementSettingKey: 'plugin:plugin-a:enabled',
        dependencies: { plugins: { 'plugin-b': '^1.0.0' } },
      },
      {
        id: 'plugin-b',
        name: 'Plugin B',
        version: '1.0.0',
        enablementSettingKey: 'plugin:plugin-b:enabled',
        dependencies: { plugins: { 'plugin-a': '^1.0.0' } },
      },
    ]);

    expect(errors.some((item) => item.includes('cycle'))).toBe(true);
  });

  it('12) checksum mismatch is rejected before migration execution', async () => {
    const migrationId = 'url-shortener:20260701010000_url_shortener_foundation';

    await integrationDb('devholm_plugins').insert({
      plugin_id: 'url-shortener',
      bundled_version: '0.0.1',
      installed_version: '0.0.1',
      enabled: false,
      lifecycle_state: 'installed',
      operation_status: 'idle',
      installed_at: new Date(),
      upgraded_at: null,
      disabled_at: null,
      last_error: null,
      manifest_checksum: null,
      updated_at: new Date(),
    });

    await integrationDb('devholm_plugin_migrations').insert({
      plugin_id: 'url-shortener',
      migration_id: migrationId,
      plugin_version: '0.0.1',
      checksum: 'bad-checksum',
      applied_at: new Date(),
      execution_duration_ms: 1,
      batch_order: 1,
      created_at: new Date(),
    });

    const { installPlugin } = await importLifecycleModule();

    await expect(installPlugin('url-shortener')).rejects.toThrow(/Checksum mismatch/);
    expect(await pluginTableExists('u_url_shortener_links')).toBe(false);
  });

  it('13) duplicate migration filename across plugins does not collide', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase2-dupe-migrations-'));
    const pluginADir = path.join(tempDir, 'generated/plugins/plugin-a/migrations');
    const pluginBDir = path.join(tempDir, 'generated/plugins/plugin-b/migrations');
    fs.mkdirSync(pluginADir, { recursive: true });
    fs.mkdirSync(pluginBDir, { recursive: true });
    fs.writeFileSync(
      path.join(pluginADir, '20260101000000_init.ts'),
      'export const up = async () => {}'
    );
    fs.writeFileSync(
      path.join(pluginBDir, '20260101000000_init.ts'),
      'export const up = async () => {}'
    );

    const checksumA = createHash('sha256')
      .update(fs.readFileSync(path.join(pluginADir, '20260101000000_init.ts'), 'utf8'))
      .digest('hex');
    const checksumB = createHash('sha256')
      .update(fs.readFileSync(path.join(pluginBDir, '20260101000000_init.ts'), 'utf8'))
      .digest('hex');

    const migrations = discoverPluginMigrations(
      [
        {
          id: 'plugin-a',
          version: '1.0.0',
          migrationDir: 'generated/plugins/plugin-a/migrations',
          migrations: [
            {
              id: 'plugin-a:20260101000000_init',
              file: 'plugin-a/migrations/20260101000000_init.ts',
              checksum: checksumA,
            },
          ],
        },
        {
          id: 'plugin-b',
          version: '1.0.0',
          migrationDir: 'generated/plugins/plugin-b/migrations',
          migrations: [
            {
              id: 'plugin-b:20260101000000_init',
              file: 'plugin-b/migrations/20260101000000_init.ts',
              checksum: checksumB,
            },
          ],
        },
      ],
      tempDir
    );

    const ids = migrations.map((item) => item.migrationId).sort();
    expect(ids).toEqual(['plugin-a:20260101000000_init', 'plugin-b:20260101000000_init']);
  });

  it('14) concurrent same-plugin install executes lifecycle once', async () => {
    const applySpy = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 120));
    });
    const hookSpy = vi.fn(async () => undefined);

    const { installPlugin } = await importLifecycleModule(() => {
      vi.doMock('@core/lib/plugin-migration-runner.server', async () => {
        const actual = await vi.importActual<
          typeof import('@core/lib/plugin-migration-runner.server')
        >('@core/lib/plugin-migration-runner.server');
        return {
          ...actual,
          applyPendingPluginMigrations: applySpy,
        };
      });

      vi.doMock('@core/lib/plugin-registry.server', async () => {
        const actual = await vi.importActual<typeof import('@core/lib/plugin-registry.server')>(
          '@core/lib/plugin-registry.server'
        );
        return {
          ...actual,
          getBundledPluginManifests: () => [
            makeManifest({
              lifecycle: {
                afterInstall: hookSpy,
              },
            }),
          ],
          validateBundledPluginRegistry: () => [],
          validateDependencyGraph: () => [],
          validatePackageDependencies: () => [],
        };
      });
    });

    await Promise.all([installPlugin('url-shortener'), installPlugin('url-shortener')]);

    expect(applySpy).toHaveBeenCalledTimes(1);
    expect(hookSpy).toHaveBeenCalledTimes(1);
  });

  it('15) install writes all declared defaults', async () => {
    const { installPlugin } = await importLifecycleModule();
    await installPlugin('url-shortener');

    const settings = await integrationDb('site_settings')
      .whereIn('key', [
        URL_SHORTENER_ROUTE_PREFIX_KEY,
        URL_SHORTENER_PUBLIC_CREATION_MODE_KEY,
        URL_SHORTENER_LEGACY_PREFIX_ENABLED_KEY,
      ])
      .select('key', 'value');

    const byKey = new Map(settings.map((row) => [row.key as string, row.value as string]));
    expect(byKey.get(URL_SHORTENER_ROUTE_PREFIX_KEY)).toBe('/s');
    expect(byKey.get(URL_SHORTENER_PUBLIC_CREATION_MODE_KEY)).toBe('admin-only');
    expect(byKey.get(URL_SHORTENER_LEGACY_PREFIX_ENABLED_KEY)).toBe('false');

    const legacyEnablement = await integrationDb('site_settings')
      .where({ key: URL_SHORTENER_ENABLEMENT_KEY })
      .first();
    expect(legacyEnablement).toBeUndefined();
  });

  it('16) user setting is preserved during upgrade and missing default is added', async () => {
    const { installPlugin } = await importLifecycleModule();
    await installPlugin('url-shortener');

    await integrationDb('site_settings').where({ key: URL_SHORTENER_ROUTE_PREFIX_KEY }).update({
      value: '/custom',
      updated_at: new Date(),
    });

    const { upgradePlugin } = await importLifecycleModule(() => {
      vi.doMock('@core/lib/plugin-migration-runner.server', async () => {
        const actual = await vi.importActual<
          typeof import('@core/lib/plugin-migration-runner.server')
        >('@core/lib/plugin-migration-runner.server');
        return {
          ...actual,
          applyPendingPluginMigrations: vi.fn(async () => undefined),
        };
      });

      vi.doMock('@core/lib/plugin-registry.server', async () => {
        const actual = await vi.importActual<typeof import('@core/lib/plugin-registry.server')>(
          '@core/lib/plugin-registry.server'
        );

        return {
          ...actual,
          getBundledPluginManifests: () => [
            makeManifest({
              version: '0.2.0',
              settings: [
                {
                  key: URL_SHORTENER_ROUTE_PREFIX_KEY,
                  type: 'string',
                  defaultValue: '/s',
                },
                {
                  key: 'plugin:url-shortener:new-default',
                  type: 'string',
                  defaultValue: 'x',
                },
              ],
            }),
          ],
          validateBundledPluginRegistry: () => [],
          validateDependencyGraph: () => [],
          validatePackageDependencies: () => [],
        };
      });
    });

    await upgradePlugin('url-shortener');

    const preserved = await integrationDb('site_settings')
      .where({ key: URL_SHORTENER_ROUTE_PREFIX_KEY })
      .first();
    const added = await integrationDb('site_settings')
      .where({ key: 'plugin:url-shortener:new-default' })
      .first();

    expect(preserved.value).toBe('/custom');
    expect(added.value).toBe('x');
  });

  it('16b) route-prefix setting update rejects conflicts with enabled plugin prefixes', async () => {
    const { installPlugin } = await importLifecycleModule();
    await installPlugin('url-shortener');

    await integrationDb('site_settings').insert({
      key: 'plugin:other-plugin:route-prefix',
      value: '/go',
      type: 'string',
      category: 'plugins',
      description: 'other plugin route prefix',
      updated_at: new Date(),
    });
    await integrationDb('devholm_plugins').insert({
      plugin_id: 'other-plugin',
      bundled_version: '1.0.0',
      installed_version: '1.0.0',
      enabled: true,
      lifecycle_state: 'installed',
      operation_status: 'idle',
      installed_at: new Date(),
      upgraded_at: null,
      disabled_at: null,
      last_error: null,
      manifest_checksum: null,
      updated_at: new Date(),
    });

    const { updateSetting } = await import('@core/db/settings');
    await expect(updateSetting(URL_SHORTENER_ROUTE_PREFIX_KEY, '/go')).rejects.toThrow(/collides/);

    const current = await integrationDb('site_settings')
      .where({ key: URL_SHORTENER_ROUTE_PREFIX_KEY })
      .first();
    expect(current.value).toBe('/s');
  });

  it('16c) route-prefix setting update rejects conflicts with active aliases', async () => {
    const { installPlugin } = await importLifecycleModule();
    await installPlugin('url-shortener');

    await integrationDb('u_url_shortener_prefix_aliases').insert({
      prefix: '/legacy',
      is_active: true,
      starts_at: new Date(),
    });

    const { updateSetting } = await import('@core/db/settings');
    await expect(updateSetting(URL_SHORTENER_ROUTE_PREFIX_KEY, '/legacy')).rejects.toThrow(
      /collides/
    );

    const current = await integrationDb('site_settings')
      .where({ key: URL_SHORTENER_ROUTE_PREFIX_KEY })
      .first();
    expect(current.value).toBe('/s');
  });

  it('17) timestamp transitions are coherent across install-enable-disable-upgrade', async () => {
    const { installPlugin, enablePlugin, disablePlugin } = await importLifecycleModule();
    await installPlugin('url-shortener');
    const installed = await readPluginRow();

    await enablePlugin('url-shortener');
    const enabled = await readPluginRow();

    const { upgradePlugin } = await importLifecycleModule(() => {
      vi.doMock('@core/lib/plugin-migration-runner.server', async () => {
        const actual = await vi.importActual<
          typeof import('@core/lib/plugin-migration-runner.server')
        >('@core/lib/plugin-migration-runner.server');
        return {
          ...actual,
          applyPendingPluginMigrations: vi.fn(async () => undefined),
        };
      });

      vi.doMock('@core/lib/plugin-registry.server', async () => {
        const actual = await vi.importActual<typeof import('@core/lib/plugin-registry.server')>(
          '@core/lib/plugin-registry.server'
        );
        return {
          ...actual,
          getBundledPluginManifests: () => [makeManifest({ version: '0.2.0' })],
          validateBundledPluginRegistry: () => [],
          validateDependencyGraph: () => [],
          validatePackageDependencies: () => [],
        };
      });
    });

    await upgradePlugin('url-shortener');
    await disablePlugin('url-shortener');
    const final = await readPluginRow();

    expect(installed.installed_at).not.toBeNull();
    expect(enabled.disabled_at).toBeNull();
    expect(final.upgraded_at).not.toBeNull();
    expect(final.disabled_at).not.toBeNull();
    expect(new Date(final.updated_at).getTime()).toBeGreaterThanOrEqual(
      new Date(installed.updated_at).getTime()
    );
  });

  it('18) disable preserves URL shortener data', async () => {
    const { installPlugin, disablePlugin } = await importLifecycleModule();
    await installPlugin('url-shortener');

    await integrationDb('u_url_shortener_links').insert({
      code: 'keep1',
      destination_url: 'https://example.com',
      redirect_status_code: 302,
    });

    await disablePlugin('url-shortener');

    const count = await integrationDb('u_url_shortener_links')
      .count<{ count: string }>('id as count')
      .first();
    expect(Number(count?.count ?? '0')).toBe(1);
  });

  it('19) uninstall preserves URL shortener data', async () => {
    const { installPlugin, uninstallPlugin } = await importLifecycleModule();
    await installPlugin('url-shortener');

    await integrationDb('u_url_shortener_links').insert({
      code: 'keep2',
      destination_url: 'https://example.com/2',
      redirect_status_code: 302,
    });

    await uninstallPlugin('url-shortener');

    const count = await integrationDb('u_url_shortener_links')
      .count<{ count: string }>('id as count')
      .first();
    expect(Number(count?.count ?? '0')).toBe(1);
  });

  it('20) purge is rejected while plugin is enabled', async () => {
    const { installPlugin, enablePlugin, purgePlugin } = await importLifecycleModule();
    await installPlugin('url-shortener');
    await enablePlugin('url-shortener');

    await expect(
      purgePlugin('url-shortener', { confirmPluginId: 'url-shortener', initiatedBy: 'integration' })
    ).rejects.toThrow(/must be disabled or uninstalled/);
  });

  it('21) purge is rejected without confirmation', async () => {
    const { installPlugin, disablePlugin, purgePlugin } = await importLifecycleModule();
    await installPlugin('url-shortener');
    await disablePlugin('url-shortener');

    await expect(purgePlugin('url-shortener')).rejects.toThrow(/Purge confirmation required/);
  });

  it('22) purge removes plugin schema and supports reinstall while preserving unrelated data', async () => {
    const { installPlugin, disablePlugin, purgePlugin } = await importLifecycleModule(() => {
      vi.doMock('@core/lib/plugin-registry.server', async () => {
        const actual = await vi.importActual<typeof import('@core/lib/plugin-registry.server')>(
          '@core/lib/plugin-registry.server'
        );
        const { urlShortenerPurge } = await import(
          '@user/extensions/plugins/url-shortener/lifecycle/hooks'
        );

        return {
          ...actual,
          getBundledPluginManifests: () => [
            makeManifest({
              lifecycle: {
                purge: urlShortenerPurge,
              },
            }),
          ],
          validateBundledPluginRegistry: () => [],
          validateDependencyGraph: () => [],
          validatePackageDependencies: () => [],
        };
      });
    });
    await installPlugin('url-shortener');
    await disablePlugin('url-shortener');

    await integrationDb.raw(
      'CREATE TABLE IF NOT EXISTS u_test_other_plugin_data(id serial primary key, value text)'
    );
    await integrationDb('u_test_other_plugin_data').insert({ value: 'persist' });

    await integrationDb('u_url_shortener_links').insert({
      code: 'purge-target',
      destination_url: 'https://example.com/purge',
      redirect_status_code: 302,
    });

    await purgePlugin('url-shortener', {
      confirmPluginId: 'url-shortener',
      initiatedBy: 'integration',
    });

    expect(await pluginTableExists('u_url_shortener_links')).toBe(false);
    expect(await pluginTableExists('u_url_shortener_click_events')).toBe(false);
    expect(await pluginTableExists('u_url_shortener_daily_stats')).toBe(false);
    expect(await pluginTableExists('u_url_shortener_public_submissions')).toBe(false);
    expect(await pluginTableExists('u_url_shortener_audit_records')).toBe(false);
    expect(await pluginTableExists('u_url_shortener_prefix_aliases')).toBe(false);

    const postPurgeRow = await readPluginRow();
    expect(postPurgeRow.lifecycle_state).toBe('bundled');
    expect(postPurgeRow.operation_status).toBe('idle');
    expect(postPurgeRow.installed_version).toBeNull();

    const migrationLedgerCount = await integrationDb('devholm_plugin_migrations')
      .where({ plugin_id: 'url-shortener' })
      .count<{ count: string }>('id as count')
      .first();
    expect(Number(migrationLedgerCount?.count ?? '0')).toBe(0);

    const settingCount = await integrationDb('site_settings')
      .where('key', 'like', 'plugin:url-shortener:%')
      .andWhereNot('key', 'like', 'plugin:url-shortener:migration:%')
      .count<{ count: string }>('key as count')
      .first();
    expect(Number(settingCount?.count ?? '0')).toBe(0);

    expect(await pluginTableExists('u_test_other_plugin_data')).toBe(true);
    const otherCount = await integrationDb('u_test_other_plugin_data')
      .count<{ count: string }>('id as count')
      .first();
    expect(Number(otherCount?.count ?? '0')).toBe(1);

    await installPlugin('url-shortener');
    expect(await pluginTableExists('u_url_shortener_links')).toBe(true);
  });

  it('23) prefix collision rejection catches reserved routes', () => {
    expect(() => validateRoutePrefix('/admin')).toThrow(/reserved/);
    const valid = validateRoutePrefix('/s');

    expect(valid).toBe('/s');
  });

  it('24) url-shortener migration supports up -> down -> up', async () => {
    const migration = await import(
      '@user/extensions/plugins/url-shortener/db/migrations/20260701010000_url_shortener_foundation'
    );

    await migration.up(integrationDb);
    expect(await pluginTableExists('u_url_shortener_links')).toBe(true);

    await migration.down(integrationDb);
    expect(await pluginTableExists('u_url_shortener_links')).toBe(false);

    await migration.up(integrationDb);
    expect(await pluginTableExists('u_url_shortener_links')).toBe(true);
  });

  it('25) daily stats nullable dimensions enforce logical uniqueness', async () => {
    const { installPlugin } = await importLifecycleModule();
    await installPlugin('url-shortener');

    const [link] = await integrationDb('u_url_shortener_links')
      .insert({
        code: 'daily-1',
        destination_url: 'https://example.com/daily',
        redirect_status_code: 302,
      })
      .returning(['id']);

    await integrationDb('u_url_shortener_daily_stats').insert({
      link_id: link.id,
      stat_date: '2026-07-02',
      total_clicks: 1,
      unique_clicks_approx: 1,
      referrer_category: null,
      device_category: null,
      browser_category: null,
    });

    await expect(
      integrationDb('u_url_shortener_daily_stats').insert({
        link_id: link.id,
        stat_date: '2026-07-02',
        total_clicks: 2,
        unique_clicks_approx: 2,
        referrer_category: null,
        device_category: null,
        browser_category: null,
      })
    ).rejects.toThrow();
  });

  it('26) generated registry/assets and packaging paths validate', async () => {
    const registryPath = resolvePluginRegistryPath(process.cwd());
    expect(registryPath).toBeTruthy();

    const dockerfile = fs.readFileSync(path.join(process.cwd(), 'Dockerfile'), 'utf8');
    expect(dockerfile.includes('/app/generated/plugins')).toBe(true);

    const generatedMigration = path.join(
      process.cwd(),
      'generated/plugins/url-shortener/migrations/20260701010000_url_shortener_foundation.ts'
    );
    expect(fs.existsSync(generatedMigration)).toBe(true);
  });
});
