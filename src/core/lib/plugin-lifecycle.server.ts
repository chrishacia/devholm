import { getDb } from '@/db';
import {
  getInstalledPlugin,
  listInstalledPlugins,
  upsertPluginLedgerRecord,
} from '@core/db/plugin-lifecycle';
import { applyPendingPluginMigrations } from '@core/lib/plugin-migration-runner.server';
import {
  getBundledPluginManifests,
  isVersionCompatible,
  validateDependencyGraph,
  validatePackageDependencies,
  validateBundledPluginRegistry,
} from '@core/lib/plugin-registry.server';
import type { DevholmPluginManifest, PluginLifecycleContext } from '@core/types/plugins';

type InstallOptions = {
  initiatedBy?: string;
  enable?: boolean;
};

type PurgeOptions = {
  confirmPluginId: string;
  initiatedBy?: string;
};

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

async function ensureManifestDependenciesAvailable(
  manifest: DevholmPluginManifest,
  options?: { requireEnabled?: boolean }
): Promise<void> {
  const required = manifest.dependencies?.plugins ?? {};

  for (const [dependencyId, versionRange] of Object.entries(required)) {
    const dependencyManifest = getBundledPluginManifests().find((item) => item.id === dependencyId);
    if (!dependencyManifest) {
      throw new Error(`Plugin dependency ${dependencyId} is not bundled for ${manifest.id}`);
    }

    const installed = await getInstalledPlugin(dependencyId);
    if (
      !installed ||
      installed.lifecycleState === 'pending_install' ||
      installed.lifecycleState === 'uninstalled' ||
      installed.lifecycleState === 'error'
    ) {
      throw new Error(`Plugin dependency ${dependencyId} is not installed for ${manifest.id}`);
    }

    if (!isVersionCompatible(installed.installedVersion, versionRange)) {
      throw new Error(
        `Plugin dependency ${dependencyId}@${installed.installedVersion} does not satisfy ${versionRange} for ${manifest.id}`
      );
    }

    if (options?.requireEnabled && !installed.enabled) {
      throw new Error(`Plugin dependency ${dependencyId} must be enabled for ${manifest.id}`);
    }
  }
}

