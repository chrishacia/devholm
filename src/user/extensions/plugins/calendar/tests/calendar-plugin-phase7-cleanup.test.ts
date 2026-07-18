import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { getPluginDefinitions } from '@core/lib/plugins';
import { CORE_NAV_ITEMS, buildNavItems } from '@/app/admin/AdminLayoutClient';
import { embedExtensions } from '@user/extensions/embeds';
import { sitemapExtensions } from '@user/extensions/seo';
import {
  CALENDAR_BASELINE_TABLES,
  CALENDAR_PLUGIN_ID,
} from '@user/extensions/plugins/calendar/constants';
import { calendarPluginManifest } from '@user/extensions/plugins/calendar/manifest';
import { calendarPublicRouteExtension } from '@user/extensions/plugins/calendar/public-routes/calendar-public-route.server';
import { urlShortenerPublicRouteExtension } from '@user/extensions/plugins/url-shortener/public-routes/url-shortener-public-route.server';

function mockRequest(pathname: string) {
  return {
    method: 'GET',
    nextUrl: { pathname },
    url: `http://localhost:3000${pathname}`,
    headers: {
      get: () => null,
      has: () => false,
    },
  } as never;
}

describe('calendar phase 7 direct core registration cleanup', () => {
  it('removes calendar from core plugin definitions and keeps bundled plugin ownership', () => {
    const definitions = getPluginDefinitions();
    const calendarDefinitions = definitions.filter((item) => item.id === CALENDAR_PLUGIN_ID);

    expect(calendarDefinitions).toHaveLength(1);
    expect(calendarDefinitions[0]).toMatchObject({
      id: CALENDAR_PLUGIN_ID,
      source: 'user',
      adminSurface: {
        href: '/admin/calendar',
      },
      capabilities: {
        admin: true,
        api: true,
        publicRoutes: true,
        navigation: true,
      },
    });

    expect(
      definitions.some((item) => item.id === CALENDAR_PLUGIN_ID && item.source === 'core')
    ).toBe(false);
  });

  it('replaces hardcoded calendar admin nav wiring with plugin metadata-driven entries', () => {
    expect(CORE_NAV_ITEMS.some((item) => item.href === '/admin/calendar')).toBe(false);
    expect(CORE_NAV_ITEMS.some((item) => item.href === '/admin/gallery')).toBe(false);

    const navItems = buildNavItems(
      {
        calendar: true,
        gallery: true,
      },
      [
        {
          pluginId: 'calendar',
          href: '/admin/calendar',
          label: 'Calendar',
        },
        {
          pluginId: 'gallery',
          href: '/admin/gallery',
          label: 'Galleries',
        },
      ]
    );

    expect(navItems.map((item) => item.href)).toEqual(
      expect.arrayContaining(['/admin/calendar', '/admin/gallery'])
    );
  });

  it('keeps filesystem route ownership + reserved route protections while metadata route adapter stays non-claiming', async () => {
    const match = await calendarPublicRouteExtension.match(
      '/calendar/demo',
      mockRequest('/calendar/demo'),
      {
        reservedRoutes: new Set(['/calendar', '/api', '/admin']),
        settings: {
          get: async () => null,
          getMany: async () => ({}),
        },
      }
    );

    expect(match).toBeNull();
  });

  it('keeps embed/sitemap direct calendar wiring as documented framework gaps', () => {
    expect(
      embedExtensions.some((item) => item.id === 'calendar-embed' && item.pluginId === 'calendar')
    ).toBe(true);
    expect(sitemapExtensions).toEqual([]);
  });

  it('keeps lifecycle safety and generated plugin registry determinism intact', () => {
    expect(calendarPluginManifest.lifecyclePolicy).toMatchObject({
      disablePolicy: 'non-destructive',
      uninstallPolicy: 'non-destructive',
      purge: {
        blockedWhenDataPresent: true,
      },
    });

    expect(CALENDAR_BASELINE_TABLES.length).toBeGreaterThan(0);

    const registryPath = path.join(process.cwd(), 'generated/plugins/registry.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as {
      plugins: Array<{ id: string; version: string; migrations: unknown[] }>;
    };

    expect(registry.plugins.map((plugin) => plugin.id)).toEqual([
      'calendar',
      'gallery',
      'url-shortener',
    ]);
    expect(registry.plugins.find((plugin) => plugin.id === CALENDAR_PLUGIN_ID)?.migrations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'calendar:20260718010000_calendar_canonical_authority',
        }),
      ])
    );
  });

  it('keeps url shortener behavior unaffected', async () => {
    const match = await urlShortenerPublicRouteExtension.match(
      '/s/abc123',
      mockRequest('/s/abc123'),
      {
        reservedRoutes: new Set(['/api', '/admin']),
        settings: {
          get: async () => null,
          getMany: async () => ({}),
        },
      }
    );

    expect(match).toEqual({ code: 'abc123', prefix: '/s' });
  });
});
