import { describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@user/extensions/admin/pages', () => ({
  adminPageExtensions: [],
}));

vi.mock('@user/extensions/seo', () => ({
  metadataExtensions: [],
  robotsExtensions: [],
  sitemapExtensions: [],
  structuredDataExtensions: [],
}));

vi.mock('@/db/plugins', () => ({
  isPluginEnabled: vi.fn().mockResolvedValue(true),
}));

vi.mock('@core/lib/extension-helpers.server', () => ({
  getExtensionHelpers: vi.fn(() => ({ auth: vi.fn(), getDb: vi.fn(), verifyAdmin: vi.fn() })),
}));

vi.mock('@core/lib/admin-page-enablement.server', () => ({
  loadEnabledAdminPageComponent: vi.fn(),
  loadEnabledAdminPageMetadata: vi.fn(),
}));

const { handler } = vi.hoisted(() => ({
  handler: vi.fn(async () => Response.json({ ok: true })),
}));

vi.mock('@user/extensions/api', () => ({
  apiExtensions: [
    {
      path: '/api/url-shortener',
      pluginId: 'url-shortener',
      accessPolicy: {
        scope: 'admin',
        capability: 'url-shortener.admin-management',
        permissionKeys: ['plugin:url-shortener:admin.manage'],
        runtimeOwner: 'plugin-extension',
      },
      handlers: {
        GET: handler,
      },
    },
  ],
}));

import { resolveApiExtension, runApiExtension } from '@core/lib/extensions.server';

describe('API extension resolution', () => {
  it('registers the plugin API extension', () => {
    const extension = resolveApiExtension(['url-shortener']);

    expect(extension?.path).toBe('/api/url-shortener');
    expect(extension?.pluginId).toBe('url-shortener');
  });

  it('resolves plugin namespace routes by prefix', () => {
    const extension = resolveApiExtension(['url-shortener', 'links']);

    expect(extension?.path).toBe('/api/url-shortener');
  });

  it('returns undefined for unknown plugin API namespaces', () => {
    const extension = resolveApiExtension(['unknown-plugin', 'links']);

    expect(extension).toBeUndefined();
  });

  it('routes requests through the plugin API extension registry', async () => {
    const request = {
      method: 'GET',
      headers: new Headers(),
    } as NextRequest;

    const response = await runApiExtension('GET', request, ['url-shortener', 'links']);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toMatchObject({ ok: true });
  });

  it('fails deterministically for unknown plugin API routes', async () => {
    const request = {
      method: 'GET',
      headers: new Headers(),
    } as NextRequest;

    const response = await runApiExtension('GET', request, ['unknown-plugin', 'links']);

    expect(response).toBeNull();
  });
});
