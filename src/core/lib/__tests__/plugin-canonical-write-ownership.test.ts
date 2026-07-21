import { describe, expect, it, vi } from 'vitest';
import type { DevholmPluginManifest } from '@core/types/plugins';

function createDbMock() {
  const insert = vi.fn(() => ({
    onConflict: vi.fn(() => ({
      merge: vi.fn(async () => undefined),
      ignore: vi.fn(async () => undefined),
    })),
  }));
  const del = vi.fn(async () => 1);
  const where = vi.fn(() => ({
    update: vi.fn(async () => 1),
    first: vi.fn(async () => null),
    del,
  }));
  const whereIn = vi.fn(() => ({ del }));
  const raw = vi.fn(() => ({ connection: vi.fn(async () => undefined) }));

  const table = vi.fn(() => ({ insert, where, whereIn, del }));
  const transaction = vi.fn(async (callback) => callback(Object.assign(table, { raw })));

  const db = Object.assign(table, {
    insert,
    where,
    whereIn,
    del,
    transaction,
    raw,
  }) as ReturnType<typeof Object.assign> & {
    client?: {
      acquireConnection: ReturnType<typeof vi.fn>;
      releaseConnection: ReturnType<typeof vi.fn>;
    };
  };
  db.client = {
    acquireConnection: vi.fn(async () => ({ __id: 'mock-connection' })),
    releaseConnection: vi.fn(async () => undefined),
  };

  return db;
}

function manifest(overrides: Partial<DevholmPluginManifest> = {}): DevholmPluginManifest {
  return {
    id: 'plugin-a',
    name: 'Plugin A',
    version: '1.0.0',
    enablementSettingKey: 'plugin:plugin-a:enabled',
    ...overrides,
  };
}

describe('plugin canonical write ownership', () => {
  it('lifecycle mutations do not write legacy plugin:*:enabled settings', async () => {
    vi.resetModules();

    const db = createDbMock();
    const upsertSpy = vi.fn(async () => undefined);

    vi.doMock('@/db', () => ({ getDb: vi.fn(() => db) }));
    vi.doMock('@core/lib/plugin-registry.server', () => ({
      getBundledPluginManifests: () => [manifest()],
      validateDependencyGraph: () => [],
      validatePackageDependencies: () => [],
      validateBundledPluginRegistry: () => [],
    }));
    vi.doMock('@core/lib/plugin-migration-runner.server', () => ({
      applyPendingPluginMigrations: vi.fn(async () => undefined),
      applyPluginMigrationDowns: vi.fn(async () => undefined),
    }));
    vi.doMock('@core/db/plugin-lifecycle', () => ({
      getInstalledPlugin: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          pluginId: 'plugin-a',
          bundledVersion: '1.0.0',
          installedVersion: '1.0.0',
          enabled: false,
          lifecycleState: 'installed',
          operationStatus: 'idle',
          installedAt: null,
          upgradedAt: null,
          disabledAt: null,
          lastError: null,
          manifestChecksum: null,
        })
        .mockResolvedValueOnce({
          pluginId: 'plugin-a',
          bundledVersion: '1.0.0',
          installedVersion: '1.0.0',
          enabled: true,
          lifecycleState: 'installed',
          operationStatus: 'idle',
          installedAt: null,
          upgradedAt: null,
          disabledAt: null,
          lastError: null,
          manifestChecksum: null,
        }),
      listInstalledPlugins: vi.fn(async () => []),
      upsertPluginLedgerRecord: upsertSpy,
    }));

    const { installPlugin, enablePlugin, disablePlugin } = await import(
      '@core/lib/plugin-lifecycle.server'
    );

    await installPlugin('plugin-a');
    await enablePlugin('plugin-a');
    await disablePlugin('plugin-a');

    expect(upsertSpy).toHaveBeenCalled();

    const siteSettingsWrites = (db.mock.calls as Array<Array<unknown>>).filter(
      (call: Array<unknown>) => call[0] === 'site_settings'
    );
    expect(siteSettingsWrites).toHaveLength(0);
  });
});
