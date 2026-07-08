import { describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { dispatchPublicRoute } from '@core/lib/public-route-dispatcher-core.server';
import type { ExtensionHelpers } from '@core/types/extensions.server';
import { urlShortenerPublicRouteExtension } from '@user/extensions/plugins/url-shortener/public-routes/url-shortener-public-route.server';

function mockRequest(pathname: string): NextRequest {
  return {
    method: 'GET',
    nextUrl: { pathname },
    url: `http://localhost:3000${pathname}`,
    headers: {
      get: () => null,
      has: () => false,
    },
  } as unknown as NextRequest;
}

describe('url shortener public route extension', () => {
  it('matches default prefix with one code segment', async () => {
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

    expect(match).toEqual({
      code: 'abc123',
      prefix: '/s',
    });
  });

  it('matches dashed short code shape', async () => {
    const match = await urlShortenerPublicRouteExtension.match(
      '/s/my-link',
      mockRequest('/s/my-link'),
      {
        reservedRoutes: new Set(['/api', '/admin']),
        settings: {
          get: async () => null,
          getMany: async () => ({}),
        },
      }
    );

    expect(match).toEqual({
      code: 'my-link',
      prefix: '/s',
    });
  });

  it('does not match custom prefixes in proxy-safe static mode', async () => {
    const match = await urlShortenerPublicRouteExtension.match('/go/xyz', mockRequest('/go/xyz'), {
      reservedRoutes: new Set(['/api', '/admin']),
      settings: {
        get: async () => null,
        getMany: async () => ({}),
      },
    });

    expect(match).toBeNull();
  });

  it('does not match nested paths', async () => {
    const noMatch = await urlShortenerPublicRouteExtension.match(
      '/s/abc/extra',
      mockRequest('/s/abc/extra'),
      {
        reservedRoutes: new Set(['/api', '/admin']),
        settings: {
          get: async () => null,
          getMany: async () => ({}),
        },
      }
    );

    expect(noMatch).toBeNull();
  });

  it('rejects invalid short code shapes', async () => {
    const dotted = await urlShortenerPublicRouteExtension.match(
      '/s/bad.code',
      mockRequest('/s/bad.code'),
      {
        reservedRoutes: new Set(['/api', '/admin']),
        settings: {
          get: async () => null,
          getMany: async () => ({}),
        },
      }
    );

    const encodedSlash = await urlShortenerPublicRouteExtension.match(
      '/s/abc%2F123',
      mockRequest('/s/abc%2F123'),
      {
        reservedRoutes: new Set(['/api', '/admin']),
        settings: {
          get: async () => null,
          getMany: async () => ({}),
        },
      }
    );

    const emptyPrefix = await urlShortenerPublicRouteExtension.match('/s', mockRequest('/s'), {
      reservedRoutes: new Set(['/api', '/admin']),
      settings: {
        get: async () => null,
        getMany: async () => ({}),
      },
    });

    expect(dotted).toBeNull();
    expect(encodedSlash).toBeNull();
    expect(emptyPrefix).toBeNull();
  });

  it('is skipped by dispatcher when plugin is disabled', async () => {
    const result = await dispatchPublicRoute('/s/abc123', mockRequest('/s/abc123'), {
      extensions: [urlShortenerPublicRouteExtension],
      isPluginEnabled: async () => false,
      getReservedRoutes: () => new Set(['/api', '/admin']),
      getHelpers: async () =>
        ({
          auth: (() => Promise.resolve(null)) as ExtensionHelpers['auth'],
          getDb: (() => {
            throw new Error('not used in match');
          }) as ExtensionHelpers['getDb'],
          verifyAdmin: (async () => {
            throw new Error('not used in match');
          }) as ExtensionHelpers['verifyAdmin'],
        }) satisfies ExtensionHelpers,
      createMatchContext: (reservedRoutes) => ({
        reservedRoutes,
        settings: {
          get: async () => null,
          getMany: async () => ({}),
        },
      }),
    });

    expect(result).toEqual({ type: 'no-match' });
  });

  it('rewrites /s/<code> requests to the Node public API route', async () => {
    const result = await dispatchPublicRoute('/s/abc123', mockRequest('/s/abc123'), {
      extensions: [urlShortenerPublicRouteExtension],
      isPluginEnabled: async () => true,
      getReservedRoutes: () => new Set(['/api', '/admin']),
      getHelpers: async () => ({}) as ExtensionHelpers,
      createMatchContext: (reservedRoutes) => ({
        reservedRoutes,
        settings: {
          get: async () => null,
          getMany: async () => ({}),
        },
      }),
    });

    expect(result.type).toBe('match');
    if (result.type === 'match') {
      expect(result.response.status).toBe(200);
      expect(result.response.headers.get('x-middleware-rewrite')).toContain(
        '/api/public/url-shortener/abc123'
      );
    }
  });

  it('does not claim reserved /api paths', async () => {
    const matchSpy = vi.spyOn(urlShortenerPublicRouteExtension, 'match');

    const result = await dispatchPublicRoute(
      '/api/public/url-shortener/abc123',
      mockRequest('/api/public/url-shortener/abc123'),
      {
        extensions: [urlShortenerPublicRouteExtension],
        isPluginEnabled: async () => true,
        getReservedRoutes: () => new Set(['/api', '/admin']),
        getHelpers: async () => ({}) as ExtensionHelpers,
        createMatchContext: (reservedRoutes) => ({
          reservedRoutes,
          settings: {
            get: async () => null,
            getMany: async () => ({}),
          },
        }),
      }
    );

    expect(result.type).toBe('no-match');
    expect(matchSpy).not.toHaveBeenCalled();
    matchSpy.mockRestore();
  });
});
