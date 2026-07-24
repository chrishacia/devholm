import { describe, expect, it, vi } from 'vitest';
import type { DevholmPluginManifest } from '@core/types/plugins';

function createDbMock() {
  const merge = vi.fn(async () => undefined);
  const onConflict = vi.fn(() => ({ merge, ignore: vi.fn(async () => undefined) }));
  const insert = vi.fn(() => ({ onConflict }));
  const del = vi.fn(async () => 1);
  const update = vi.fn(async () => 1);
  const where = vi.fn(() => ({ update, first: vi.fn(async () => null), del }));
  const whereIn = vi.fn(() => ({ del }));
  const raw = vi.fn((query: unknown) => ({
    connection: vi.fn(async () => {
      const sql = String(query);
      if (sql.includes('pg_backend_pid')) {
        return { rows: [{ pid: 41002 }] };
      }
      if (sql.includes('pg_advisory_unlock')) {
        return { rows: [{ pg_advisory_unlock: true }] };
      }
      return { rows: [] };
    }),
  }));

  const table = vi.fn(() => ({ insert, where, whereIn, update, onConflict, del }));
  const transaction = vi.fn(async (callback) => callback(Object.assign(table, { raw })));

  const db = Object.assign(table, {
    insert,
    where,
    whereIn,
    update,
    onConflict,
    del,
    transaction,
    raw,
    connection: vi.fn(() => ({ raw })),
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

describe('plugin lifecycle semantics', () => {
  it('failed install does not enable plugin', async () => {
    vi.resetModules();

    const upsertSpy = vi.fn(async () => undefined);
    const db = createDbMock();

    vi.doMock('@core/lib/plugin-registry.server', () => ({
      getBundledPluginManifests: () => [
        manifest({
          lifecycle: {
            afterInstall: async () => {
              throw new Error('install failed');
            },
          },
        }),
      ],
      validateDependencyGraph: () => [],
      validatePackageDependencies: () => [],
      validateBundledPluginRegistry: () => [],
    }));

    vi.doMock('@core/lib/plugin-migration-runner.server', () => ({
      applyPendingPluginMigrations: vi.fn(async () => undefined),
      applyPluginMigrationDowns: vi.fn(async () => undefined),
    }));

    vi.doMock('@core/db/plugin-lifecycle', () => ({
      getInstalledPlugin: vi.fn(async () => null),
      listInstalledPlugins: vi.fn(async () => []),
      upsertPluginLedgerRecord: upsertSpy,
    }));

    vi.doMock('@/db', () => ({
      getDb: vi.fn(() => db),
    }));

    const { installPlugin } = await import('@core/lib/plugin-lifecycle.server');

    await expect(installPlugin('plugin-a')).rejects.toThrow('install failed');
    expect(upsertSpy).toHaveBeenCalled();
  });

  it('prevents disabling a required dependency when dependent is enabled', async () => {
    vi.resetModules();

    vi.doMock('@core/lib/plugin-registry.server', () => ({
      getBundledPluginManifests: () => [
        manifest({ id: 'plugin-a' }),
        manifest({
          id: 'plugin-b',
          name: 'Plugin B',
          enablementSettingKey: 'plugin:plugin-b:enabled',
          dependencies: {
            plugins: {
              'plugin-a': '^1.0.0',
            },
          },
        }),
      ],
      validateDependencyGraph: () => [],
      validatePackageDependencies: () => [],
      validateBundledPluginRegistry: () => [],
    }));

    vi.doMock('@core/db/plugin-lifecycle', () => ({
      getInstalledPlugin: vi.fn(async () => null),
      listInstalledPlugins: vi.fn(async () => [
        {
          pluginId: 'plugin-b',
          bundledVersion: '1.0.0',
          installedVersion: '1.0.0',
          enabled: true,
          lifecycleState: 'installed',
          operationStatus: 'idle',
        },
      ]),
      upsertPluginLedgerRecord: vi.fn(async () => undefined),
    }));

    const { canDisableOrUninstallPlugin } = await import('@core/lib/plugin-lifecycle.server');
    await expect(canDisableOrUninstallPlugin('plugin-a')).rejects.toThrow(
      /Cannot disable\/uninstall\/purge plugin-a/
    );
  });

  it('disable and uninstall preserve data by not calling purge hook', async () => {
    vi.resetModules();

    const purgeSpy = vi.fn(async () => undefined);
    const beforeDisableSpy = vi.fn(async () => undefined);
    const beforeUninstallSpy = vi.fn(async () => undefined);
    const db = createDbMock();

    vi.doMock('@core/lib/plugin-registry.server', () => ({
      getBundledPluginManifests: () => [
        manifest({
          lifecycle: {
            beforeDisable: beforeDisableSpy,
            beforeUninstall: beforeUninstallSpy,
            purge: purgeSpy,
          },
        }),
      ],
      validateDependencyGraph: () => [],
      validatePackageDependencies: () => [],
      validateBundledPluginRegistry: () => [],
    }));

    vi.doMock('@/db', () => ({
      getDb: vi.fn(() => db),
    }));

    vi.doMock('@core/db/plugin-lifecycle', () => ({
      getInstalledPlugin: vi.fn(async () => ({
        pluginId: 'plugin-a',
        bundledVersion: '1.0.0',
        installedVersion: '1.0.0',
        enabled: true,
        lifecycleState: 'installed',
        operationStatus: 'idle',
        installedAt: new Date('2026-01-01T00:00:00.000Z'),
        upgradedAt: null,
        disabledAt: null,
        lastError: null,
        manifestChecksum: null,
      })),
      listInstalledPlugins: vi.fn(async () => []),
      upsertPluginLedgerRecord: vi.fn(async () => undefined),
    }));

    const { disablePlugin, uninstallPlugin } = await import('@core/lib/plugin-lifecycle.server');

    await disablePlugin('plugin-a');
    await uninstallPlugin('plugin-a');

    expect(beforeDisableSpy).toHaveBeenCalledTimes(1);
    expect(beforeUninstallSpy).toHaveBeenCalledTimes(1);
    expect(purgeSpy).not.toHaveBeenCalled();
  });

  it('explicit purge invokes plugin-owned purge behavior', async () => {
    vi.resetModules();

    const purgeSpy = vi.fn(async () => undefined);

    vi.doMock('@core/lib/plugin-registry.server', () => ({
      getBundledPluginManifests: () => [
        manifest({
          lifecycle: {
            purge: purgeSpy,
          },
        }),
      ],
      validateDependencyGraph: () => [],
      validatePackageDependencies: () => [],
      validateBundledPluginRegistry: () => [],
    }));

    vi.doMock('@core/db/plugin-lifecycle', () => ({
      getInstalledPlugin: vi.fn(async () => ({
        pluginId: 'plugin-a',
        bundledVersion: '1.0.0',
        installedVersion: '1.0.0',
        enabled: false,
        lifecycleState: 'disabled',
        operationStatus: 'idle',
        installedAt: new Date('2026-01-01T00:00:00.000Z'),
        upgradedAt: null,
        disabledAt: new Date('2026-01-01T00:00:00.000Z'),
        lastError: null,
        manifestChecksum: null,
      })),
      listInstalledPlugins: vi.fn(async () => []),
      upsertPluginLedgerRecord: vi.fn(async () => undefined),
    }));

    const db = createDbMock();
    vi.doMock('@/db', () => ({
      getDb: vi.fn(() => db),
    }));

    const { purgePlugin } = await import('@core/lib/plugin-lifecycle.server');

    await purgePlugin('plugin-a', { confirmPluginId: 'plugin-a', initiatedBy: 'tester' });
    expect(purgeSpy).toHaveBeenCalledTimes(1);
  });

  it('rejects purge without explicit confirmation', async () => {
    vi.resetModules();

    vi.doMock('@core/lib/plugin-registry.server', () => ({
      getBundledPluginManifests: () => [manifest()],
      validateDependencyGraph: () => [],
      validatePackageDependencies: () => [],
      validateBundledPluginRegistry: () => [],
    }));

    vi.doMock('@core/db/plugin-lifecycle', () => ({
      getInstalledPlugin: vi.fn(async () => ({
        pluginId: 'plugin-a',
        bundledVersion: '1.0.0',
        installedVersion: '1.0.0',
        enabled: false,
        lifecycleState: 'disabled',
        operationStatus: 'idle',
        installedAt: new Date('2026-01-01T00:00:00.000Z'),
        upgradedAt: null,
        disabledAt: new Date('2026-01-01T00:00:00.000Z'),
        lastError: null,
        manifestChecksum: null,
      })),
      listInstalledPlugins: vi.fn(async () => []),
      upsertPluginLedgerRecord: vi.fn(async () => undefined),
    }));

    const db = createDbMock();
    vi.doMock('@/db', () => ({
      getDb: vi.fn(() => db),
    }));

    const { purgePlugin } = await import('@core/lib/plugin-lifecycle.server');

    await expect(purgePlugin('plugin-a')).rejects.toThrow(/Purge confirmation required/);
  });

  it('enable transitions installed plugin to enabled', async () => {
    vi.resetModules();

    const upsertSpy = vi.fn(async () => undefined);
    const db = createDbMock();

    vi.doMock('@core/lib/plugin-registry.server', () => ({
      getBundledPluginManifests: () => [manifest()],
      validateDependencyGraph: () => [],
      validatePackageDependencies: () => [],
      validateBundledPluginRegistry: () => [],
    }));

    vi.doMock('@core/db/plugin-lifecycle', () => ({
      getInstalledPlugin: vi.fn(async () => ({
        pluginId: 'plugin-a',
        bundledVersion: '1.0.0',
        installedVersion: '1.0.0',
        enabled: false,
        lifecycleState: 'installed',
        operationStatus: 'idle',
        installedAt: new Date('2026-01-01T00:00:00.000Z'),
        upgradedAt: null,
        disabledAt: new Date('2026-01-01T00:00:00.000Z'),
        lastError: null,
        manifestChecksum: null,
      })),
      listInstalledPlugins: vi.fn(async () => []),
      upsertPluginLedgerRecord: upsertSpy,
    }));

    vi.doMock('@/db', () => ({
      getDb: vi.fn(() => db),
    }));

    const { enablePlugin } = await import('@core/lib/plugin-lifecycle.server');

    await enablePlugin('plugin-a');
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'installed',
        enabled: true,
      })
    );
  });

  it('disable failure records operation error and preserves previous runtime state', async () => {
    vi.resetModules();

    const upsertSpy = vi.fn(async () => undefined);
    const db = createDbMock();

    vi.doMock('@core/lib/plugin-registry.server', () => ({
      getBundledPluginManifests: () => [
        manifest({
          lifecycle: {
            beforeDisable: async () => {
              throw new Error('forced disable failure');
            },
          },
        }),
      ],
      validateDependencyGraph: () => [],
      validatePackageDependencies: () => [],
      validateBundledPluginRegistry: () => [],
    }));

    vi.doMock('@core/lib/plugin-migration-runner.server', () => ({
      applyPendingPluginMigrations: vi.fn(async () => undefined),
      applyPluginMigrationDowns: vi.fn(async () => undefined),
    }));

    vi.doMock('@core/db/plugin-lifecycle', () => ({
      getInstalledPlugin: vi.fn(async () => ({
        pluginId: 'plugin-a',
        bundledVersion: '1.0.0',
        installedVersion: '1.0.0',
        enabled: true,
        lifecycleState: 'installed',
        operationStatus: 'idle',
        installedAt: new Date('2026-01-01T00:00:00.000Z'),
        upgradedAt: null,
        disabledAt: null,
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        lastError: null,
        manifestChecksum: null,
      })),
      listInstalledPlugins: vi.fn(async () => []),
      upsertPluginLedgerRecord: upsertSpy,
    }));

    vi.doMock('@/db', () => ({
      getDb: vi.fn(() => db),
    }));

    const { disablePlugin } = await import('@core/lib/plugin-lifecycle.server');

    await expect(disablePlugin('plugin-a')).rejects.toThrow(/forced disable failure/);
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        operationStatus: 'error',
        enabled: true,
        installedVersion: '1.0.0',
      })
    );
  });

  it('purge failure records operation error and keeps installed version', async () => {
    vi.resetModules();

    const upsertSpy = vi.fn(async () => undefined);
    const db = createDbMock();

    vi.doMock('@core/lib/plugin-registry.server', () => ({
      getBundledPluginManifests: () => [manifest()],
      validateDependencyGraph: () => [],
      validatePackageDependencies: () => [],
      validateBundledPluginRegistry: () => [],
    }));

    vi.doMock('@core/lib/plugin-migration-runner.server', () => ({
      applyPendingPluginMigrations: vi.fn(async () => undefined),
      applyPluginMigrationDowns: vi.fn(async () => {
        throw new Error('forced purge teardown failure');
      }),
    }));

    vi.doMock('@core/db/plugin-lifecycle', () => ({
      getInstalledPlugin: vi.fn(async () => ({
        pluginId: 'plugin-a',
        bundledVersion: '1.0.0',
        installedVersion: '1.0.0',
        enabled: false,
        lifecycleState: 'disabled',
        operationStatus: 'idle',
        installedAt: new Date('2026-01-01T00:00:00.000Z'),
        upgradedAt: null,
        disabledAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        lastError: null,
        manifestChecksum: null,
      })),
      listInstalledPlugins: vi.fn(async () => []),
      upsertPluginLedgerRecord: upsertSpy,
    }));

    vi.doMock('@/db', () => ({
      getDb: vi.fn(() => db),
    }));

    const { purgePlugin } = await import('@core/lib/plugin-lifecycle.server');
    await expect(purgePlugin('plugin-a', { confirmPluginId: 'plugin-a' })).rejects.toThrow(
      /forced purge teardown failure/
    );
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        operationStatus: 'error',
        installedVersion: '1.0.0',
      })
    );
  });
});
