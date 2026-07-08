import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import type { ExtensionHelpers } from '@core/types/extensions.server';
import { urlShortenerApiExtensions } from '@user/extensions/plugins/url-shortener/api';
import {
  createUrlShortenerLink,
  deleteUrlShortenerLink,
  getUrlShortenerLinkByCode,
  getUrlShortenerOverview,
  getUrlShortenerSettings,
  listUrlShortenerLinks,
  updateUrlShortenerLink,
  updateUrlShortenerSettings,
} from '@user/extensions/plugins/url-shortener/services/url-shortener-store';
import { verifyPermission } from '@/lib/auth-helpers';

vi.mock('@/lib/auth-helpers', () => ({
  verifyPermission: vi.fn(),
}));

vi.mock('@user/extensions/plugins/url-shortener/services/url-shortener-store', () => ({
  createUrlShortenerLink: vi.fn(),
  deleteUrlShortenerLink: vi.fn(),
  disableUrlShortenerLink: vi.fn(),
  getUrlShortenerLinkByCode: vi.fn(),
  getUrlShortenerOverview: vi.fn(),
  getUrlShortenerSettings: vi.fn(),
  listUrlShortenerLinks: vi.fn(),
  updateUrlShortenerLink: vi.fn(),
  updateUrlShortenerSettings: vi.fn(),
}));

function mockRequest(method: string, body?: unknown): NextRequest {
  return {
    method,
    json: async () => body,
    formData: async () => new FormData(),
    headers: {
      get: () => 'application/json',
    },
  } as unknown as NextRequest;
}

function mockHelpers(): ExtensionHelpers {
  return {
    auth: (async () => null) as ExtensionHelpers['auth'],
    getDb: (() => {
      throw new Error('not used');
    }) as ExtensionHelpers['getDb'],
    verifyAdmin: (async () => null) as ExtensionHelpers['verifyAdmin'],
  };
}

