import { describe, expect, it, vi } from 'vitest';
import type { DevholmPluginManifest } from '@core/types/plugins';

function createDbMock() {
  const merge = vi.fn(async () => undefined);
  const onConflict = vi.fn(() => ({ merge, ignore: vi.fn(async () => undefined) }));
  const insert = vi.fn(() => ({ onConflict }));
  const update = vi.fn(async () => 1);
  const where = vi.fn(() => ({ update, first: vi.fn(async () => null) }));

  const table = vi.fn(() => ({ insert, where, update, onConflict }));
  const transaction = vi.fn(async (callback) => callback(table));

  return Object.assign(table, { insert, where, update, onConflict, transaction });
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
          installedVersion: '1.0.0',
          enabled: true,
          lifecycleState: 'enabled',
        },
      ]),
      upsertPluginLedgerRecord: vi.fn(async () => undefined),
    }));

    vi.doMock('@/db/plugins', () => ({
      updatePluginEnabledState: vi.fn(async () => true),
    }));

    const { canDisableOrUninstallPlugin } = await import('@core/lib/plugin-lifecycle.server');
    await expect(canDisableOrUninstallPlugin('plugin-a')).rejects.toThrow(
      /Cannot disable\/uninstall plugin-a/
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
      getInstalledPlugin: vi.fn(async () => null),
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
      getInstalledPlugin: vi.fn(async () => null),
      listInstalledPlugins: vi.fn(async () => []),
      upsertPluginLedgerRecord: vi.fn(async () => undefined),
    }));

    const { purgePlugin } = await import('@core/lib/plugin-lifecycle.server');

    await purgePlugin('plugin-a', 'tester');
    expect(purgeSpy).toHaveBeenCalledTimes(1);
  });
});
