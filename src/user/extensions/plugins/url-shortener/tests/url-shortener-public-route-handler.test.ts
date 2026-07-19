import { describe, expect, it, vi, beforeEach } from 'vitest';
import { handleUrlShortenerRedirect } from '@user/extensions/plugins/url-shortener/public-routes/url-shortener-redirect.server';
import {
  getUrlShortenerLinkByCode,
  recordUrlShortenerClick,
} from '@user/extensions/plugins/url-shortener/services/url-shortener-store';
import { isPluginEnabledForRequest } from '@/db/plugins-enabled';

vi.mock('@user/extensions/plugins/url-shortener/services/url-shortener-store', () => ({
  getUrlShortenerLinkByCode: vi.fn(),
  recordUrlShortenerClick: vi.fn(),
}));

vi.mock('@/db/plugins-enabled', () => ({
  isPluginEnabledForRequest: vi.fn(),
}));

function mockRequest(pathname: string, headers: Record<string, string> = {}): Request {
  return {
    url: `http://localhost:3000${pathname}`,
    headers: {
      get: (key: string) => headers[key.toLowerCase()] ?? null,
      has: (key: string) => Object.prototype.hasOwnProperty.call(headers, key.toLowerCase()),
    },
  } as unknown as Request;
}

describe('url shortener public route handler', () => {
  beforeEach(() => {
    vi.mocked(isPluginEnabledForRequest).mockResolvedValue(true);
    vi.mocked(getUrlShortenerLinkByCode).mockReset();
    vi.mocked(recordUrlShortenerClick).mockReset();
  });

  it('redirects to an active link and records a privacy-safe click', async () => {
    vi.mocked(getUrlShortenerLinkByCode).mockResolvedValue({
      id: 'link-1',
      code: 'abc123',
      destinationUrl: 'https://example.com/landing',
      title: 'Example',
      isActive: true,
      expiresAt: null,
      redirectStatusCode: 307,
      cachedClickCount: 0,
      createdAt: new Date('2026-07-07T00:00:00Z').toISOString(),
      updatedAt: new Date('2026-07-07T00:00:00Z').toISOString(),
      deletedAt: null,
    });

    const response = await handleUrlShortenerRedirect(
      'abc123',
      mockRequest('/s/abc123', { 'user-agent': 'Mozilla/5.0', referer: 'https://google.com/' })
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('https://example.com/landing');
    expect(vi.mocked(recordUrlShortenerClick)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordUrlShortenerClick)).toHaveBeenCalledWith(
      'link-1',
      expect.objectContaining({ url: 'http://localhost:3000/s/abc123' })
    );
    expect(vi.mocked(recordUrlShortenerClick).mock.calls[0]).toHaveLength(2);
  });

  it('returns 404 for missing links', async () => {
    vi.mocked(getUrlShortenerLinkByCode).mockResolvedValue(null);

    const response = await handleUrlShortenerRedirect('missing', mockRequest('/s/missing'));

    expect(response.status).toBe(404);
    expect(vi.mocked(recordUrlShortenerClick)).not.toHaveBeenCalled();
  });

  it('returns 410 for disabled links', async () => {
    vi.mocked(getUrlShortenerLinkByCode).mockResolvedValue({
      id: 'link-2',
      code: 'disabled',
      destinationUrl: 'https://example.com/disabled',
      title: null,
      isActive: false,
      expiresAt: null,
      redirectStatusCode: 302,
      cachedClickCount: 1,
      createdAt: new Date('2026-07-07T00:00:00Z').toISOString(),
      updatedAt: new Date('2026-07-07T00:00:00Z').toISOString(),
      deletedAt: null,
    });

    const response = await handleUrlShortenerRedirect('disabled', mockRequest('/s/disabled'));

    expect(response.status).toBe(410);
    expect(vi.mocked(recordUrlShortenerClick)).not.toHaveBeenCalled();
  });

  it('returns 410 for expired links', async () => {
    vi.mocked(getUrlShortenerLinkByCode).mockResolvedValue({
      id: 'link-3',
      code: 'expired',
      destinationUrl: 'https://example.com/expired',
      title: null,
      isActive: true,
      expiresAt: new Date('2020-01-01T00:00:00Z').toISOString(),
      redirectStatusCode: 302,
      cachedClickCount: 1,
      createdAt: new Date('2026-07-07T00:00:00Z').toISOString(),
      updatedAt: new Date('2026-07-07T00:00:00Z').toISOString(),
      deletedAt: null,
    });

    const response = await handleUrlShortenerRedirect('expired', mockRequest('/s/expired'));

    expect(response.status).toBe(410);
    expect(vi.mocked(recordUrlShortenerClick)).not.toHaveBeenCalled();
  });

  it('returns 404 when the plugin is disabled', async () => {
    vi.mocked(isPluginEnabledForRequest).mockResolvedValue(false);

    const response = await handleUrlShortenerRedirect('abc123', mockRequest('/s/abc123'));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: 'URL Shortener plugin is disabled',
      code: 'PLUGIN_DISABLED',
    });
    expect(vi.mocked(getUrlShortenerLinkByCode)).not.toHaveBeenCalled();
    expect(vi.mocked(recordUrlShortenerClick)).not.toHaveBeenCalled();
  });
});
