import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { bundledPlugins } from '@user/extensions/plugins/registry';
import {
  CALENDAR_ADMIN_API_BASE_PATH,
  CALENDAR_ADMIN_PAGE_HREF,
  CALENDAR_API_BASE_PATH,
  CALENDAR_CAPABILITY_ADMIN_MANAGEMENT,
  CALENDAR_CAPABILITY_EMBED_USAGE,
  CALENDAR_CAPABILITY_PUBLIC_BOOKING,
  CALENDAR_CAPABILITY_PUBLIC_VIEWING,
  CALENDAR_PERMISSION_ADMIN_MANAGE,
  CALENDAR_PERMISSION_EMBED_VIEW,
  CALENDAR_PERMISSION_PUBLIC_BOOK,
  CALENDAR_PERMISSION_PUBLIC_VIEW,
  CALENDAR_PLUGIN_ID,
  CALENDAR_PUBLIC_ROUTE_EXTENSION_ID,
} from '@user/extensions/plugins/calendar/constants';
import { calendarAdminPageExtensions } from '@user/extensions/plugins/calendar/admin/pages';
import { calendarApiExtensions } from '@user/extensions/plugins/calendar/api';
import { calendarPluginManifest } from '@user/extensions/plugins/calendar/manifest';
import { calendarPublicRouteExtension } from '@user/extensions/plugins/calendar/public-routes/calendar-public-route.server';
import { urlShortenerAdminPageExtensions } from '@user/extensions/plugins/url-shortener/admin/pages';
import { urlShortenerApiExtensions } from '@user/extensions/plugins/url-shortener/api';
import {
  URL_SHORTENER_CAPABILITY_ADMIN_MANAGEMENT,
  URL_SHORTENER_CAPABILITY_PUBLIC_ROUTING,
  URL_SHORTENER_PERMISSION_ADMIN_MANAGE,
  URL_SHORTENER_PERMISSION_PUBLIC_REDIRECT,
} from '@user/extensions/plugins/url-shortener/constants';
import { urlShortenerPublicRouteExtension } from '@user/extensions/plugins/url-shortener/public-routes/url-shortener-public-route.server';

