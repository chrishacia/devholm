import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPluginDefinitions } from '@core/lib/plugins';
import { bundledPlugins } from '@user/extensions/plugins/registry';
import {
  GALLERY_BASELINE_TABLES,
  GALLERY_LIFECYCLE_DATA_RETENTION_POLICY,
  GALLERY_LIFECYCLE_DATA_RETENTION_POLICY_KEY,
  GALLERY_LIFECYCLE_PURGE_POLICY_KEY,
  GALLERY_LIFECYCLE_UNINSTALL_POLICY,
  GALLERY_LIFECYCLE_UNINSTALL_POLICY_KEY,
  GALLERY_PLUGIN_ID,
} from '@user/extensions/plugins/gallery/constants';
import { galleryPluginManifest } from '@user/extensions/plugins/gallery/manifest';
import { calendarPluginManifest } from '@user/extensions/plugins/calendar/manifest';
import { urlShortenerPluginManifest } from '@user/extensions/plugins/url-shortener/manifest';
import { urlShortenerPublicRouteExtension } from '@user/extensions/plugins/url-shortener/public-routes/url-shortener-public-route.server';

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

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

describe('gallery phase 1/2 ownership conversion', () => {
  it('registers gallery in bundled plugin registry with manifest metadata', () => {
    const plugin = bundledPlugins.find((item) => item.manifest.id === GALLERY_PLUGIN_ID);

    expect(plugin).toBeDefined();
    expect(plugin?.manifest.name).toBe('Gallery');
    expect(plugin?.adminPageExtensions?.map((item) => item.href)).toContain('/admin/gallery');
    expect(plugin?.apiExtensions?.map((item) => item.path)).toEqual(
      expect.arrayContaining(['/api/gallery', '/api/admin/gallery'])
    );
    expect(plugin?.publicRouteExtensions?.map((item) => item.id)).toContain(
      'gallery:public-routes'
    );
  });

  it('removes old direct core gallery definition and keeps a single bundled/user definition', () => {
    const definitions = getPluginDefinitions();
    const galleryDefinitions = definitions.filter((item) => item.id === GALLERY_PLUGIN_ID);

    expect(galleryDefinitions).toHaveLength(1);
    expect(galleryDefinitions[0]).toMatchObject({
      id: GALLERY_PLUGIN_ID,
      source: 'user',
      adminSurface: {
        href: '/admin/gallery',
      },
      capabilities: {
        admin: true,
        api: true,
        publicRoutes: true,
        navigation: true,
      },
    });

    expect(
      definitions.some((item) => item.id === GALLERY_PLUGIN_ID && item.source === 'core')
    ).toBe(false);
  });

  it('advertises non-destructive lifecycle policy metadata', () => {
    expect(galleryPluginManifest.lifecyclePolicy).toMatchObject({
      disablePolicy: 'non-destructive',
      uninstallPolicy: 'non-destructive',
      dataRetention: GALLERY_LIFECYCLE_DATA_RETENTION_POLICY,
      purge: {
        requiresConfirmPluginId: true,
        destructiveDataWipe: 'blocked',
        blockedWhenDataPresent: true,
      },
    });

    expect(galleryPluginManifest.settings?.map((setting) => setting.key)).toEqual(
      expect.arrayContaining([
        GALLERY_LIFECYCLE_DATA_RETENTION_POLICY_KEY,
        GALLERY_LIFECYCLE_UNINSTALL_POLICY_KEY,
        GALLERY_LIFECYCLE_PURGE_POLICY_KEY,
      ])
    );

    const uninstallSetting = galleryPluginManifest.settings?.find(
      (setting) => setting.key === GALLERY_LIFECYCLE_UNINSTALL_POLICY_KEY
    );
    expect(uninstallSetting?.defaultValue).toBe(GALLERY_LIFECYCLE_UNINSTALL_POLICY);
  });

  it('keeps disable/uninstall hooks non-destructive while validating baseline tables', async () => {
    const hasTable = vi.fn(async () => true);
    const del = vi.fn(async () => 0);
    const dbMock = Object.assign(
      vi.fn(() => ({
        del,
      })),
      {
        schema: {
          hasTable,
        },
      }
    );

    vi.doMock('@/db', () => ({
      getDb: vi.fn(() => dbMock),
    }));

    const { galleryBeforeDisable, galleryBeforeUninstall } = await import(
      '@user/extensions/plugins/gallery/lifecycle/hooks'
    );

    await galleryBeforeDisable();
    await galleryBeforeUninstall();

    expect(hasTable).toHaveBeenCalledTimes(GALLERY_BASELINE_TABLES.length * 2);
    expect(del).not.toHaveBeenCalled();
  });

  it('blocks purge when gallery data or media references exist', async () => {
    const hasTable = vi.fn(async () => true);
    const tableCounts: Record<string, number> = {
      gallery_collections: 1,
      gallery_items: 3,
    };

    const dbMock = Object.assign(
      vi.fn((tableName: string) => ({
        whereNotNull: vi.fn(() => ({
          count: vi.fn(() => ({
            first: vi.fn(async () => ({ row_count: 2 })),
          })),
        })),
        count: vi.fn(() => ({
          first: vi.fn(async () => ({ row_count: tableCounts[tableName] ?? 0 })),
        })),
      })),
      {
        schema: {
          hasTable,
        },
      }
    );

    vi.doMock('@/db', () => ({
      getDb: vi.fn(() => dbMock),
    }));

    const { galleryPurge } = await import('@user/extensions/plugins/gallery/lifecycle/hooks');

    await expect(galleryPurge()).rejects.toThrow(
      /Gallery purge is blocked while data or media references exist/
    );
  });

  it('keeps generated registry deterministic for calendar/gallery/url-shortener', () => {
    const registryPath = path.join(process.cwd(), 'generated/plugins/registry.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as {
      plugins: Array<{ id: string; version: string; migrations: unknown[] }>;
    };

    expect(registry.plugins.map((plugin) => plugin.id)).toEqual([
      'calendar',
      'gallery',
      'url-shortener',
    ]);
    expect(registry.plugins.map((plugin) => plugin.version)).toEqual(['0.1.0', '0.1.0', '0.1.0']);
    expect(registry.plugins.find((plugin) => plugin.id === GALLERY_PLUGIN_ID)?.migrations).toEqual(
      []
    );
  });

  it('keeps calendar and url shortener behavior unaffected', async () => {
    expect(calendarPluginManifest.id).toBe('calendar');
    expect(urlShortenerPluginManifest.id).toBe('url-shortener');

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
