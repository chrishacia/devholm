import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPluginDefinitions } from '@core/lib/plugins';
import {
  GALLERY_BASELINE_SCHEMA_VERSION,
  GALLERY_BASELINE_TABLES,
} from '@user/extensions/plugins/gallery/constants';
import { galleryAdminPageExtensions } from '@user/extensions/plugins/gallery/admin/pages';
import { galleryApiExtensions } from '@user/extensions/plugins/gallery/api';
import { galleryPublicRouteExtension } from '@user/extensions/plugins/gallery/public-routes/gallery-public-route.server';
import { calendarPluginManifest } from '@user/extensions/plugins/calendar/manifest';
import { urlShortenerPluginManifest } from '@user/extensions/plugins/url-shortener/manifest';
import { urlShortenerPublicRouteExtension } from '@user/extensions/plugins/url-shortener/public-routes/url-shortener-public-route.server';

const { getDbMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
}));

vi.mock('@/db', () => ({
  getDb: getDbMock,
}));

type LifecycleDbCounts = {
  gallery_collections?: number;
  gallery_items?: number;
  gallery_media_references?: number;
};

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

function createGalleryDbMock(counts: LifecycleDbCounts) {
  const hasTable = vi.fn(async () => true);
  const dropTable = vi.fn(async () => undefined);
  const dropTableIfExists = vi.fn(async () => undefined);
  const renameTable = vi.fn(async () => undefined);
  const alterTable = vi.fn(async () => undefined);
  const del = vi.fn(async () => 0);
  const deleteRows = vi.fn(async () => 0);
  const truncate = vi.fn(async () => 0);
  const update = vi.fn(async () => 0);
  const insert = vi.fn(async () => 0);

  const dbMock = Object.assign(
    vi.fn((tableName: string) => ({
      del,
      delete: deleteRows,
      truncate,
      update,
      insert,
      count: vi.fn(() => ({
        first: vi.fn(async () => ({
          row_count: counts[tableName as keyof LifecycleDbCounts] ?? 0,
        })),
      })),
      whereNotNull: vi.fn(() => ({
        count: vi.fn(() => ({
          first: vi.fn(async () => ({ row_count: counts.gallery_media_references ?? 0 })),
        })),
      })),
    })),
    {
      schema: {
        hasTable,
        dropTable,
        dropTableIfExists,
        renameTable,
        alterTable,
      },
    }
  );

  return {
    dbMock,
    mocks: {
      hasTable,
      dropTable,
      dropTableIfExists,
      renameTable,
      alterTable,
      del,
      deleteRows,
      truncate,
      update,
      insert,
    },
  };
}

