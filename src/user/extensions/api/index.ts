import type { ApiExtension } from '@core/types/extensions.server';
import { bundledPlugins } from '@user/extensions/plugins/registry';

export const apiExtensions: ApiExtension[] = bundledPlugins.flatMap(
  (plugin) => plugin.apiExtensions ?? []
);
