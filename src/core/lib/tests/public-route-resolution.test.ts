import { describe, expect, it } from 'vitest';
import type { NextRequest } from 'next/server';
import { resolvePublicRouteExtension } from '@core/lib/public-route-dispatcher.server';
import { vi } from 'vitest';

const isPluginEnabledForRequest = vi.hoisted(() => vi.fn());

vi.mock('@core/db/plugins-enabled', () => ({
  isPluginEnabledForRequest,
}));

function mockRequest(pathname: string): NextRequest {
  return {
    method: 'GET',
    nextUrl: { pathname },
    headers: {
      get: () => null,
      has: () => false,
    },
    url: `http://localhost:3000${pathname}`,
  } as unknown as NextRequest;
}

describe('public route resolution (tests path)', () => {
  it('rewrites /s/<code> requests to the Node public API route', async () => {
    isPluginEnabledForRequest.mockResolvedValue(true);
    const resolution = await resolvePublicRouteExtension('/s/abc123', mockRequest('/s/abc123'));

    expect(resolution.type).toBe('match');
    if (resolution.type === 'match') {
      expect(resolution.response.status).toBe(200);
      expect(resolution.response.headers.get('x-middleware-rewrite')).toContain(
        '/api/public/url-shortener/abc123'
      );
    }
  });

  it('does not claim reserved API paths', async () => {
    isPluginEnabledForRequest.mockResolvedValue(true);
    const resolution = await resolvePublicRouteExtension('/api/health', mockRequest('/api/health'));

    expect(resolution.type).toBe('no-match');
  });

  it('fails closed when canonical enablement is disabled', async () => {
    isPluginEnabledForRequest.mockResolvedValue(false);
    const resolution = await resolvePublicRouteExtension('/s/abc123', mockRequest('/s/abc123'));
    expect(resolution.type).toBe('no-match');
  });
});
