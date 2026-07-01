import { describe, expect, it } from 'vitest';
import type { NextRequest } from 'next/server';
import { dispatchPublicRoute } from '@core/lib/public-route-dispatcher-core.server';
import type { ExtensionHelpers } from '@core/types/extensions.server';
import { urlShortenerPublicRouteExtension } from '@user/extensions/plugins/url-shortener/public-routes/url-shortener-public-route.server';

function mockRequest(pathname: string): NextRequest {
  return {
    method: 'GET',
    nextUrl: { pathname },
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

  it('matches custom prefix from settings', async () => {
    const match = await urlShortenerPublicRouteExtension.match('/go/xyz', mockRequest('/go/xyz'), {
      reservedRoutes: new Set(['/api', '/admin']),
      settings: {
        get: async (key) => (key.includes('route-prefix') ? '/go/' : null),
        getMany: async () => ({}),
      },
    });

    expect(match).toEqual({
      code: 'xyz',
      prefix: '/go',
    });
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

  it('is skipped by dispatcher when plugin is disabled', async () => {
    const result = await dispatchPublicRoute('/s/abc123', mockRequest('/s/abc123'), {
      extensions: [urlShortenerPublicRouteExtension],
      isPluginEnabled: async () => false,
      getReservedRoutes: () => new Set(['/api', '/admin']),
      getHelpers: () =>
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
});
