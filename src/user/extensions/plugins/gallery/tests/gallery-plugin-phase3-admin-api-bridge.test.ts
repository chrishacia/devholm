import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { galleryApiExtensions } from '@user/extensions/plugins/gallery/api';
import {
  handleGalleryAdminCollectionRoot,
  handleGalleryAdminCollectionById,
} from '@user/extensions/plugins/gallery/api/handlers';
import { galleryPublicRouteExtension } from '@user/extensions/plugins/gallery/public-routes/gallery-public-route.server';
import { calendarPluginManifest } from '@user/extensions/plugins/calendar/manifest';
import { urlShortenerPluginManifest } from '@user/extensions/plugins/url-shortener/manifest';
import { urlShortenerPublicRouteExtension } from '@user/extensions/plugins/url-shortener/public-routes/url-shortener-public-route.server';

const runApiExtension = vi.hoisted(() => vi.fn());

vi.mock('@core/lib/extensions.server', () => ({
  runApiExtension,
}));

function mockRequest(pathname: string) {
  return {
    method: 'GET',
    nextUrl: { pathname },
    url: `http://localhost:3000${pathname}`,
    headers: {
      get: () => null,
      has: () => false,
    },
    json: async () => ({}),
  } as never;
}

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('gallery phase 3 admin api metadata bridge', () => {
  it('registers non-empty admin API extension handlers with admin-scoped metadata', () => {
    const adminExtension = galleryApiExtensions.find((item) => item.path === '/api/admin/gallery');

    expect(adminExtension).toBeDefined();
    expect(adminExtension?.accessPolicy).toMatchObject({
      scope: 'admin',
      runtimeOwner: 'plugin-extension',
    });
    expect(typeof adminExtension?.handlers.GET).toBe('function');
    expect(typeof adminExtension?.handlers.POST).toBe('function');
    expect(typeof adminExtension?.handlers.PUT).toBe('function');
    expect(typeof adminExtension?.handlers.DELETE).toBe('function');
  });

  it('keeps public route adapter metadata non-claiming', async () => {
    const result = await galleryPublicRouteExtension.match(
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

    expect(result).toBeNull();
  });

  it('keeps filesystem admin gallery routes present and externally authoritative', () => {
    const expectedFiles = [
      'src/app/api/admin/gallery/route.ts',
      'src/app/api/admin/gallery/[id]/route.ts',
      'src/app/api/admin/gallery/[id]/items/route.ts',
      'src/app/api/admin/gallery/items/[itemId]/route.ts',
    ];

    for (const file of expectedFiles) {
      expect(fs.existsSync(path.join(process.cwd(), file))).toBe(true);
    }
  });

  it('delegates filesystem route handlers to runApiExtension using canonical paths', async () => {
    runApiExtension.mockImplementation(async () => Response.json({ ok: true }));

    const rootModule = await import('@/app/api/admin/gallery/route');
    const byIdModule = await import('@/app/api/admin/gallery/[id]/route');
    const itemsModule = await import('@/app/api/admin/gallery/[id]/items/route');
    const itemByIdModule = await import('@/app/api/admin/gallery/items/[itemId]/route');

    await rootModule.GET(mockRequest('/api/admin/gallery'));
    await rootModule.POST(mockRequest('/api/admin/gallery'));
    await byIdModule.GET(mockRequest('/api/admin/gallery/abc'), {
      params: Promise.resolve({ id: 'abc' }),
    });
    await byIdModule.PUT(mockRequest('/api/admin/gallery/abc'), {
      params: Promise.resolve({ id: 'abc' }),
    });
    await byIdModule.DELETE(mockRequest('/api/admin/gallery/abc'), {
      params: Promise.resolve({ id: 'abc' }),
    });
    await itemsModule.GET(mockRequest('/api/admin/gallery/abc/items'), {
      params: Promise.resolve({ id: 'abc' }),
    });
    await itemsModule.POST(mockRequest('/api/admin/gallery/abc/items'), {
      params: Promise.resolve({ id: 'abc' }),
    });
    await itemByIdModule.PUT(mockRequest('/api/admin/gallery/items/xyz'), {
      params: Promise.resolve({ itemId: 'xyz' }),
    });
    await itemByIdModule.DELETE(mockRequest('/api/admin/gallery/items/xyz'), {
      params: Promise.resolve({ itemId: 'xyz' }),
    });

    expect(runApiExtension).toHaveBeenNthCalledWith(1, 'GET', expect.any(Object), [
      'admin',
      'gallery',
    ]);
    expect(runApiExtension).toHaveBeenNthCalledWith(2, 'POST', expect.any(Object), [
      'admin',
      'gallery',
    ]);
    expect(runApiExtension).toHaveBeenNthCalledWith(3, 'GET', expect.any(Object), [
      'admin',
      'gallery',
      'abc',
    ]);
    expect(runApiExtension).toHaveBeenNthCalledWith(4, 'PUT', expect.any(Object), [
      'admin',
      'gallery',
      'abc',
    ]);
    expect(runApiExtension).toHaveBeenNthCalledWith(5, 'DELETE', expect.any(Object), [
      'admin',
      'gallery',
      'abc',
    ]);
    expect(runApiExtension).toHaveBeenNthCalledWith(6, 'GET', expect.any(Object), [
      'admin',
      'gallery',
      'abc',
      'items',
    ]);
    expect(runApiExtension).toHaveBeenNthCalledWith(7, 'POST', expect.any(Object), [
      'admin',
      'gallery',
      'abc',
      'items',
    ]);
    expect(runApiExtension).toHaveBeenNthCalledWith(8, 'PUT', expect.any(Object), [
      'admin',
      'gallery',
      'items',
      'xyz',
    ]);
    expect(runApiExtension).toHaveBeenNthCalledWith(9, 'DELETE', expect.any(Object), [
      'admin',
      'gallery',
      'items',
      'xyz',
    ]);
  });

  it('returns 404 when delegated admin route has no extension match', async () => {
    runApiExtension.mockResolvedValueOnce(null);

    const rootModule = await import('@/app/api/admin/gallery/route');
    const response = await rootModule.GET(mockRequest('/api/admin/gallery'));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Not found' });
  });

  it('preserves verifyAdmin unauthorized guard behavior in shared handlers and extension bridge', async () => {
    const unauthorizedRoot = await handleGalleryAdminCollectionRoot(
      'GET',
      mockRequest('/api/admin/gallery'),
      {
        verifyAdmin: vi.fn(async () => null) as never,
      }
    );

    expect(unauthorizedRoot.status).toBe(401);
    await expect(unauthorizedRoot.json()).resolves.toEqual({ error: 'Unauthorized' });

    const unauthorizedById = await handleGalleryAdminCollectionById(
      'GET',
      mockRequest('/api/admin/gallery/abc'),
      'abc',
      {
        verifyAdmin: vi.fn(async () => null) as never,
      }
    );

    expect(unauthorizedById.status).toBe(401);

    const adminExtension = galleryApiExtensions.find((item) => item.path === '/api/admin/gallery');
    const extensionUnauthorized = await adminExtension?.handlers.GET?.(
      mockRequest('/api/admin/gallery') as never,
      {
        params: { path: ['admin', 'gallery'] },
        helpers: {
          auth: vi.fn() as never,
          getDb: vi.fn() as never,
          verifyAdmin: vi.fn(async () => null) as never,
        },
      }
    );

    expect(extensionUnauthorized?.status).toBe(401);
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

  it('keeps generated plugin registry deterministic', () => {
    const registryPath = path.join(process.cwd(), 'generated/plugins/registry.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as {
      plugins: Array<{ id: string; version: string; migrations: unknown[] }>;
    };

    expect(registry.plugins.map((plugin) => plugin.id)).toEqual([
      'calendar',
      'gallery',
      'url-shortener',
    ]);
  });
});
