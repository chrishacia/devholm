import type { Metadata } from 'next';
import type { AdminPageExtension } from '@core/types/extensions.server';
import type React from 'react';
import {
  UrlShortenerAnalyticsPage,
  UrlShortenerLinksPage,
  UrlShortenerOverviewPage,
  UrlShortenerPublicSubmissionsPage,
  UrlShortenerSettingsPage,
} from '@user/extensions/plugins/url-shortener/admin/ui';
import {
  URL_SHORTENER_CAPABILITY_ADMIN_MANAGEMENT,
  URL_SHORTENER_PERMISSION_ADMIN_MANAGE,
} from '@user/extensions/plugins/url-shortener/constants';
import { URL_SHORTENER_PLUGIN_ID } from '@user/extensions/plugins/url-shortener/constants';

function makePage(
  href: `/admin/${string}`,
  title: string,
  description: string,
  component: React.ComponentType
): AdminPageExtension {
  return {
    pluginId: URL_SHORTENER_PLUGIN_ID,
    href,
    accessPolicy: {
      scope: 'admin',
      capability: URL_SHORTENER_CAPABILITY_ADMIN_MANAGEMENT,
      permissionKeys: [URL_SHORTENER_PERMISSION_ADMIN_MANAGE],
      runtimeOwner: 'plugin-extension',
      notes: 'URL shortener admin surfaces execute through plugin extension runtime.',
    },
    loadPage: async () => ({
      default: component,
    }),
    getMetadata: async (): Promise<Metadata> => ({
      title,
      description,
    }),
  };
}

export const urlShortenerAdminPageExtensions: readonly AdminPageExtension[] = [
  makePage(
    '/admin/url-shortener/overview',
    'URL Shortener Overview',
    'Plugin operational summary.',
    UrlShortenerOverviewPage
  ),
  makePage(
    '/admin/url-shortener/links',
    'URL Shortener Links',
    'Manage short links.',
    UrlShortenerLinksPage
  ),
  makePage(
    '/admin/url-shortener/analytics',
    'URL Shortener Analytics',
    'Analytics dashboards.',
    UrlShortenerAnalyticsPage
  ),
  makePage(
    '/admin/url-shortener/public-submissions',
    'URL Shortener Public Submissions',
    'Public submission review tools.',
    UrlShortenerPublicSubmissionsPage
  ),
  makePage(
    '/admin/url-shortener/settings',
    'URL Shortener Settings',
    'Plugin configuration controls.',
    UrlShortenerSettingsPage
  ),
];
