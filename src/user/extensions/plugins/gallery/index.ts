import type { DevholmBundledPlugin } from '@core/types/plugins';
import { galleryAdminPageExtensions } from '@user/extensions/plugins/gallery/admin/pages';
import { galleryApiExtensions } from '@user/extensions/plugins/gallery/api';
import { galleryPluginManifest } from '@user/extensions/plugins/gallery/manifest';
import { galleryPublicRouteExtension } from '@user/extensions/plugins/gallery/public-routes/gallery-public-route.server';
import { gallerySettingsDefinitions } from '@user/extensions/plugins/gallery/settings/definitions';

export const galleryPlugin: DevholmBundledPlugin = {
  manifest: galleryPluginManifest,
  settings: gallerySettingsDefinitions,
  apiExtensions: galleryApiExtensions,
  publicRouteExtensions: [galleryPublicRouteExtension],
  adminPageExtensions: galleryAdminPageExtensions,
};