async function withPluginLifecycleLock<T>(pluginId: string, work: () => Promise<T>): Promise<T> {
  const db = getDb();

  await db.raw('select pg_advisory_lock(hashtext(?))', [pluginId]);
  try {
    return await work();
  } finally {
    await db.raw('select pg_advisory_unlock(hashtext(?))', [pluginId]);
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

export async function installPlugin(
  pluginId: string,
  optionsOrInitiatedBy?: InstallOptions | string
): Promise<void> {
  const manifest = getManifest(pluginId);
  const options: InstallOptions =
    typeof optionsOrInitiatedBy === 'string'
      ? { initiatedBy: optionsOrInitiatedBy }
      : optionsOrInitiatedBy ?? {};
  const context: PluginLifecycleContext = {
    pluginId,
    toVersion: manifest.version,
    initiatedBy: options.initiatedBy,
  };

  validateCompatibilityAndDependencies();

  await withPluginLifecycleLock(pluginId, async () => {
    await ensureManifestDependenciesAvailable(manifest, { requireEnabled: true });

    const existing = await getInstalledPlugin(pluginId);
    if (
      existing &&
      existing.installedVersion === manifest.version &&
      (existing.lifecycleState === 'installed' ||
        existing.lifecycleState === 'enabled' ||
        existing.lifecycleState === 'disabled')
    ) {
      return;
    }

    await upsertPluginLedgerRecord({
      manifest,
      state: 'pending_install',
      enabled: false,
      installedAt: existing?.installedAt ?? null,
      upgradedAt: existing?.upgradedAt ?? null,
      disabledAt: existing?.disabledAt ?? null,
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
        state: options.enable ? 'enabled' : 'installed',
        enabled: options.enable === true,
        installedAt: existing?.installedAt ?? now,
        upgradedAt: existing?.upgradedAt ?? null,
        disabledAt: options.enable ? null : existing?.disabledAt ?? null,
        lastError: null,
      });
      await setPluginEnabledSetting(pluginId, options.enable === true);
    } catch (error) {
      const now = new Date();
      await upsertPluginLedgerRecord({
        manifest,
        state: 'error',
        enabled: false,
        installedAt: existing?.installedAt ?? null,
        upgradedAt: existing?.upgradedAt ?? null,
        disabledAt: existing?.disabledAt ?? now,
        lastError: error instanceof Error ? error.message : String(error),
      });
      await setPluginEnabledSetting(pluginId, false);
      throw error;
    }
  });
}

export async function enablePlugin(pluginId: string): Promise<void> {
  const manifest = getManifest(pluginId);

  await withPluginLifecycleLock(pluginId, async () => {
    await ensureManifestDependenciesAvailable(manifest, { requireEnabled: true });

    const previous = await getInstalledPlugin(pluginId);
    if (
      !previous ||
      previous.lifecycleState === 'pending_install' ||
      previous.lifecycleState === 'uninstalled' ||
      previous.lifecycleState === 'error'
    ) {
      throw new Error(`Cannot enable ${pluginId}: plugin is not installed`);
    }

    await setPluginEnabledSetting(pluginId, true);
    await upsertPluginLedgerRecord({
      manifest,
      state: 'enabled',
      enabled: true,
      installedAt: previous.installedAt,
      upgradedAt: previous.upgradedAt,
      disabledAt: null,
      lastError: null,
    });
  });
}

export async function upgradePlugin(pluginId: string, initiatedBy?: string): Promise<void> {
  const manifest = getManifest(pluginId);

  await withPluginLifecycleLock(pluginId, async () => {
    const previous = await getInstalledPlugin(pluginId);

    if (
      !previous ||
      previous.lifecycleState === 'pending_install' ||
      previous.lifecycleState === 'error' ||
      previous.lifecycleState === 'uninstalled'
    ) {
      throw new Error(`Cannot upgrade ${pluginId}: plugin is not successfully installed`);
    }

    validateCompatibilityAndDependencies();
    await ensureManifestDependenciesAvailable(manifest, { requireEnabled: true });

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

      if (manifest.lifecycle?.afterUpgrade) {
        await manifest.lifecycle.afterUpgrade({
          pluginId,
          fromVersion: previous.installedVersion,
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
    } catch (error) {
      const now = new Date();
      const db = getDb();
      await db('devholm_plugins')
        .where({ plugin_id: pluginId })
        .update({
          installed_version: previous.installedVersion,
          enabled: previous.enabled,
          lifecycle_state: previous.lifecycleState,
          installed_at: previous.installedAt,
          upgraded_at: previous.upgradedAt,
          disabled_at: previous.disabledAt,
          last_error: error instanceof Error ? error.message : String(error),
          updated_at: now,
        });
      throw error;
    }
  });
}

export async function disablePlugin(pluginId: string, initiatedBy?: string): Promise<void> {
  const manifest = getManifest(pluginId);

  await withPluginLifecycleLock(pluginId, async () => {
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
  });
}

export async function uninstallPlugin(pluginId: string, initiatedBy?: string): Promise<void> {
  const manifest = getManifest(pluginId);

  await withPluginLifecycleLock(pluginId, async () => {
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
  });
}

export async function purgePlugin(pluginId: string, options?: PurgeOptions): Promise<void> {
  const manifest = getManifest(pluginId);

  if (!options || options.confirmPluginId !== pluginId) {
    throw new Error(`Purge confirmation required. Re-run purge with confirmPluginId='${pluginId}'`);
  }

  await withPluginLifecycleLock(pluginId, async () => {
    const previous = await getInstalledPlugin(pluginId);
    await ensureDependentsAllowDisable(pluginId);

    if (previous?.enabled || previous?.lifecycleState === 'enabled') {
      throw new Error(`Cannot purge ${pluginId}: plugin must be disabled or uninstalled`);
    }

    if (manifest.lifecycle?.purge) {
      await manifest.lifecycle.purge({
        pluginId,
        fromVersion: manifest.version,
        initiatedBy: options.initiatedBy,
      });
    }

    await upsertPluginLedgerRecord({
      manifest,
      state: 'uninstalled',
      enabled: false,
      installedAt: previous?.installedAt ?? null,
      upgradedAt: previous?.upgradedAt ?? null,
      disabledAt: previous?.disabledAt ?? new Date(),
      lastError: null,
    });
  });
}
