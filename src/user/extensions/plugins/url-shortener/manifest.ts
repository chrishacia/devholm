import type { DevholmPluginManifest } from '@core/types/plugins';
import {
  URL_SHORTENER_ENABLEMENT_KEY,
  URL_SHORTENER_PLUGIN_ID,
} from '@user/extensions/plugins/url-shortener/constants';
import { urlShortenerPurge } from '@user/extensions/plugins/url-shortener/lifecycle/hooks';
import { urlShortenerSettingsDefinitions } from '@user/extensions/plugins/url-shortener/settings/definitions';

export const urlShortenerPluginManifest: DevholmPluginManifest = {
  id: URL_SHORTENER_PLUGIN_ID,
  name: 'URL Shortener',
  description: 'Plugin-owned short-link routing, admin surfaces, and analytics foundation.',
  version: '0.1.0',
  devholmVersion: '^3.6.0',
  enablementSettingKey: URL_SHORTENER_ENABLEMENT_KEY,
  dependencies: {
    plugins: {},
    packages: {},
  },
  settings: urlShortenerSettingsDefinitions,
  publicRouteExtensionIds: ['url-shortener:redirect'],
  adminPageHrefs: [
    '/admin/url-shortener/overview',
    '/admin/url-shortener/links',
    '/admin/url-shortener/analytics',
    '/admin/url-shortener/public-submissions',
    '/admin/url-shortener/settings',
  ],
  migrations: [
    {
      id: 'url-shortener:20260701010000_url_shortener_foundation',
      file: 'db/migrations/20260701010000_url_shortener_foundation.ts',
    },
  ],
  seeds: [],
  lifecycle: {
    purge: urlShortenerPurge,
  },
};
