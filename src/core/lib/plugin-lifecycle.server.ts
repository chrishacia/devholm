import { getDb } from '@/db';
import {
  getInstalledPlugin,
  listInstalledPlugins,
  upsertPluginLedgerRecord,
} from '@core/db/plugin-lifecycle';
import { applyPendingPluginMigrations } from '@core/lib/plugin-migration-runner.server';
import {
  getBundledPluginManifests,
  validateDependencyGraph,
  validatePackageDependencies,
  validateBundledPluginRegistry,
} from '@core/lib/plugin-registry.server';
import type { DevholmPluginManifest, PluginLifecycleContext } from '@core/types/plugins';

async function setPluginEnabledSetting(pluginId: string, enabled: boolean): Promise<void> {
  const db = getDb();
  const now = new Date();

  await db('site_settings')
    .insert({
      key: `plugin:${pluginId}:enabled`,
      value: enabled ? 'true' : 'false',
      type: 'boolean',
      category: 'plugins',
      description: `${pluginId} plugin enabled state`,
      updated_at: now,
    })
    .onConflict('key')
    .merge({
      value: enabled ? 'true' : 'false',
      updated_at: now,
    });
}

function getManifest(pluginId: string): DevholmPluginManifest {
  const manifest = getBundledPluginManifests().find((item) => item.id === pluginId);
  if (!manifest) {
    throw new Error(`Unknown plugin: ${pluginId}`);
  }
  return manifest;
}

function validateCompatibilityAndDependencies(): void {
  const errors = [
    ...validateBundledPluginRegistry(),
    ...validateDependencyGraph(),
    ...validatePackageDependencies(),
  ];

  if (errors.length > 0) {
    throw new Error(`Plugin validation failed:\n${errors.join('\n')}`);
  }
}

async function ensureDependentsAllowDisable(pluginId: string): Promise<void> {
  const installed = await listInstalledPlugins();
  const installedById = new Map(installed.map((row) => [row.pluginId, row]));

  for (const manifest of getBundledPluginManifests()) {
    const requires = manifest.dependencies?.plugins ?? {};
    if (!(pluginId in requires)) {
      continue;
    }

    const dependent = installedById.get(manifest.id);
    if (dependent?.enabled) {
      throw new Error(
        `Cannot disable/uninstall ${pluginId}: enabled dependent ${manifest.id} requires it`
      );
    }
  }
}

export async function canDisableOrUninstallPlugin(pluginId: string): Promise<boolean> {
  await ensureDependentsAllowDisable(pluginId);
  return true;
}

export async function installPlugin(pluginId: string, initiatedBy?: string): Promise<void> {
  const manifest = getManifest(pluginId);
  const context: PluginLifecycleContext = {
    pluginId,
    toVersion: manifest.version,
    initiatedBy,
  };

  validateCompatibilityAndDependencies();

  await upsertPluginLedgerRecord({
    manifest,
    state: 'pending_install',
    enabled: false,
    installedAt: null,
    upgradedAt: null,
    disabledAt: null,
    lastError: null,
  });

  try {
    await applyPendingPluginMigrations(pluginId);

    const db = getDb();
    const now = new Date();

    for (const setting of manifest.settings ?? []) {
      const defaultValue = setting.defaultValue;
      const storedValue =
        defaultValue === null || defaultValue === undefined
          ? ''
          : typeof defaultValue === 'string'
            ? defaultValue
            : typeof defaultValue === 'number' || typeof defaultValue === 'boolean'
              ? String(defaultValue)
              : JSON.stringify(defaultValue);

      await db('site_settings')
        .insert({
          key: setting.key,
          value: storedValue,
          type: setting.type,
          category: setting.category ?? 'plugins',
          description: setting.description ?? null,
          updated_at: now,
        })
        .onConflict('key')
        .ignore();
    }

    if (manifest.lifecycle?.afterInstall) {
      await manifest.lifecycle.afterInstall(context);
    }

    await upsertPluginLedgerRecord({
      manifest,
      state: 'installed',
      enabled: false,
      installedAt: now,
      upgradedAt: null,
      disabledAt: null,
      lastError: null,
    });
    await setPluginEnabledSetting(pluginId, false);
  } catch (error) {
    await upsertPluginLedgerRecord({
      manifest,
      state: 'error',
      enabled: false,
      installedAt: null,
      upgradedAt: null,
      disabledAt: new Date(),
      lastError: error instanceof Error ? error.message : String(error),
    });
    await setPluginEnabledSetting(pluginId, false);
    throw error;
  }
}

export async function upgradePlugin(pluginId: string, initiatedBy?: string): Promise<void> {
  const manifest = getManifest(pluginId);
  const previous = await getInstalledPlugin(pluginId);

  if (
    !previous ||
    previous.lifecycleState === 'pending_install' ||
    previous.lifecycleState === 'error'
  ) {
    throw new Error(`Cannot upgrade ${pluginId}: plugin is not successfully installed`);
  }

  validateCompatibilityAndDependencies();

  await applyPendingPluginMigrations(pluginId);

  if (manifest.lifecycle?.afterUpgrade) {
    await manifest.lifecycle.afterUpgrade({
      pluginId,
      fromVersion: previous?.installedVersion,
      toVersion: manifest.version,
      initiatedBy,
    });
  }

  await upsertPluginLedgerRecord({
    manifest,
    state: previous.enabled ? 'enabled' : 'installed',
    enabled: !!previous.enabled,
    installedAt: previous.installedAt,
    upgradedAt: new Date(),
    disabledAt: previous.enabled ? null : previous.disabledAt,
    lastError: null,
  });
}

export async function disablePlugin(pluginId: string, initiatedBy?: string): Promise<void> {
  const manifest = getManifest(pluginId);
  const previous = await getInstalledPlugin(pluginId);
  await ensureDependentsAllowDisable(pluginId);

  if (manifest.lifecycle?.beforeDisable) {
    await manifest.lifecycle.beforeDisable({
      pluginId,
      fromVersion: manifest.version,
      initiatedBy,
    });
  }

  await setPluginEnabledSetting(pluginId, false);
  await upsertPluginLedgerRecord({
    manifest,
    state: 'disabled',
    enabled: false,
    installedAt: previous?.installedAt ?? null,
    upgradedAt: previous?.upgradedAt ?? null,
    disabledAt: new Date(),
    lastError: null,
  });
}

export async function uninstallPlugin(pluginId: string, initiatedBy?: string): Promise<void> {
  const manifest = getManifest(pluginId);
  const previous = await getInstalledPlugin(pluginId);
  await ensureDependentsAllowDisable(pluginId);

  if (manifest.lifecycle?.beforeUninstall) {
    await manifest.lifecycle.beforeUninstall({
      pluginId,
      fromVersion: manifest.version,
      initiatedBy,
    });
  }

  await setPluginEnabledSetting(pluginId, false);
  await upsertPluginLedgerRecord({
    manifest,
    state: 'uninstalled',
    enabled: false,
    installedAt: previous?.installedAt ?? null,
    upgradedAt: previous?.upgradedAt ?? null,
    disabledAt: new Date(),
    lastError: null,
  });
}

export async function purgePlugin(pluginId: string, initiatedBy?: string): Promise<void> {
  const manifest = getManifest(pluginId);

  if (manifest.lifecycle?.purge) {
    await manifest.lifecycle.purge({
      pluginId,
      fromVersion: manifest.version,
      initiatedBy,
    });
  }
}