describe('calendar phase 4 permission metadata alignment', () => {
  it('declares explicit calendar permission descriptors in the plugin manifest', () => {
    const permissions = calendarPluginManifest.permissions ?? [];

    expect(permissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: CALENDAR_PERMISSION_ADMIN_MANAGE,
          capability: CALENDAR_CAPABILITY_ADMIN_MANAGEMENT,
          scope: 'admin',
          runtimeOwner: 'core-filesystem',
        }),
        expect.objectContaining({
          key: CALENDAR_PERMISSION_PUBLIC_VIEW,
          capability: CALENDAR_CAPABILITY_PUBLIC_VIEWING,
          scope: 'public',
          runtimeOwner: 'core-filesystem',
        }),
        expect.objectContaining({
          key: CALENDAR_PERMISSION_PUBLIC_BOOK,
          capability: CALENDAR_CAPABILITY_PUBLIC_BOOKING,
          scope: 'policy-scoped',
          runtimeOwner: 'core-filesystem',
        }),
        expect.objectContaining({
          key: CALENDAR_PERMISSION_EMBED_VIEW,
          capability: CALENDAR_CAPABILITY_EMBED_USAGE,
          scope: 'future',
          runtimeOwner: 'core-filesystem',
        }),
      ])
    );
  });

  it('aligns calendar admin page and admin API metadata with admin manage permission', () => {
    const adminPage = calendarAdminPageExtensions.find(
      (item) => item.href === CALENDAR_ADMIN_PAGE_HREF
    );
    const adminApi = calendarApiExtensions.find(
      (item) => item.path === CALENDAR_ADMIN_API_BASE_PATH
    );

    expect(adminPage?.accessPolicy).toMatchObject({
      scope: 'admin',
      capability: CALENDAR_CAPABILITY_ADMIN_MANAGEMENT,
      permissionKeys: [CALENDAR_PERMISSION_ADMIN_MANAGE],
      runtimeOwner: 'core-filesystem',
    });

    expect(adminApi?.accessPolicy).toMatchObject({
      scope: 'admin',
      capability: CALENDAR_CAPABILITY_ADMIN_MANAGEMENT,
      permissionKeys: [CALENDAR_PERMISSION_ADMIN_MANAGE],
      runtimeOwner: 'core-filesystem',
    });
  });

  it('classifies calendar public API and route surfaces as public/policy-scoped metadata', () => {
    const publicApi = calendarApiExtensions.find((item) => item.path === CALENDAR_API_BASE_PATH);

    expect(publicApi?.accessPolicy).toMatchObject({
      scope: 'policy-scoped',
      capability: CALENDAR_CAPABILITY_PUBLIC_BOOKING,
      permissionKeys: [CALENDAR_PERMISSION_PUBLIC_VIEW, CALENDAR_PERMISSION_PUBLIC_BOOK],
      runtimeOwner: 'core-filesystem',
    });

    expect(calendarPublicRouteExtension).toMatchObject({
      id: CALENDAR_PUBLIC_ROUTE_EXTENSION_ID,
      pluginId: CALENDAR_PLUGIN_ID,
      accessPolicy: {
        scope: 'public',
        capability: CALENDAR_CAPABILITY_PUBLIC_VIEWING,
        permissionKeys: [CALENDAR_PERMISSION_PUBLIC_VIEW],
        runtimeOwner: 'core-filesystem',
      },
    });
  });

  it('keeps URL shortener permission metadata aligned for sandbox enforcement', () => {
    expect(urlShortenerApiExtensions.every((item) => item.accessPolicy?.scope === 'admin')).toBe(
      true
    );
    expect(
      urlShortenerApiExtensions.every(
        (item) => item.accessPolicy?.capability === URL_SHORTENER_CAPABILITY_ADMIN_MANAGEMENT
      )
    ).toBe(true);
    expect(
      urlShortenerApiExtensions.every((item) =>
        item.accessPolicy?.permissionKeys?.includes(URL_SHORTENER_PERMISSION_ADMIN_MANAGE)
      )
    ).toBe(true);

    expect(
      urlShortenerAdminPageExtensions.every(
        (item) => item.accessPolicy?.capability === URL_SHORTENER_CAPABILITY_ADMIN_MANAGEMENT
      )
    ).toBe(true);
    expect(
      urlShortenerAdminPageExtensions.every((item) =>
        item.accessPolicy?.permissionKeys?.includes(URL_SHORTENER_PERMISSION_ADMIN_MANAGE)
      )
    ).toBe(true);

    expect(urlShortenerPublicRouteExtension.accessPolicy).toMatchObject({
      scope: 'public',
      capability: URL_SHORTENER_CAPABILITY_PUBLIC_ROUTING,
      permissionKeys: [URL_SHORTENER_PERMISSION_PUBLIC_REDIRECT],
      runtimeOwner: 'plugin-extension',
    });
  });

  it('keeps generated plugin registry deterministic for calendar + gallery + url-shortener', () => {
    const generatedRegistryPath = path.join(process.cwd(), 'generated/plugins/registry.json');
    const generatedRegistry = JSON.parse(fs.readFileSync(generatedRegistryPath, 'utf8')) as {
      plugins: Array<{ id: string; version: string; migrations: unknown[] }>;
    };

    expect(generatedRegistry.plugins.map((plugin) => plugin.id)).toEqual([
      'calendar',
      'gallery',
      'url-shortener',
    ]);
    expect(generatedRegistry.plugins.map((plugin) => plugin.version)).toEqual([
      '0.1.0',
      '0.1.0',
      '0.1.0',
    ]);
    expect(
      generatedRegistry.plugins.find((plugin) => plugin.id === 'calendar')?.migrations
    ).toEqual([]);

    expect(bundledPlugins.map((plugin) => plugin.manifest.id)).toEqual([
      CALENDAR_PLUGIN_ID,
      'gallery',
      'url-shortener',
    ]);
  });
});