async function loadGalleryHooksWithDb(counts: LifecycleDbCounts) {
  const { dbMock, mocks } = createGalleryDbMock(counts);
  getDbMock.mockReturnValue(dbMock);

  const hooks = await import('@user/extensions/plugins/gallery/lifecycle/hooks');

  return { hooks, mocks };
}

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('gallery phase 5 lifecycle hardening', () => {
  it('keeps disable behavior non-destructive and route-neutral', async () => {
    const { hooks, mocks } = await loadGalleryHooksWithDb({
      gallery_collections: 3,
      gallery_items: 5,
      gallery_media_references: 2,
    });

    const beforePublicRoute = await galleryPublicRouteExtension.match(
      '/gallery/demo',
      mockRequest('/gallery/demo'),
      {
        reservedRoutes: new Set(['/gallery', '/api', '/admin']),
        settings: {
          get: async () => null,
          getMany: async () => ({}),
        },
      }
    );

    const adminApiExtension = galleryApiExtensions.find(
      (item) => item.path === '/api/admin/gallery'
    );
    const adminPageExtension = galleryAdminPageExtensions.find(
      (item) => item.href === '/admin/gallery'
    );
    const adminHandlerBefore = adminApiExtension?.handlers.GET;

    await hooks.galleryBeforeDisable();

    const afterPublicRoute = await galleryPublicRouteExtension.match(
      '/gallery/demo',
      mockRequest('/gallery/demo'),
      {
        reservedRoutes: new Set(['/gallery', '/api', '/admin']),
        settings: {
          get: async () => null,
          getMany: async () => ({}),
        },
      }
    );

    expect(beforePublicRoute).toBeNull();
    expect(afterPublicRoute).toBeNull();
    expect(adminApiExtension?.handlers.GET).toBe(adminHandlerBefore);
    expect(adminPageExtension?.href).toBe('/admin/gallery');
    expect(adminPageExtension?.accessPolicy?.runtimeOwner).toBe('plugin-extension');
    expect(mocks.dropTable).not.toHaveBeenCalled();
    expect(mocks.dropTableIfExists).not.toHaveBeenCalled();
    expect(mocks.del).not.toHaveBeenCalled();
    expect(mocks.deleteRows).not.toHaveBeenCalled();
    expect(mocks.truncate).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.hasTable).toHaveBeenCalledTimes(GALLERY_BASELINE_TABLES.length);
  });

  it('keeps uninstall behavior non-destructive and preserves migration history assumptions', async () => {
    const { hooks, mocks } = await loadGalleryHooksWithDb({
      gallery_collections: 1,
      gallery_items: 0,
      gallery_media_references: 0,
    });
    const { galleryPluginManifest } = await import('@user/extensions/plugins/gallery/manifest');

    await hooks.galleryBeforeUninstall();

    expect(mocks.dropTable).not.toHaveBeenCalled();
    expect(mocks.dropTableIfExists).not.toHaveBeenCalled();
    expect(mocks.renameTable).not.toHaveBeenCalled();
    expect(mocks.alterTable).not.toHaveBeenCalled();
    expect(mocks.del).not.toHaveBeenCalled();
    expect(mocks.deleteRows).not.toHaveBeenCalled();
    expect(mocks.truncate).not.toHaveBeenCalled();
    expect(galleryPluginManifest.migrations ?? []).toHaveLength(1);
    expect(galleryPluginManifest.lifecyclePolicy?.routeOwnershipLimitation).toContain(
      'delegate to plugin extension runtime'
    );
    expect(galleryPluginManifest.lifecyclePolicy?.baselineAdoptionNote).toContain('20260629010000');
  });

  it('blocks purge when gallery collections, items, and media references exist', async () => {
    const { hooks } = await loadGalleryHooksWithDb({
      gallery_collections: 2,
      gallery_items: 4,
      gallery_media_references: 3,
    });

    await expect(hooks.galleryPurge()).rejects.toThrow(
      /Gallery purge is blocked while data or media references exist/
    );
  });

  it('blocks purge when only collections or items exist', async () => {
    const collectionOnly = await loadGalleryHooksWithDb({
      gallery_collections: 1,
      gallery_items: 0,
      gallery_media_references: 0,
    });

    const itemOnly = await loadGalleryHooksWithDb({
      gallery_collections: 0,
      gallery_items: 1,
      gallery_media_references: 0,
    });

    await expect(collectionOnly.hooks.galleryPurge()).rejects.toThrow(
      /Gallery purge is blocked while data or media references exist/
    );
    await expect(itemOnly.hooks.galleryPurge()).rejects.toThrow(
      /Gallery purge is blocked while data or media references exist/
    );
  });

  it('adopts the shared baseline and keeps generated registry ordering deterministic', async () => {
    const { galleryPluginManifest } = await import('@user/extensions/plugins/gallery/manifest');

    expect(galleryPluginManifest.migrations ?? []).toHaveLength(1);
    expect(galleryPluginManifest.settings?.map((item) => item.key)).toEqual(
      expect.arrayContaining(['plugin:gallery:baseline-schema-version'])
    );
    expect(
      galleryPluginManifest.settings?.find(
        (item) => item.key === 'plugin:gallery:baseline-schema-version'
      )?.defaultValue
    ).toBe(GALLERY_BASELINE_SCHEMA_VERSION);
    expect(GALLERY_BASELINE_TABLES).toEqual(['gallery_collections', 'gallery_items']);

    const migrationPath = path.join(
      process.cwd(),
      'src/core/db/migrations/20260629010000_add_calendar_gallery_and_media_transforms.ts'
    );
    expect(fs.existsSync(migrationPath)).toBe(true);

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
    expect(registry.plugins.find((plugin) => plugin.id === 'gallery')?.migrations).toHaveLength(1);
  });

  it('keeps calendar lifecycle metadata and url shortener behavior unaffected', async () => {
    expect(calendarPluginManifest.lifecyclePolicy).toMatchObject({
      disablePolicy: 'non-destructive',
      uninstallPolicy: 'non-destructive',
    });
    expect(urlShortenerPluginManifest.lifecyclePolicy).toBeUndefined();

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
    expect(getPluginDefinitions().map((plugin) => plugin.id)).toEqual([
      'calendar',
      'gallery',
      'url-shortener',
    ]);
  });
});
