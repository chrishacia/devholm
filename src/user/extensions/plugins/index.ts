import type { DevHolmPluginDefinition } from '@core/types/plugins';
import { bundledPlugins } from '@user/extensions/plugins/registry';

export const pluginDefinitions: DevHolmPluginDefinition[] = bundledPlugins.map((plugin) => ({
  id: plugin.manifest.id,
  name: plugin.manifest.name,
  description: plugin.manifest.description,
  source: 'user',
  enabledByDefault: true,
  adminSurface: plugin.adminPageExtensions?.[0]
    ? {
        href: plugin.adminPageExtensions[0].href,
        label: plugin.manifest.name,
      }
    : undefined,
  capabilities: {
    admin: Boolean(plugin.adminPageExtensions?.length),
    api: false,
    publicRoutes: Boolean(plugin.publicRouteExtensions?.length),
    navigation: Boolean(plugin.adminPageExtensions?.length),
    sitemap: false,
    embeds: false,
  },
}));