describe('url shortener api extension', () => {
  beforeEach(() => {
    vi.mocked(verifyPermission).mockResolvedValue({ sub: 'admin' } as never);
    vi.mocked(createUrlShortenerLink).mockReset();
    vi.mocked(deleteUrlShortenerLink).mockReset();
    vi.mocked(getUrlShortenerLinkByCode).mockReset();
    vi.mocked(getUrlShortenerOverview).mockReset();
    vi.mocked(getUrlShortenerSettings).mockReset();
    vi.mocked(listUrlShortenerLinks).mockReset();
    vi.mocked(updateUrlShortenerLink).mockReset();
    vi.mocked(updateUrlShortenerSettings).mockReset();
  });

  it('serves overview data from the plugin namespace', async () => {
    vi.mocked(getUrlShortenerOverview).mockResolvedValue({
      totalLinks: 3,
      activeLinks: 2,
      disabledLinks: 1,
      expiredLinks: 0,
      totalClicks: 9,
      recentDailyClicks: [{ date: '2026-07-07', totalClicks: 9 }],
    });

    const response = await urlShortenerApiExtensions[0].handlers.GET!(mockRequest('GET'), {
      params: { path: ['url-shortener', 'overview'] },
      helpers: mockHelpers(),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      overview: {
        totalLinks: 3,
        activeLinks: 2,
      },
    });
  });

  it('creates links through the collection endpoint', async () => {
    vi.mocked(createUrlShortenerLink).mockResolvedValue({
      id: 'link-1',
      code: 'abc123',
      destinationUrl: 'https://example.com',
      title: 'Example',
      isActive: true,
      expiresAt: null,
      redirectStatusCode: 302,
      cachedClickCount: 0,
      createdAt: '2026-07-07T00:00:00.000Z',
      updatedAt: '2026-07-07T00:00:00.000Z',
      deletedAt: null,
    });

    const response = await urlShortenerApiExtensions[0].handlers.POST!(
      mockRequest('POST', { destinationUrl: 'https://example.com', title: 'Example' }),
      {
        params: { path: ['url-shortener', 'links'] },
        helpers: mockHelpers(),
      }
    );

    expect(response.status).toBe(201);
    expect(vi.mocked(createUrlShortenerLink)).toHaveBeenCalled();
  });

  it('updates a link through the item endpoint', async () => {
    vi.mocked(updateUrlShortenerLink).mockResolvedValue({
      id: 'link-1',
      code: 'abc123',
      destinationUrl: 'https://example.org',
      title: 'Updated',
      isActive: true,
      expiresAt: null,
      redirectStatusCode: 307,
      cachedClickCount: 1,
      createdAt: '2026-07-07T00:00:00.000Z',
      updatedAt: '2026-07-07T00:00:00.000Z',
      deletedAt: null,
    });

    const response = await urlShortenerApiExtensions[0].handlers.PATCH!(
      mockRequest('PATCH', { destinationUrl: 'https://example.org', redirectStatusCode: 307 }),
      {
        params: { path: ['url-shortener', 'links', 'abc123'] },
        helpers: mockHelpers(),
      }
    );

    expect(response.status).toBe(200);
    expect(vi.mocked(updateUrlShortenerLink)).toHaveBeenCalledWith(
      'abc123',
      expect.objectContaining({
        destinationUrl: 'https://example.org',
        redirectStatusCode: 307,
      })
    );
  });

  it('returns settings and updates them', async () => {
    vi.mocked(getUrlShortenerSettings).mockResolvedValue({
      routePrefix: '/s',
      publicCreationMode: 'admin-only',
      legacyPrefixEnabled: false,
    });

    const getResponse = await urlShortenerApiExtensions[0].handlers.GET!(mockRequest('GET'), {
      params: { path: ['url-shortener', 'settings'] },
      helpers: mockHelpers(),
    });

    expect(getResponse.status).toBe(200);

    vi.mocked(updateUrlShortenerSettings).mockResolvedValue({
      routePrefix: '/go',
      publicCreationMode: 'authenticated',
      legacyPrefixEnabled: true,
    });

    const patchResponse = await urlShortenerApiExtensions[0].handlers.PATCH!(
      mockRequest('PATCH', {
        routePrefix: '/go',
        publicCreationMode: 'authenticated',
        legacyPrefixEnabled: true,
      }),
      {
        params: { path: ['url-shortener', 'settings'] },
        helpers: mockHelpers(),
      }
    );

    expect(patchResponse.status).toBe(200);
    expect(vi.mocked(updateUrlShortenerSettings)).toHaveBeenCalledWith({
      routePrefix: '/go',
      publicCreationMode: 'authenticated',
      legacyPrefixEnabled: true,
    });
  });

  it('deletes a link through the item endpoint', async () => {
    vi.mocked(deleteUrlShortenerLink).mockResolvedValue({
      id: 'link-1',
      code: 'abc123',
      destinationUrl: 'https://example.org',
      title: 'Updated',
      isActive: false,
      expiresAt: null,
      redirectStatusCode: 302,
      cachedClickCount: 1,
      createdAt: '2026-07-07T00:00:00.000Z',
      updatedAt: '2026-07-07T00:00:00.000Z',
      deletedAt: '2026-07-07T00:00:00.000Z',
    });

    const response = await urlShortenerApiExtensions[0].handlers.DELETE!(mockRequest('DELETE'), {
      params: { path: ['url-shortener', 'links', 'abc123'] },
      helpers: mockHelpers(),
    });

    expect(response.status).toBe(200);
    expect(vi.mocked(deleteUrlShortenerLink)).toHaveBeenCalledWith('abc123');
  });

  it('rejects unauthenticated access to admin API endpoints', async () => {
    vi.mocked(verifyPermission).mockResolvedValue(null);

    const response = await urlShortenerApiExtensions[0].handlers.GET!(mockRequest('GET'), {
      params: { path: ['url-shortener', 'overview'] },
      helpers: mockHelpers(),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: 'Unauthorized' });
  });

  it('rejects invalid destination URLs during link creation', async () => {
    const response = await urlShortenerApiExtensions[0].handlers.POST!(
      mockRequest('POST', { destinationUrl: 'javascript:alert(1)' }),
      {
        params: { path: ['url-shortener', 'links'] },
        helpers: mockHelpers(),
      }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid short link payload',
    });
  });
});
