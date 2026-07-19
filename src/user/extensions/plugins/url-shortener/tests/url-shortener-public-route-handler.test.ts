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

function getLocationQuery(response: Response): URLSearchParams {
  const location = response.headers.get('location');
  expect(location).toBeTruthy();
  return new URL(location as string).searchParams;
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

  it('preserves distinct destination and incoming query parameters on redirect', async () => {
    vi.mocked(getUrlShortenerLinkByCode).mockResolvedValue({
      id: 'link-query',
      code: 'query-pass',
      destinationUrl: 'https://example.com/landing?from=dest',
      title: 'Query Pass',
      isActive: true,
      expiresAt: null,
      redirectStatusCode: 302,
      cachedClickCount: 0,
      createdAt: new Date('2026-07-07T00:00:00Z').toISOString(),
      updatedAt: new Date('2026-07-07T00:00:00Z').toISOString(),
      deletedAt: null,
    });

    const response = await handleUrlShortenerRedirect(
      'query-pass',
      mockRequest('/s/query-pass?utm_source=test&campaign=issue100')
    );

    expect(response.status).toBe(302);
    const params = getLocationQuery(response);
    expect(params.get('from')).toBe('dest');
    expect(params.get('utm_source')).toBe('test');
    expect(params.get('campaign')).toBe('issue100');
    expect(vi.mocked(recordUrlShortenerClick)).toHaveBeenCalledTimes(1);
  });

  it('keeps destination query parameters when incoming query is empty', async () => {
    vi.mocked(getUrlShortenerLinkByCode).mockResolvedValue({
      id: 'link-only-destination',
      code: 'only-destination',
      destinationUrl: 'https://example.com/landing?existing=1&flag=',
      title: 'Only Destination Query',
      isActive: true,
      expiresAt: null,
      redirectStatusCode: 302,
      cachedClickCount: 0,
      createdAt: new Date('2026-07-07T00:00:00Z').toISOString(),
      updatedAt: new Date('2026-07-07T00:00:00Z').toISOString(),
      deletedAt: null,
    });

    const response = await handleUrlShortenerRedirect(
      'only-destination',
      mockRequest('/s/only-destination')
    );

    expect(response.status).toBe(302);
    const params = getLocationQuery(response);
    expect(params.get('existing')).toBe('1');
    expect(params.get('flag')).toBe('');
  });

  it('does not duplicate identical incoming key/value pairs already present in destination', async () => {
    vi.mocked(getUrlShortenerLinkByCode).mockResolvedValue({
      id: 'link-no-dup',
      code: 'no-dup',
      destinationUrl: 'https://example.com/landing?utm_source=a&tag=one&tag=one',
      title: 'No Duplicate',
      isActive: true,
      expiresAt: null,
      redirectStatusCode: 302,
      cachedClickCount: 0,
      createdAt: new Date('2026-07-07T00:00:00Z').toISOString(),
      updatedAt: new Date('2026-07-07T00:00:00Z').toISOString(),
      deletedAt: null,
    });

    const response = await handleUrlShortenerRedirect(
      'no-dup',
      mockRequest('/s/no-dup?utm_source=a&utm_source=a&tag=one&tag=two')
    );

    expect(response.status).toBe(302);
    const params = getLocationQuery(response);
    expect(params.getAll('utm_source')).toEqual(['a']);
    expect(params.getAll('tag').sort()).toEqual(['one', 'one', 'two']);
  });

  it('preserves different values for the same key and handles encoded values', async () => {
    vi.mocked(getUrlShortenerLinkByCode).mockResolvedValue({
      id: 'link-multi-value',
      code: 'multi-value',
      destinationUrl: 'https://example.com/landing?filter=a%20b&filter=x',
      title: 'Multi Value',
      isActive: true,
      expiresAt: null,
      redirectStatusCode: 302,
      cachedClickCount: 0,
      createdAt: new Date('2026-07-07T00:00:00Z').toISOString(),
      updatedAt: new Date('2026-07-07T00:00:00Z').toISOString(),
      deletedAt: null,
    });

    const response = await handleUrlShortenerRedirect(
      'multi-value',
      mockRequest('/s/multi-value?filter=a%20b&filter=c%2Bd&empty=')
    );

    expect(response.status).toBe(302);
    const params = getLocationQuery(response);
    expect(params.getAll('filter').sort()).toEqual(['a b', 'c+d', 'x']);
    expect(params.get('empty')).toBe('');
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

  it('returns 400 for invalid destination protocol without recording click', async () => {
    vi.mocked(getUrlShortenerLinkByCode).mockResolvedValue({
      id: 'link-unsafe',
      code: 'unsafe',
      destinationUrl: 'javascript:alert(1)',
      title: null,
      isActive: true,
      expiresAt: null,
      redirectStatusCode: 302,
      cachedClickCount: 0,
      createdAt: new Date('2026-07-07T00:00:00Z').toISOString(),
      updatedAt: new Date('2026-07-07T00:00:00Z').toISOString(),
      deletedAt: null,
    });

    const response = await handleUrlShortenerRedirect('unsafe', mockRequest('/s/unsafe'));

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toContain('destination is invalid');
    expect(vi.mocked(recordUrlShortenerClick)).not.toHaveBeenCalled();
  });

  it('returns 400 for redirect loop target without recording click', async () => {
    vi.mocked(getUrlShortenerLinkByCode).mockResolvedValue({
      id: 'link-loop',
      code: 'loop',
      destinationUrl: 'http://localhost:3000/s/loop',
      title: null,
      isActive: true,
      expiresAt: null,
      redirectStatusCode: 302,
      cachedClickCount: 0,
      createdAt: new Date('2026-07-07T00:00:00Z').toISOString(),
      updatedAt: new Date('2026-07-07T00:00:00Z').toISOString(),
      deletedAt: null,
    });

    const response = await handleUrlShortenerRedirect('loop', mockRequest('/s/loop?x=1'));

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toContain('destination is invalid');
    expect(vi.mocked(recordUrlShortenerClick)).not.toHaveBeenCalled();
  });

  it('blocks self-redirect when duplicate identical query pairs would otherwise bypass loop guard', async () => {
    vi.mocked(getUrlShortenerLinkByCode).mockResolvedValue({
      id: 'link-loop-dup',
      code: 'loop-dup',
      destinationUrl: 'http://localhost:3000/s/loop-dup?x=1',
      title: null,
      isActive: true,
      expiresAt: null,
      redirectStatusCode: 302,
      cachedClickCount: 0,
      createdAt: new Date('2026-07-07T00:00:00Z').toISOString(),
      updatedAt: new Date('2026-07-07T00:00:00Z').toISOString(),
      deletedAt: null,
    });

    const response = await handleUrlShortenerRedirect(
      'loop-dup',
      mockRequest('/s/loop-dup?x=1&x=1')
    );

    expect(response.status).toBe(400);
    expect(vi.mocked(recordUrlShortenerClick)).not.toHaveBeenCalled();
  });

  it('blocks self-redirect for equivalent query permutations and default-port normalization', async () => {
    vi.mocked(getUrlShortenerLinkByCode).mockResolvedValue({
      id: 'link-loop-order',
      code: 'loop-order',
      destinationUrl: 'http://LOCALHOST:3000/s/loop-order?b=2&a=1&a=1',
      title: null,
      isActive: true,
      expiresAt: null,
      redirectStatusCode: 302,
      cachedClickCount: 0,
      createdAt: new Date('2026-07-07T00:00:00Z').toISOString(),
      updatedAt: new Date('2026-07-07T00:00:00Z').toISOString(),
      deletedAt: null,
    });

    const response = await handleUrlShortenerRedirect(
      'loop-order',
      mockRequest('/s/loop-order?a=1&b=2')
    );

    expect(response.status).toBe(400);
    expect(vi.mocked(recordUrlShortenerClick)).not.toHaveBeenCalled();
  });

  it('allows redirects when host/path or meaningful query values differ', async () => {
    vi.mocked(getUrlShortenerLinkByCode).mockResolvedValue({
      id: 'link-not-loop',
      code: 'not-loop',
      destinationUrl: 'https://example.com/target?x=1',
      title: null,
      isActive: true,
      expiresAt: null,
      redirectStatusCode: 302,
      cachedClickCount: 0,
      createdAt: new Date('2026-07-07T00:00:00Z').toISOString(),
      updatedAt: new Date('2026-07-07T00:00:00Z').toISOString(),
      deletedAt: null,
    });

    const response = await handleUrlShortenerRedirect('not-loop', mockRequest('/s/not-loop?x=2'));

    expect(response.status).toBe(302);
    expect(vi.mocked(recordUrlShortenerClick)).toHaveBeenCalledTimes(1);
  });
});
