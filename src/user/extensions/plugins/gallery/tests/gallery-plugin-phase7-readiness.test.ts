import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { getPluginDefinitions } from '@core/lib/plugins';
import { getReservedRoutes } from '@core/lib/reserved-routes.server';
import { bundledPlugins } from '@user/extensions/plugins/registry';
import { publicRouteExtensions } from '@user/extensions/public-routes';
import { embedExtensions } from '@user/extensions/embeds';
import { sitemapExtensions } from '@user/extensions/seo';
import { galleryApiExtensions } from '@user/extensions/plugins/gallery/api';
import { galleryPluginManifest } from '@user/extensions/plugins/gallery/manifest';
import { galleryPublicRouteExtension } from '@user/extensions/plugins/gallery/public-routes/gallery-public-route.server';

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

describe('gallery phase 7 readiness boundaries', () => {
  it('keeps deferred ownership surfaces deferred', async () => {
    const galleryPublicMatch = await galleryPublicRouteExtension.match(
      '/gallery/example',
      mockRequest('/gallery/example'),
      {
        reservedRoutes: getReservedRoutes(),
        settings: {
          get: async () => null,
          getMany: async () => ({}),
        },
      }
    );

    expect(galleryPublicMatch).toBeNull();
    expect(galleryPublicRouteExtension.accessPolicy?.runtimeOwner).toBe('core-filesystem');

    // Embed bridge remains deferred: registry still uses direct core embeds with no plugin embed bridge entries.
    expect(embedExtensions.some((item) => item.id === 'gallery-embed')).toBe(true);
    const embedsIndexSource = fs.readFileSync(
      path.join(process.cwd(), 'src/user/extensions/embeds/index.ts'),
      'utf8'
    );
    expect(embedsIndexSource).toContain('const pluginEmbeds: EmbedExtensionConfig[] = []');

    // Sitemap bridge remains deferred: extension registry stays empty while filesystem sitemap route remains authoritative.
    expect(sitemapExtensions).toEqual([]);
    const sitemapRouteSource = fs.readFileSync(
      path.join(process.cwd(), 'src/app/sitemap.xml/route.ts'),
      'utf8'
    );
    expect(sitemapRouteSource).toContain('listGallerySitemapEntries');
    expect(sitemapRouteSource).toContain('getSitemapExtensionEntries');

    // Runtime settings/navigation ownership remains core-owned.
    const settingsSource = fs.readFileSync(
      path.join(process.cwd(), 'src/core/db/settings.ts'),
      'utf8'
    );
    expect(settingsSource).toContain('listGalleryPublicNavigation');
  });

  it('keeps core runtime owners and filesystem routes unchanged', () => {
    const filesystemOwnedRoutes = [
      'src/app/gallery/[slug]/page.tsx',
      'src/app/api/gallery/[slug]/route.ts',
      'src/app/admin/gallery/page.tsx',
      'src/app/api/admin/gallery/route.ts',
      'src/app/api/admin/gallery/[id]/route.ts',
      'src/app/api/admin/gallery/[id]/items/route.ts',
      'src/app/api/admin/gallery/items/[itemId]/route.ts',
    ];

    for (const relativePath of filesystemOwnedRoutes) {
      expect(fs.existsSync(path.join(process.cwd(), relativePath))).toBe(true);
    }

    const adminApi = galleryApiExtensions.find((ext) => ext.path === '/api/admin/gallery');
    const publicApi = galleryApiExtensions.find((ext) => ext.path === '/api/gallery');

    expect(adminApi?.accessPolicy?.runtimeOwner).toBe('core-filesystem');
    expect(publicApi?.accessPolicy?.runtimeOwner).toBe('core-filesystem');
    expect(adminApi?.handlers.GET).toBeTypeOf('function');
    expect(adminApi?.handlers.POST).toBeTypeOf('function');
    expect(adminApi?.handlers.PUT).toBeTypeOf('function');
    expect(adminApi?.handlers.DELETE).toBeTypeOf('function');
    expect(publicApi?.handlers).toEqual({});

    const reserved = getReservedRoutes();
    expect(reserved.has('/gallery')).toBe(true);
    expect(reserved.has('/api')).toBe(true);
    expect(reserved.has('/admin')).toBe(true);
    expect(reserved.has('/_next')).toBe(true);
  });

  it('prevents accidental migration/deletion signals', async () => {
    const galleryPaths = ['/gallery', '/gallery/demo', '/gallery/example'];
    for (const pathname of galleryPaths) {
      const result = await galleryPublicRouteExtension.match(pathname, mockRequest(pathname), {
        reservedRoutes: getReservedRoutes(),
        settings: {
          get: async () => null,
          getMany: async () => ({}),
        },
      });

      expect(result).toBeNull();
    }

    const migrationPath = path.join(
      process.cwd(),
      'src/core/db/migrations/20260629010000_add_calendar_gallery_and_media_transforms.ts'
    );
    expect(fs.existsSync(migrationPath)).toBe(true);

    const lifecycle = galleryPluginManifest.lifecyclePolicy;
    expect(lifecycle?.disablePolicy).toBe('non-destructive');
    expect(lifecycle?.uninstallPolicy).toBe('non-destructive');
    expect(lifecycle?.purge?.blockedWhenDataPresent).toBe(true);
    expect(galleryPluginManifest.migrations ?? []).toEqual([]);
  });

  it('keeps registry ownership and ordering deterministic', () => {
    const definitions = getPluginDefinitions();
    const galleryDefinitions = definitions.filter((item) => item.id === 'gallery');

    expect(galleryDefinitions).toHaveLength(1);
    expect(galleryDefinitions[0]?.source).toBe('user');
    expect(definitions.some((item) => item.id === 'gallery' && item.source === 'core')).toBe(false);

    const bundledGalleryCount = bundledPlugins.filter(
      (item) => item.manifest.id === 'gallery'
    ).length;
    expect(bundledGalleryCount).toBe(1);

    expect(publicRouteExtensions.map((item) => item.id)).toEqual([
      'calendar:public-routes',
      'gallery:public-routes',
      'url-shortener:redirect',
    ]);

    const registryPath = path.join(process.cwd(), 'generated/plugins/registry.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as {
      plugins: Array<{ id: string; migrations: unknown[] }>;
    };

    expect(registry.plugins.map((plugin) => plugin.id)).toEqual([
      'calendar',
      'gallery',
      'url-shortener',
    ]);
    expect(registry.plugins.find((plugin) => plugin.id === 'gallery')?.migrations).toEqual([]);
  });
});
