import fs from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { dispatchPublicRoute } from '@core/lib/public-route-dispatcher-core.server';
import type { ExtensionHelpers } from '@core/types/extensions.server';
import { getReservedRoutes } from '@core/lib/reserved-routes.server';
import { publicRouteExtensions } from '@user/extensions/public-routes';
import { galleryPublicRouteExtension } from '@user/extensions/plugins/gallery/public-routes/gallery-public-route.server';
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

function matchContext(reservedRoutes: ReadonlySet<string>) {
  return {
    reservedRoutes,
    settings: {
      get: async () => null,
      getMany: async () => ({}),
    },
  };
}

describe('gallery phase 6 public-route adapter hardening', () => {
  it('keeps Gallery public adapter non-claiming for Gallery filesystem paths', async () => {
    const galleryPaths = ['/gallery/demo-slug', '/gallery/example', '/gallery'];

    for (const pathname of galleryPaths) {
      const result = await galleryPublicRouteExtension.match(pathname, mockRequest(pathname), {
        reservedRoutes: new Set(['/gallery', '/api', '/admin', '/_next']),
        settings: {
          get: async () => null,
          getMany: async () => ({}),
        },
      });

      expect(result).toBeNull();
    }
  });

  it('keeps filesystem public Gallery routes authoritative via metadata and route presence', () => {
    expect(galleryPublicRouteExtension.accessPolicy).toMatchObject({
      scope: 'public',
      runtimeOwner: 'plugin-extension',
    });
    expect(galleryPublicRouteExtension.accessPolicy?.notes).toContain('filesystem page routes');

    expect(fs.existsSync(path.join(process.cwd(), 'src/app/gallery/[slug]/page.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(process.cwd(), 'src/app/api/gallery/[slug]/route.ts'))).toBe(
      true
    );
  });

  it('keeps reserved route protection unchanged for /api, /admin, and /_next paths', async () => {
    const matchSpy = vi.spyOn(galleryPublicRouteExtension, 'match');

    const reservedPaths = ['/api/gallery/demo', '/admin/gallery', '/_next/static/chunks/main.js'];
    for (const pathname of reservedPaths) {
      const result = await dispatchPublicRoute(pathname, mockRequest(pathname), {
        extensions: [galleryPublicRouteExtension],
        isPluginEnabled: async () => true,
        getReservedRoutes: () => getReservedRoutes(),
        getHelpers: async () => ({}) as ExtensionHelpers,
        createMatchContext: (reservedRoutes) => matchContext(reservedRoutes),
      });

      expect(result).toEqual({ type: 'no-match' });
    }

    expect(matchSpy).not.toHaveBeenCalled();
    matchSpy.mockRestore();
  });

  it('keeps disabled Gallery plugin state safe with no route claim', async () => {
    const matchSpy = vi.spyOn(galleryPublicRouteExtension, 'match');

    const result = await dispatchPublicRoute('/gallery/example', mockRequest('/gallery/example'), {
      extensions: [galleryPublicRouteExtension],
      isPluginEnabled: async () => false,
      getReservedRoutes: () => getReservedRoutes(),
      getHelpers: async () => ({}) as ExtensionHelpers,
      createMatchContext: (reservedRoutes) => matchContext(reservedRoutes),
    });

    expect(result).toEqual({ type: 'no-match' });
    expect(matchSpy).not.toHaveBeenCalled();
    matchSpy.mockRestore();
  });

  it('keeps URL Shortener public-route behavior conflict-free with Gallery adapter present', async () => {
    const result = await dispatchPublicRoute('/s/abc123', mockRequest('/s/abc123'), {
      extensions: publicRouteExtensions,
      isPluginEnabled: async () => true,
      getReservedRoutes: () => getReservedRoutes(),
      getHelpers: async () => ({}) as ExtensionHelpers,
      createMatchContext: (reservedRoutes) => matchContext(reservedRoutes),
    });

    expect(result.type).toBe('match');
    if (result.type === 'match') {
      expect(result.response.status).toBe(200);
      expect(result.response.headers.get('x-middleware-rewrite')).toContain(
        '/api/public/url-shortener/abc123'
      );
    }

    const galleryMatch = await galleryPublicRouteExtension.match(
      '/s/abc123',
      mockRequest('/s/abc123'),
      {
        reservedRoutes: getReservedRoutes(),
        settings: {
          get: async () => null,
          getMany: async () => ({}),
        },
      }
    );
    expect(galleryMatch).toBeNull();
  });

  it('keeps public route adapter evaluation order deterministic', async () => {
    expect(publicRouteExtensions.map((extension) => extension.id)).toEqual([
      'calendar:public-routes',
      'gallery:public-routes',
      'url-shortener:redirect',
    ]);

    const shortenerMatch = await urlShortenerPublicRouteExtension.match(
      '/s/phase6',
      mockRequest('/s/phase6'),
      {
        reservedRoutes: getReservedRoutes(),
        settings: {
          get: async () => null,
          getMany: async () => ({}),
        },
      }
    );

    expect(shortenerMatch).toEqual({ code: 'phase6', prefix: '/s' });
  });
});
