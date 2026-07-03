import { getDb } from './index';
import { getInstalledPlugin } from '@core/db/plugin-lifecycle';
import { getPluginDefinitions } from '@core/lib/plugins';
import type { PluginAdminRecord, PluginRuntimeState } from '@core/types/plugins';

function mapPluginState(row: Record<string, unknown>): PluginRuntimeState {
  return {
    id: row.key as string,
    bundled: true,
    installed: false,
    isEnabled: row.value === 'true' || row.value === '1',
    lifecycleState: 'bundled',
    operationStatus: 'idle',
    installedVersion: null,
    bundledVersion: null,
    updatedAt: (row.updated_at as Date | null) ?? null,
  };
}

function pluginSettingKey(pluginId: string) {
  return `plugin:${pluginId}:enabled`;
}

export async function syncPluginDefinitions() {
  const db = getDb();
  const definitions = getPluginDefinitions();

  await db.transaction(async (trx) => {
    for (const definition of definitions) {
      await trx('site_settings')
        .insert({
          key: pluginSettingKey(definition.id),
          value:
            definition.source === 'user' || definition.enabledByDefault === false
              ? 'false'
              : 'true',
          type: 'boolean',
          category: 'plugins',
          description: `${definition.name} plugin enabled state`,
          updated_at: new Date(),
        })
        .onConflict('key')
        .ignore();
    }
  });
}

export async function listPluginStates(): Promise<PluginAdminRecord[]> {
  const definitions = getPluginDefinitions();
  await syncPluginDefinitions();

  const [rows, installedRows] = await Promise.all([
    getDb()('site_settings')
      .select('key', 'value', 'updated_at')
      .where('category', 'plugins')
      .andWhere('key', 'like', 'plugin:%:enabled'),
    getDb()('devholm_plugins').select('*'),
  ]);

  const stateById = new Map<string, PluginRuntimeState>();
  for (const row of rows) {
    const match = /^plugin:([^:]+):enabled$/.exec(String(row.key));
    if (!match) {
      continue;
    }

    const id = match[1];
    stateById.set(id, {
      id,
      bundled: true,
      installed: false,
      isEnabled: row.value === 'true' || row.value === '1',
      lifecycleState: 'bundled',
      operationStatus: 'idle',
      installedVersion: null,
      bundledVersion: null,
      updatedAt: row.updated_at,
    });
  }

  const installedById = new Map(
    installedRows.map((row) => [
      row.plugin_id as string,
      {
        bundledVersion: row.bundled_version as string | null,
        installedVersion: row.installed_version as string | null,
        enabled: Boolean(row.enabled),
        lifecycleState: row.lifecycle_state as PluginRuntimeState['lifecycleState'],
        operationStatus: row.operation_status as PluginRuntimeState['operationStatus'],
        installedAt: row.installed_at as Date | null,
        upgradedAt: row.upgraded_at as Date | null,
        disabledAt: row.disabled_at as Date | null,
        updatedAt: row.updated_at as Date | null,
      },
    ])
  );

  return definitions.map((definition) => {
    const state = stateById.get(definition.id);
    const installed = installedById.get(definition.id);
    const installedState = installed?.lifecycleState ?? 'bundled';
    const isInstalled = installedState === 'installed' || installedState === 'disabled';
    return {
      id: definition.id,
      bundled: true,
      name: definition.name,
      description: definition.description ?? null,
      source: definition.source,
      enabledByDefault: definition.enabledByDefault !== false,
      adminSurface: definition.adminSurface ?? null,
      capabilities: definition.capabilities ?? {
        admin: false,
        api: false,
        publicRoutes: false,
        navigation: false,
        sitemap: false,
        embeds: false,
      },
      installed: isInstalled,
      isEnabled: installed ? isInstalled && installed.enabled : state?.isEnabled ?? false,
      lifecycleState: installedState,
      operationStatus: installed?.operationStatus ?? 'idle',
      installedVersion: installed?.installedVersion ?? null,
      bundledVersion: installed?.bundledVersion ?? null,
      updatedAt: installed?.updatedAt ?? state?.updatedAt ?? null,
    };
  });
}

export async function getPluginState(pluginId: string): Promise<PluginRuntimeState | null> {
  await syncPluginDefinitions();

  const definition = getPluginDefinitions().find((item) => item.id === pluginId);
  if (!definition) {
    return null;
  }

  const [row, installed] = await Promise.all([
    getDb()('site_settings')
      .select('key', 'value', 'updated_at')
      .where('key', pluginSettingKey(pluginId))
      .first(),
    getInstalledPlugin(pluginId),
  ]);

  if (installed) {
    const isInstalled =
      installed.lifecycleState === 'installed' || installed.lifecycleState === 'disabled';
    return {
      id: pluginId,
      bundled: true,
      installed: isInstalled,
      isEnabled: isInstalled && installed.enabled,
      lifecycleState: installed.lifecycleState,
      operationStatus: installed.operationStatus,
      installedVersion: installed.installedVersion,
      bundledVersion: installed.bundledVersion,
      updatedAt: installed.installedAt ?? installed.upgradedAt ?? installed.disabledAt ?? null,
    };
  }

  if (!row) {
    return {
      id: pluginId,
      bundled: true,
      installed: false,
      isEnabled: false,
      lifecycleState: 'bundled',
      operationStatus: 'idle',
      installedVersion: null,
      bundledVersion: null,
      updatedAt: null,
    };
  }

  return mapPluginState({
    key: pluginId,
    value: row.value,
    updated_at: row.updated_at,
  });
}

export async function isPluginEnabled(pluginId: string | undefined): Promise<boolean> {
  // Core extensions (no pluginId) are always enabled
  if (!pluginId) {
    return true;
  }
  const state = await getPluginState(pluginId);
  return Boolean(state?.installed && state.isEnabled);
}
