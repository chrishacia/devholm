import { updatePluginEnabledState } from '@/db/plugins';
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

  await upsertPluginLedgerRecord(manifest, 'pending_install', false, null);

  try {
    await applyPendingPluginMigrations(pluginId);

    if (manifest.lifecycle?.afterInstall) {
      await manifest.lifecycle.afterInstall(context);
    }

    await upsertPluginLedgerRecord(manifest, 'enabled', true, null);
    await updatePluginEnabledState(pluginId, true);
  } catch (error) {
    await upsertPluginLedgerRecord(
      manifest,
      'error',
      false,
      error instanceof Error ? error.message : String(error)
    );
    await updatePluginEnabledState(pluginId, false);
    throw error;
  }
}

export async function upgradePlugin(pluginId: string, initiatedBy?: string): Promise<void> {
  const manifest = getManifest(pluginId);
  const previous = await getInstalledPlugin(pluginId);

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

  await upsertPluginLedgerRecord(
    manifest,
    previous?.enabled ? 'enabled' : 'installed',
    !!previous?.enabled
  );
}

export async function disablePlugin(pluginId: string, initiatedBy?: string): Promise<void> {
  const manifest = getManifest(pluginId);
  await ensureDependentsAllowDisable(pluginId);

  if (manifest.lifecycle?.beforeDisable) {
    await manifest.lifecycle.beforeDisable({
      pluginId,
      fromVersion: manifest.version,
      initiatedBy,
    });
  }

  await updatePluginEnabledState(pluginId, false);
  await upsertPluginLedgerRecord(manifest, 'disabled', false, null);
}

export async function uninstallPlugin(pluginId: string, initiatedBy?: string): Promise<void> {
  const manifest = getManifest(pluginId);
  await ensureDependentsAllowDisable(pluginId);

  if (manifest.lifecycle?.beforeUninstall) {
    await manifest.lifecycle.beforeUninstall({
      pluginId,
      fromVersion: manifest.version,
      initiatedBy,
    });
  }

  await updatePluginEnabledState(pluginId, false);
  await upsertPluginLedgerRecord(manifest, 'uninstalled', false, null);
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
