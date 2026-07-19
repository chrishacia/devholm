import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const isPluginEnabledForRequest = vi.hoisted(() => vi.fn());
const getUrlShortenerSettings = vi.hoisted(() => vi.fn());
const createUrlShortenerPublicSubmission = vi.hoisted(() => vi.fn());

vi.mock('@/db/plugins-enabled', () => ({
  isPluginEnabledForRequest,
}));

vi.mock('@user/extensions/plugins/url-shortener/services/url-shortener-store', () => ({
  getUrlShortenerSettings,
  createUrlShortenerPublicSubmission,
}));

import { POST } from './route';

describe('public URL shortener submissions route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isPluginEnabledForRequest.mockResolvedValue(true);
    getUrlShortenerSettings.mockResolvedValue({
      routePrefix: '/s',
      publicCreationMode: 'public-with-approval',
      legacyPrefixEnabled: false,
    });
    createUrlShortenerPublicSubmission.mockResolvedValue({
      id: 'submission-1',
      status: 'pending',
    });
  });

  it('returns managed disabled response when plugin is disabled', async () => {
    isPluginEnabledForRequest.mockResolvedValue(false);

    const request = new NextRequest('http://localhost:3000/api/public/url-shortener/submissions', {
      method: 'POST',
      body: JSON.stringify({ destinationUrl: 'https://example.com' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      code: 'PLUGIN_DISABLED',
    });
    expect(createUrlShortenerPublicSubmission).not.toHaveBeenCalled();
  });

  it('blocks submissions when mode is admin-only', async () => {
    getUrlShortenerSettings.mockResolvedValue({
      routePrefix: '/s',
      publicCreationMode: 'admin-only',
      legacyPrefixEnabled: false,
    });

    const request = new NextRequest('http://localhost:3000/api/public/url-shortener/submissions', {
      method: 'POST',
      body: JSON.stringify({ destinationUrl: 'https://example.com' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: 'PUBLIC_SUBMISSIONS_DISABLED',
    });
    expect(createUrlShortenerPublicSubmission).not.toHaveBeenCalled();
  });

  it('requires authentication when mode is authenticated', async () => {
    getUrlShortenerSettings.mockResolvedValue({
      routePrefix: '/s',
      publicCreationMode: 'authenticated',
      legacyPrefixEnabled: false,
    });

    const request = new NextRequest('http://localhost:3000/api/public/url-shortener/submissions', {
      method: 'POST',
      body: JSON.stringify({ destinationUrl: 'https://example.com' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: 'AUTH_REQUIRED',
    });
    expect(createUrlShortenerPublicSubmission).not.toHaveBeenCalled();
  });

  it('validates destination URL before attempting creation', async () => {
    const request = new NextRequest('http://localhost:3000/api/public/url-shortener/submissions', {
      method: 'POST',
      body: JSON.stringify({ requestedCode: 'missing-destination' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid public submission payload',
    });
    expect(createUrlShortenerPublicSubmission).not.toHaveBeenCalled();
  });

  it('accepts public submissions in public-with-approval mode', async () => {
    const request = new NextRequest('http://localhost:3000/api/public/url-shortener/submissions', {
      method: 'POST',
      body: JSON.stringify({
        destinationUrl: 'https://example.com/landing',
        requestedCode: 'my-code',
      }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(createUrlShortenerPublicSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        destinationUrl: 'https://example.com/landing',
        requestedCode: 'my-code',
      })
    );
  });

  it('returns stable invalid-payload response when destination URL is malformed', async () => {
    createUrlShortenerPublicSubmission.mockRejectedValue(new Error('invalid-destination-url'));

    const request = new NextRequest('http://localhost:3000/api/public/url-shortener/submissions', {
      method: 'POST',
      body: JSON.stringify({
        destinationUrl: 'javascript:alert(1)',
      }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid public submission payload',
    });
  });

  it('returns stable invalid-payload response when requested code format is invalid', async () => {
    createUrlShortenerPublicSubmission.mockRejectedValue(new Error('invalid-requested-code'));

    const request = new NextRequest('http://localhost:3000/api/public/url-shortener/submissions', {
      method: 'POST',
      body: JSON.stringify({
        destinationUrl: 'https://example.com/landing',
        requestedCode: 'bad/code',
      }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid public submission payload',
    });
  });
});
