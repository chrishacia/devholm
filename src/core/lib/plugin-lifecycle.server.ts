import { getDb } from '@/db';
import {
  getInstalledPlugin,
  listInstalledPlugins,
  upsertPluginLedgerRecord,
} from '@core/db/plugin-lifecycle';
import {
  applyPendingPluginMigrations,
  applyPluginMigrationDowns,
} from '@core/lib/plugin-migration-runner.server';
import {
  getBundledPluginManifests,
  isVersionCompatible,
  validateDependencyGraph,
  validatePackageDependencies,
  validateBundledPluginRegistry,
} from '@core/lib/plugin-registry.server';
import type {
  DevholmPluginManifest,
  PluginLifecycleContext,
  PluginLifecycleState,
} from '@core/types/plugins';

type InstallOptions = {
  initiatedBy?: string;
  enable?: boolean;
};

type PurgeOptions = {
  confirmPluginId: string;
  initiatedBy?: string;
};

const LIFECYCLE_LOCK_NAMESPACE = 'devholm.plugin.lifecycle';

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

function serializeSettingDefaultValue(
  value: unknown,
  type: 'string' | 'number' | 'boolean' | 'json'
): string {
  if (value === undefined || value === null) {
    return '';
  }

  if (type === 'string') {
    if (typeof value !== 'string') {
      throw new Error(`Expected string default value but received ${typeof value}`);
    }
    return value;
  }

  if (type === 'number') {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      throw new Error(`Expected numeric default value but received ${typeof value}`);
    }
    return String(value);
  }

  if (type === 'boolean') {
    if (typeof value !== 'boolean') {
      throw new Error(`Expected boolean default value but received ${typeof value}`);
    }
    return value ? 'true' : 'false';
  }

  if (type === 'json') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error('Expected JSON object default value');
    }
    return JSON.stringify(value);
  }

  return '';
}

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

async function ensureManifestSettings(manifest: DevholmPluginManifest): Promise<void> {
  const db = getDb();
  const now = new Date();

  for (const setting of manifest.settings ?? []) {
    if (!setting.key.startsWith(`plugin:${manifest.id}:`)) {
      throw new Error(`Setting key ${setting.key} must be namespaced to plugin:${manifest.id}:*`);
    }

    const storedValue = serializeSettingDefaultValue(setting.defaultValue, setting.type);

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
    const dependencyInstalled =
      installed &&
      installed.installedVersion !== null &&
      (installed.lifecycleState === 'installed' || installed.lifecycleState === 'disabled');

    if (!dependencyInstalled) {
      throw new Error(`Plugin dependency ${dependencyId} is not installed for ${manifest.id}`);
    }

    if (!isVersionCompatible(installed.installedVersion as string, versionRange)) {
      throw new Error(
        `Plugin dependency ${dependencyId}@${installed.installedVersion} does not satisfy ${versionRange} for ${manifest.id}`
      );
    }

    if (options?.requireEnabled && !installed.enabled) {
      throw new Error(`Plugin dependency ${dependencyId} must be enabled for ${manifest.id}`);
    }
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
        `Cannot disable/uninstall/purge ${pluginId}: enabled dependent ${manifest.id} requires it`
      );
    }
  }
}

async function withPluginLifecycleLock<T>(pluginId: string, work: () => Promise<T>): Promise<T> {
  const db = getDb();
  const connection = await db.client.acquireConnection();

  try {
    await db
      .raw('select pg_advisory_lock(hashtext(?), hashtext(?))', [
        LIFECYCLE_LOCK_NAMESPACE,
        pluginId,
      ])
      .connection(connection);

    return await work();
  } finally {
    try {
      await db
        .raw('select pg_advisory_unlock(hashtext(?), hashtext(?))', [
          LIFECYCLE_LOCK_NAMESPACE,
          pluginId,
        ])
        .connection(connection);
    } finally {
      await db.client.releaseConnection(connection);
    }
  }
}

