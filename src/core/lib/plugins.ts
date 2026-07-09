import type { DevHolmPluginDefinition } from '@core/types/plugins';
import { pluginDefinitions as userPluginDefinitions } from '@user/extensions/plugins';

const CORE_PLUGIN_DEFINITIONS: DevHolmPluginDefinition[] = [];

function normalizePluginDefinition(
  definition: DevHolmPluginDefinition,
  source: DevHolmPluginDefinition['source']
): DevHolmPluginDefinition {
  return {
    ...definition,
    source,
    enabledByDefault: definition.enabledByDefault !== false,
    capabilities: {
      admin: Boolean(definition.capabilities?.admin),
      api: Boolean(definition.capabilities?.api),
      publicRoutes: Boolean(definition.capabilities?.publicRoutes),
      navigation: Boolean(definition.capabilities?.navigation),
      sitemap: Boolean(definition.capabilities?.sitemap),
      embeds: Boolean(definition.capabilities?.embeds),
    },
  };
}

export function getPluginDefinitions(): DevHolmPluginDefinition[] {
  const merged = [
    ...CORE_PLUGIN_DEFINITIONS.map((definition) => normalizePluginDefinition(definition, 'core')),
    ...userPluginDefinitions.map((definition) => normalizePluginDefinition(definition, 'user')),
  ];

  const seen = new Set<string>();

  return merged.filter((definition) => {
    if (seen.has(definition.id)) {
      return false;
    }

    seen.add(definition.id);
    return true;
  });
}

export function getPluginDefinition(pluginId: string) {
  return getPluginDefinitions().find((definition) => definition.id === pluginId) ?? null;
}
