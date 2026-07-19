import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import type { ExtensionHelpers } from '@core/types/extensions.server';
import { urlShortenerApiExtensions } from '@user/extensions/plugins/url-shortener/api';
import {
  createUrlShortenerPublicSubmission,
  createUrlShortenerLink,
  deleteUrlShortenerLink,
  getUrlShortenerLinkByCode,
  getUrlShortenerOverview,
  getUrlShortenerSettings,
  listUrlShortenerPublicSubmissions,
  listUrlShortenerLinks,
  reviewUrlShortenerPublicSubmission,
  updateUrlShortenerLink,
  updateUrlShortenerSettings,
} from '@user/extensions/plugins/url-shortener/services/url-shortener-store';
import { verifyPermission } from '@/lib/auth-helpers';
import {
  UrlShortenerConflictError,
  UrlShortenerInvalidTransitionError,
  UrlShortenerValidationError,
} from '@user/extensions/plugins/url-shortener/errors';

vi.mock('@/lib/auth-helpers', () => ({
  verifyPermission: vi.fn(),
}));

vi.mock('@user/extensions/plugins/url-shortener/services/url-shortener-store', () => ({
  createUrlShortenerPublicSubmission: vi.fn(),
  createUrlShortenerLink: vi.fn(),
  deleteUrlShortenerLink: vi.fn(),
  disableUrlShortenerLink: vi.fn(),
  getUrlShortenerLinkByCode: vi.fn(),
  getUrlShortenerOverview: vi.fn(),
  getUrlShortenerSettings: vi.fn(),
  listUrlShortenerPublicSubmissions: vi.fn(),
  listUrlShortenerLinks: vi.fn(),
  reviewUrlShortenerPublicSubmission: vi.fn(),
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
    vi.mocked(createUrlShortenerPublicSubmission).mockReset();
    vi.mocked(createUrlShortenerLink).mockReset();
    vi.mocked(deleteUrlShortenerLink).mockReset();
    vi.mocked(getUrlShortenerLinkByCode).mockReset();
    vi.mocked(getUrlShortenerOverview).mockReset();
    vi.mocked(getUrlShortenerSettings).mockReset();
    vi.mocked(listUrlShortenerPublicSubmissions).mockReset();
    vi.mocked(listUrlShortenerLinks).mockReset();
    vi.mocked(reviewUrlShortenerPublicSubmission).mockReset();
    vi.mocked(updateUrlShortenerLink).mockReset();
    vi.mocked(updateUrlShortenerSettings).mockReset();
  });

  it('lists public submissions from the plugin namespace', async () => {
    vi.mocked(listUrlShortenerPublicSubmissions).mockResolvedValue([
      {
        id: 'submission-1',
        requestedDestination: 'https://example.com/submitted',
        requestedCode: 'submit-code',
        requesterType: 'public',
        requesterId: null,
        requesterLabel: 'anonymous',
        status: 'pending',
        reviewNotes: null,
        approvedAt: null,
        rejectedAt: null,
        resultLinkId: null,
        createdAt: '2026-07-07T00:00:00.000Z',
        updatedAt: '2026-07-07T00:00:00.000Z',
      },
    ]);

    const response = await urlShortenerApiExtensions[0].handlers.GET!(mockRequest('GET'), {
      params: { path: ['url-shortener', 'public-submissions'] },
      helpers: mockHelpers(),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      submissions: [
        {
          id: 'submission-1',
          status: 'pending',
        },
      ],
    });
  });

  it('creates a public submission through admin namespace', async () => {
    vi.mocked(createUrlShortenerPublicSubmission).mockResolvedValue({
      id: 'submission-2',
      requestedDestination: 'https://example.com/request',
      requestedCode: 'request-code',
      requesterType: 'admin',
      requesterId: 'admin-1',
      requesterLabel: 'Admin',
      status: 'pending',
      reviewNotes: null,
      approvedAt: null,
      rejectedAt: null,
      resultLinkId: null,
      createdAt: '2026-07-07T00:00:00.000Z',
      updatedAt: '2026-07-07T00:00:00.000Z',
    });

    const response = await urlShortenerApiExtensions[0].handlers.POST!(
      mockRequest('POST', {
        destinationUrl: 'https://example.com/request',
        requestedCode: 'request-code',
        requesterId: 'admin-1',
        requesterLabel: 'Admin',
      }),
      {
        params: { path: ['url-shortener', 'public-submissions'] },
        helpers: mockHelpers(),
      }
    );

    expect(response.status).toBe(201);
    expect(createUrlShortenerPublicSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        destinationUrl: 'https://example.com/request',
        requestedCode: 'request-code',
      })
    );
  });

  it('maps typed submission validation errors to stable 400 responses', async () => {
    vi.mocked(createUrlShortenerPublicSubmission).mockRejectedValue(
      new UrlShortenerValidationError('invalid payload')
    );

    const response = await urlShortenerApiExtensions[0].handlers.POST!(
      mockRequest('POST', {
        destinationUrl: 'https://example.com/request',
        requestedCode: 'bad/code',
      }),
      {
        params: { path: ['url-shortener', 'public-submissions'] },
        helpers: mockHelpers(),
      }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid public submission payload',
      code: 'INVALID_SUBMISSION',
    });
  });

  it('maps submission conflicts to stable 409 responses', async () => {
    vi.mocked(createUrlShortenerPublicSubmission).mockRejectedValue(
      new UrlShortenerConflictError('duplicate', 'DUPLICATE_SHORT_CODE')
    );

    const response = await urlShortenerApiExtensions[0].handlers.POST!(
      mockRequest('POST', {
        destinationUrl: 'https://example.com/request',
        requestedCode: 'duplicate',
      }),
      {
        params: { path: ['url-shortener', 'public-submissions'] },
        helpers: mockHelpers(),
      }
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Duplicate short code',
      code: 'DUPLICATE_SHORT_CODE',
    });
  });

  it('maps unexpected submission create failures to stable 500 responses without leakage', async () => {
    vi.mocked(createUrlShortenerPublicSubmission).mockRejectedValue(
      new Error('db down at /private/path with stack')
    );

    const response = await urlShortenerApiExtensions[0].handlers.POST!(
      mockRequest('POST', {
        destinationUrl: 'https://example.com/request',
      }),
      {
        params: { path: ['url-shortener', 'public-submissions'] },
        helpers: mockHelpers(),
      }
    );

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toMatchObject({
      error: 'Failed to process public submission',
      code: 'URL_SHORTENER_OPERATIONAL_ERROR',
    });
    const serialized = JSON.stringify(body).toLowerCase();
    expect(serialized).not.toContain('db down');
    expect(serialized).not.toContain('/private/path');
    expect(serialized).not.toContain('stack');
  });

  it('reviews a pending public submission through admin namespace', async () => {
    vi.mocked(reviewUrlShortenerPublicSubmission).mockResolvedValue({
      submission: {
        id: 'submission-2',
        requestedDestination: 'https://example.com/request',
        requestedCode: 'request-code',
        requesterType: 'public',
        requesterId: null,
        requesterLabel: null,
        status: 'approved',
        reviewNotes: null,
        approvedAt: '2026-07-07T00:00:00.000Z',
        rejectedAt: null,
        resultLinkId: 'link-22',
        createdAt: '2026-07-07T00:00:00.000Z',
        updatedAt: '2026-07-07T00:00:00.000Z',
      },
      link: {
        id: 'link-22',
        code: 'request-code',
        destinationUrl: 'https://example.com/request',
        title: null,
        isActive: true,
        expiresAt: null,
        redirectStatusCode: 302,
        cachedClickCount: 0,
        createdAt: '2026-07-07T00:00:00.000Z',
        updatedAt: '2026-07-07T00:00:00.000Z',
        deletedAt: null,
      },
    });

    const response = await urlShortenerApiExtensions[0].handlers.PATCH!(
      mockRequest('PATCH', {
        decision: 'approved',
      }),
      {
        params: { path: ['url-shortener', 'public-submissions', 'submission-2'] },
        helpers: mockHelpers(),
      }
    );

    expect(response.status).toBe(200);
    expect(reviewUrlShortenerPublicSubmission).toHaveBeenCalledWith(
      'submission-2',
      expect.objectContaining({
        decision: 'approved',
      })
    );
  });

  it('reviews a pending submission with rejection flow', async () => {
    vi.mocked(reviewUrlShortenerPublicSubmission).mockResolvedValue({
      submission: {
        id: 'submission-3',
        requestedDestination: 'https://example.com/request',
        requestedCode: 'request-code',
        requesterType: 'public',
        requesterId: null,
        requesterLabel: null,
        status: 'rejected',
        reviewNotes: 'rejected by policy',
        approvedAt: null,
        rejectedAt: '2026-07-07T00:00:00.000Z',
        resultLinkId: null,
        createdAt: '2026-07-07T00:00:00.000Z',
        updatedAt: '2026-07-07T00:00:00.000Z',
      },
      link: null,
    });

    const response = await urlShortenerApiExtensions[0].handlers.PATCH!(
      mockRequest('PATCH', {
        decision: 'rejected',
        reviewNotes: 'rejected by policy',
      }),
      {
        params: { path: ['url-shortener', 'public-submissions', 'submission-3'] },
        helpers: mockHelpers(),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      submission: {
        status: 'rejected',
      },
      link: null,
    });
  });

  it('returns 404 when reviewing a missing submission', async () => {
    vi.mocked(reviewUrlShortenerPublicSubmission).mockResolvedValue(null);

    const response = await urlShortenerApiExtensions[0].handlers.PATCH!(
      mockRequest('PATCH', {
        decision: 'approved',
      }),
      {
        params: { path: ['url-shortener', 'public-submissions', 'missing-submission'] },
        helpers: mockHelpers(),
      }
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Submission not found',
    });
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

  it('rejects invalid settings mode payloads', async () => {
    const response = await urlShortenerApiExtensions[0].handlers.PATCH!(
      mockRequest('PATCH', {
        routePrefix: '/go',
        publicCreationMode: 'public-anonymous',
        legacyPrefixEnabled: true,
      }),
      {
        params: { path: ['url-shortener', 'settings'] },
        helpers: mockHelpers(),
      }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid settings payload',
      details: {
        publicCreationMode: ['Invalid public creation mode'],
      },
    });
    expect(vi.mocked(updateUrlShortenerSettings)).not.toHaveBeenCalled();
  });

  it('rejects invalid route prefixes in settings payloads', async () => {
    const response = await urlShortenerApiExtensions[0].handlers.PATCH!(
      mockRequest('PATCH', {
        routePrefix: '/api',
      }),
      {
        params: { path: ['url-shortener', 'settings'] },
        helpers: mockHelpers(),
      }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid settings payload',
      details: {
        routePrefix: ['Invalid route prefix'],
      },
    });
    expect(vi.mocked(updateUrlShortenerSettings)).not.toHaveBeenCalled();
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

  it('rejects invalid public submission requestedCode payloads', async () => {
    vi.mocked(createUrlShortenerPublicSubmission).mockRejectedValue(
      new UrlShortenerValidationError('invalid-code')
    );

    const response = await urlShortenerApiExtensions[0].handlers.POST!(
      mockRequest('POST', {
        destinationUrl: 'https://example.com/request',
        requestedCode: 'bad/code',
      }),
      {
        params: { path: ['url-shortener', 'public-submissions'] },
        helpers: mockHelpers(),
      }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid public submission payload',
      code: 'INVALID_SUBMISSION',
    });
  });

  it('returns conflict status for duplicate short-code approval attempts', async () => {
    vi.mocked(reviewUrlShortenerPublicSubmission).mockRejectedValue({ code: '23505' });

    const response = await urlShortenerApiExtensions[0].handlers.PATCH!(
      mockRequest('PATCH', {
        decision: 'approved',
      }),
      {
        params: { path: ['url-shortener', 'public-submissions', 'submission-2'] },
        helpers: mockHelpers(),
      }
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Duplicate short code',
      code: 'DUPLICATE_SHORT_CODE',
    });
  });

  it('returns stable invalid payload response without leaking internals on review failure', async () => {
    vi.mocked(reviewUrlShortenerPublicSubmission).mockRejectedValue(new Error('db tx failed'));

    const response = await urlShortenerApiExtensions[0].handlers.PATCH!(
      mockRequest('PATCH', {
        decision: 'approved',
      }),
      {
        params: { path: ['url-shortener', 'public-submissions', 'submission-2'] },
        helpers: mockHelpers(),
      }
    );

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toMatchObject({
      error: 'Failed to review public submission',
      code: 'URL_SHORTENER_OPERATIONAL_ERROR',
    });
    const serialized = JSON.stringify(body).toLowerCase();
    expect(serialized).not.toContain('db');
    expect(serialized).not.toContain('stack');
    expect(serialized).not.toContain('u_url_shortener_links');
  });

  it('returns 409 for already-reviewed submission transitions', async () => {
    vi.mocked(reviewUrlShortenerPublicSubmission).mockRejectedValue(
      new UrlShortenerInvalidTransitionError('already reviewed')
    );

    const response = await urlShortenerApiExtensions[0].handlers.PATCH!(
      mockRequest('PATCH', {
        decision: 'approved',
      }),
      {
        params: { path: ['url-shortener', 'public-submissions', 'submission-2'] },
        helpers: mockHelpers(),
      }
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Submission review is already finalized',
      code: 'INVALID_SUBMISSION_STATE',
    });
  });
});