function nextInstalledLifecycleState(enabled: boolean): PluginLifecycleState {
  return enabled ? 'installed' : 'installed';
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
      existing.operationStatus === 'idle' &&
      (existing.lifecycleState === 'installed' || existing.lifecycleState === 'disabled')
    ) {
      return;
    }

    await upsertPluginLedgerRecord({
      manifest,
      state: existing?.lifecycleState ?? 'bundled',
      operationStatus: 'pending_install',
      enabled: existing?.enabled ?? false,
      installedVersion: existing?.installedVersion ?? null,
      installedAt: existing?.installedAt ?? null,
      upgradedAt: existing?.upgradedAt ?? null,
      disabledAt: existing?.disabledAt ?? null,
      lastError: null,
    });

    try {
      await applyPendingPluginMigrations(pluginId, { lockAlreadyHeld: true });
      await ensureManifestSettings(manifest);

      if (manifest.lifecycle?.afterInstall) {
        await manifest.lifecycle.afterInstall(context);
      }

      const now = new Date();
      const enabled = options.enable === true;
      await upsertPluginLedgerRecord({
        manifest,
        state: nextInstalledLifecycleState(enabled),
        operationStatus: 'idle',
        enabled,
        installedVersion: manifest.version,
        installedAt: existing?.installedAt ?? now,
        upgradedAt: existing?.upgradedAt ?? null,
        disabledAt: enabled ? null : existing?.disabledAt ?? null,
        lastError: null,
      });
      await setPluginEnabledSetting(pluginId, enabled);
    } catch (error) {
      await upsertPluginLedgerRecord({
        manifest,
        state: existing?.lifecycleState ?? 'bundled',
        operationStatus: 'error',
        enabled: existing?.enabled ?? false,
        installedVersion: existing?.installedVersion ?? null,
        installedAt: existing?.installedAt ?? null,
        upgradedAt: existing?.upgradedAt ?? null,
        disabledAt: existing?.disabledAt ?? null,
        lastError: error instanceof Error ? error.message : String(error),
      });
      await setPluginEnabledSetting(pluginId, existing?.enabled ?? false);
      throw error;
    }
  });
}

export async function enablePlugin(pluginId: string, initiatedBy?: string): Promise<void> {
  void initiatedBy;
  const manifest = getManifest(pluginId);

  await withPluginLifecycleLock(pluginId, async () => {
    await ensureManifestDependenciesAvailable(manifest, { requireEnabled: true });

    const previous = await getInstalledPlugin(pluginId);
    const canEnable =
      previous &&
      previous.installedVersion !== null &&
      (previous.lifecycleState === 'installed' || previous.lifecycleState === 'disabled');

    if (!canEnable) {
      throw new Error(`Cannot enable ${pluginId}: plugin is not installed`);
    }

    try {
      await setPluginEnabledSetting(pluginId, true);
      await upsertPluginLedgerRecord({
        manifest,
        state: 'installed',
        operationStatus: 'idle',
        enabled: true,
        installedVersion: previous.installedVersion,
        installedAt: previous.installedAt,
        upgradedAt: previous.upgradedAt,
        disabledAt: null,
        lastError: null,
      });
    } catch (error) {
      await upsertPluginLedgerRecord({
        manifest,
        state: previous.lifecycleState,
        operationStatus: 'error',
        enabled: previous.enabled,
        installedVersion: previous.installedVersion,
        installedAt: previous.installedAt,
        upgradedAt: previous.upgradedAt,
        disabledAt: previous.disabledAt,
        lastError: error instanceof Error ? error.message : String(error),
      });
      await setPluginEnabledSetting(pluginId, previous.enabled);
      throw error;
    }
  });
}

