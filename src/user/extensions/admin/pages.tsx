import type { AdminPageExtension } from '@core/types/extensions.server';
import { bundledPlugins } from '@user/extensions/plugins/registry';

export const adminPageExtensions: AdminPageExtension[] = bundledPlugins.flatMap(
  (plugin) => plugin.adminPageExtensions ?? []
);
