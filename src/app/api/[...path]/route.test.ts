import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const runApiExtension = vi.hoisted(() => vi.fn());
const resolveApiExtension = vi.hoisted(() => vi.fn());
const isPluginEnabled = vi.hoisted(() => vi.fn());

vi.mock('@core/lib/extensions.server', () => ({
  runApiExtension,
  resolveApiExtension,
}));

vi.mock('@/db/plugins', () => ({
  isPluginEnabled,
}));

import { GET } from './route';

describe('catch-all extension API route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns extension response when an extension handles the request', async () => {
    runApiExtension.mockResolvedValue(Response.json({ ok: true }, { status: 200 }));

    const request = new NextRequest('http://localhost:3000/api/url-shortener/links', {
      method: 'GET',
    });

    const response = await GET(request, {
      params: Promise.resolve({ path: ['url-shortener', 'links'] }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it('returns explicit disabled response when extension exists but plugin is disabled', async () => {
    runApiExtension.mockResolvedValue(null);
    resolveApiExtension.mockReturnValue({
      path: '/api/url-shortener',
      pluginId: 'url-shortener',
    });
    isPluginEnabled.mockResolvedValue(false);

    const request = new NextRequest('http://localhost:3000/api/url-shortener/links', {
      method: 'GET',
    });

    const response = await GET(request, {
      params: Promise.resolve({ path: ['url-shortener', 'links'] }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Plugin API is disabled',
      code: 'PLUGIN_DISABLED',
      pluginId: 'url-shortener',
      path: '/api/url-shortener/links',
    });
  });

  it('returns default not-found when no extension matches', async () => {
    runApiExtension.mockResolvedValue(null);
    resolveApiExtension.mockReturnValue(undefined);

    const request = new NextRequest('http://localhost:3000/api/nope', {
      method: 'GET',
    });

    const response = await GET(request, {
      params: Promise.resolve({ path: ['nope'] }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Not found' });
  });
});