export async function upgradePlugin(pluginId: string, initiatedBy?: string): Promise<void> {
  const manifest = getManifest(pluginId);

  await withPluginLifecycleLock(pluginId, async () => {
    const previous = await getInstalledPlugin(pluginId);
    const canUpgrade =
      previous &&
      previous.installedVersion !== null &&
      (previous.lifecycleState === 'installed' || previous.lifecycleState === 'disabled');

    if (!canUpgrade) {
      throw new Error(`Cannot upgrade ${pluginId}: plugin is not successfully installed`);
    }

    validateCompatibilityAndDependencies();
    await ensureManifestDependenciesAvailable(manifest, { requireEnabled: true });

    await upsertPluginLedgerRecord({
      manifest,
      state: previous.lifecycleState,
      operationStatus: 'pending_upgrade',
      enabled: previous.enabled,
      installedVersion: previous.installedVersion,
      installedAt: previous.installedAt,
      upgradedAt: previous.upgradedAt,
      disabledAt: previous.disabledAt,
      lastError: null,
    });

    try {
      await applyPendingPluginMigrations(pluginId, { lockAlreadyHeld: true });
      await ensureManifestSettings(manifest);

      if (manifest.lifecycle?.afterUpgrade) {
        await manifest.lifecycle.afterUpgrade({
          pluginId,
          fromVersion: previous.installedVersion as string,
          toVersion: manifest.version,
          initiatedBy,
        });
      }

      await upsertPluginLedgerRecord({
        manifest,
        state: previous.lifecycleState,
        operationStatus: 'idle',
        enabled: previous.enabled,
        installedVersion: manifest.version,
        installedAt: previous.installedAt,
        upgradedAt: new Date(),
        disabledAt: previous.enabled ? null : previous.disabledAt,
        lastError: null,
      });
    } catch (error) {
      await upsertPluginLedgerRecord({
        manifest,
        state: previous.lifecycleState,
        operationStatus: 'error',
        enabled: previous.enabled,
        installedVersion: previous.installedVersion,
        installedAt: previous.installedAt,
        upgradedAt: previous.upgradedAt,
        disabledAt: previous.disabledAt,
        lastError: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  });
}

export async function disablePlugin(pluginId: string, initiatedBy?: string): Promise<void> {
  const manifest = getManifest(pluginId);

  await withPluginLifecycleLock(pluginId, async () => {
    const previous = await getInstalledPlugin(pluginId);
    if (!previous || previous.installedVersion === null) {
      throw new Error(`Cannot disable ${pluginId}: plugin is not installed`);
    }

    await ensureDependentsAllowDisable(pluginId);

    try {
      await upsertPluginLedgerRecord({
        manifest,
        state: previous.lifecycleState,
        operationStatus: 'pending_disable',
        enabled: previous.enabled,
        installedVersion: previous.installedVersion,
        installedAt: previous.installedAt,
        upgradedAt: previous.upgradedAt,
        disabledAt: previous.disabledAt,
        lastError: null,
      });

      if (manifest.lifecycle?.beforeDisable) {
        await manifest.lifecycle.beforeDisable({
          pluginId,
          fromVersion: previous.installedVersion,
          initiatedBy,
        });
      }

      await setPluginEnabledSetting(pluginId, false);
      await upsertPluginLedgerRecord({
        manifest,
        state: 'disabled',
        operationStatus: 'idle',
        enabled: false,
        installedVersion: previous.installedVersion,
        installedAt: previous.installedAt,
        upgradedAt: previous.upgradedAt,
        disabledAt: new Date(),
        lastError: null,
      });
    } catch (error) {
      await upsertPluginLedgerRecord({
        manifest,
        state: previous.lifecycleState,
        operationStatus: 'error',
        enabled: previous.enabled,
        installedVersion: previous.installedVersion,
        installedAt: previous.installedAt,
        upgradedAt: previous.upgradedAt,
        disabledAt: previous.disabledAt,
        lastError: error instanceof Error ? error.message : String(error),
      });
      await setPluginEnabledSetting(pluginId, previous.enabled);
      throw error;
    }
  });
}

export async function uninstallPlugin(pluginId: string, initiatedBy?: string): Promise<void> {
  const manifest = getManifest(pluginId);

  await withPluginLifecycleLock(pluginId, async () => {
    const previous = await getInstalledPlugin(pluginId);
    if (!previous || previous.installedVersion === null) {
      throw new Error(`Cannot uninstall ${pluginId}: plugin is not installed`);
    }

    await ensureDependentsAllowDisable(pluginId);

    try {
      await upsertPluginLedgerRecord({
        manifest,
        state: previous.lifecycleState,
        operationStatus: 'pending_uninstall',
        enabled: previous.enabled,
        installedVersion: previous.installedVersion,
        installedAt: previous.installedAt,
        upgradedAt: previous.upgradedAt,
        disabledAt: previous.disabledAt,
        lastError: null,
      });

      if (manifest.lifecycle?.beforeUninstall) {
        await manifest.lifecycle.beforeUninstall({
          pluginId,
          fromVersion: previous.installedVersion,
          initiatedBy,
        });
      }

      await setPluginEnabledSetting(pluginId, false);
      await upsertPluginLedgerRecord({
        manifest,
        state: 'uninstalled',
        operationStatus: 'idle',
        enabled: false,
        installedVersion: previous.installedVersion,
        installedAt: previous.installedAt,
        upgradedAt: previous.upgradedAt,
        disabledAt: new Date(),
        lastError: null,
      });
    } catch (error) {
      await upsertPluginLedgerRecord({
        manifest,
        state: previous.lifecycleState,
        operationStatus: 'error',
        enabled: previous.enabled,
        installedVersion: previous.installedVersion,
        installedAt: previous.installedAt,
        upgradedAt: previous.upgradedAt,
        disabledAt: previous.disabledAt,
        lastError: error instanceof Error ? error.message : String(error),
      });
      await setPluginEnabledSetting(pluginId, previous.enabled);
      throw error;
    }
  });
}

export async function purgePlugin(pluginId: string, options?: PurgeOptions): Promise<void> {
  const manifest = getManifest(pluginId);

  if (!options || options.confirmPluginId !== pluginId) {
    throw new Error(`Purge confirmation required. Re-run purge with confirmPluginId='${pluginId}'`);
  }

  await withPluginLifecycleLock(pluginId, async () => {
    const previous = await getInstalledPlugin(pluginId);

    if (!previous) {
      throw new Error(`Cannot purge ${pluginId}: lifecycle record is missing`);
    }

    if (previous.operationStatus !== 'idle') {
      throw new Error(`Cannot purge ${pluginId}: plugin has pending lifecycle operation`);
    }

    if (!(previous.lifecycleState === 'disabled' || previous.lifecycleState === 'uninstalled')) {
      throw new Error(`Cannot purge ${pluginId}: plugin must be disabled or uninstalled`);
    }

    await ensureDependentsAllowDisable(pluginId);

    try {
      await upsertPluginLedgerRecord({
        manifest,
        state: previous.lifecycleState,
        operationStatus: 'pending_purge',
        enabled: false,
        installedVersion: previous.installedVersion,
        installedAt: previous.installedAt,
        upgradedAt: previous.upgradedAt,
        disabledAt: previous.disabledAt,
        lastError: null,
      });

      if (manifest.lifecycle?.purge) {
        await manifest.lifecycle.purge({
          pluginId,
          fromVersion: previous.installedVersion ?? undefined,
          initiatedBy: options.initiatedBy,
        });
      }

      await applyPluginMigrationDowns(pluginId, { lockAlreadyHeld: true });

      const db = getDb();
      await db('devholm_plugin_migrations').where({ plugin_id: pluginId }).del();

      const pluginSettingKeys = new Set<string>([
        `plugin:${pluginId}:enabled`,
        ...(manifest.settings?.map((setting) => setting.key) ?? []),
      ]);
      await db('site_settings').whereIn('key', Array.from(pluginSettingKeys)).del();

      await upsertPluginLedgerRecord({
        manifest,
        state: 'bundled',
        operationStatus: 'idle',
        enabled: false,
        installedVersion: null,
        installedAt: null,
        upgradedAt: null,
        disabledAt: null,
        lastError: null,
      });
    } catch (error) {
      await upsertPluginLedgerRecord({
        manifest,
        state: previous.lifecycleState,
        operationStatus: 'error',
        enabled: previous.enabled,
        installedVersion: previous.installedVersion,
        installedAt: previous.installedAt,
        upgradedAt: previous.upgradedAt,
        disabledAt: previous.disabledAt,
        lastError: error instanceof Error ? error.message : String(error),
      });
      await setPluginEnabledSetting(pluginId, previous.enabled);
      throw error;
    }
  });
}
