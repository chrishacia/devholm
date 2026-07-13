import type { DevholmPluginManifest } from '@core/types/plugins';
import {
  URL_SHORTENER_CAPABILITY_ADMIN_MANAGEMENT,
  URL_SHORTENER_CAPABILITY_PUBLIC_ROUTING,
  URL_SHORTENER_ENABLEMENT_KEY,
  URL_SHORTENER_PERMISSION_ADMIN_MANAGE,
  URL_SHORTENER_PERMISSION_PUBLIC_REDIRECT,
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
  permissions: [
    {
      key: URL_SHORTENER_PERMISSION_ADMIN_MANAGE,
      capability: URL_SHORTENER_CAPABILITY_ADMIN_MANAGEMENT,
      scope: 'admin',
      description: 'Manage URL shortener links, settings, and operational analytics.',
      runtimeOwner: 'plugin-extension',
    },
    {
      key: URL_SHORTENER_PERMISSION_PUBLIC_REDIRECT,
      capability: URL_SHORTENER_CAPABILITY_PUBLIC_ROUTING,
      scope: 'public',
      description: 'Resolve short-code public route claims and redirect rewrites.',
      runtimeOwner: 'plugin-extension',
    },
  ],
  lifecycleAuthorization: {
    capability: URL_SHORTENER_CAPABILITY_ADMIN_MANAGEMENT,
    permissionKeys: [URL_SHORTENER_PERMISSION_ADMIN_MANAGE],
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
