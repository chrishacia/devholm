import type { DevholmBundledPlugin } from '@core/types/plugins';
import { urlShortenerAdminPageExtensions } from '@user/extensions/plugins/url-shortener/admin/pages';
import { urlShortenerPluginManifest } from '@user/extensions/plugins/url-shortener/manifest';
import { urlShortenerPublicRouteExtension } from '@user/extensions/plugins/url-shortener/public-routes/url-shortener-public-route.server';
import { urlShortenerSettingsDefinitions } from '@user/extensions/plugins/url-shortener/settings/definitions';

export const urlShortenerPlugin: DevholmBundledPlugin = {
  manifest: urlShortenerPluginManifest,
  settings: urlShortenerSettingsDefinitions,
  publicRouteExtensions: [urlShortenerPublicRouteExtension],
  adminPageExtensions: urlShortenerAdminPageExtensions,
};
