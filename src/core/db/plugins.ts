import { getDb } from './index';
import { getPluginDefinitions } from '@core/lib/plugins';
import type { PluginAdminRecord, PluginRuntimeState } from '@core/types/plugins';

function mapPluginState(row: Record<string, unknown>): PluginRuntimeState {
  return {
    id: row.key as string,
    isEnabled: row.value === 'true' || row.value === '1',
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
          value: definition.enabledByDefault === false ? 'false' : 'true',
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

  const rows = await getDb()('site_settings')
    .select('key', 'value', 'updated_at')
    .where('category', 'plugins');

  const stateById = new Map<string, PluginRuntimeState>();
  for (const row of rows) {
    const state = mapPluginState({
      key: String(row.key)
        .replace(/^plugin:/, '')
        .replace(/:enabled$/, ''),
      value: row.value,
      updated_at: row.updated_at,
    });
    stateById.set(state.id, state);
  }

  return definitions.map((definition) => {
    const state = stateById.get(definition.id);
    return {
      id: definition.id,
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
      isEnabled: state?.isEnabled ?? definition.enabledByDefault !== false,
      updatedAt: state?.updatedAt ?? null,
    };
  });
}

export async function getPluginState(pluginId: string): Promise<PluginRuntimeState | null> {
  await syncPluginDefinitions();

  const row = await getDb()('site_settings')
    .select('key', 'value', 'updated_at')
    .where('key', pluginSettingKey(pluginId))
    .first();

  if (!row) {
    return null;
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
  return state?.isEnabled ?? false;
}

export async function updatePluginEnabledState(pluginId: string, isEnabled: boolean) {
  await syncPluginDefinitions();

  const updated = await getDb()('site_settings')
    .where('key', pluginSettingKey(pluginId))
    .update({
      value: isEnabled ? 'true' : 'false',
      updated_at: new Date(),
    });

  return updated > 0;
}
