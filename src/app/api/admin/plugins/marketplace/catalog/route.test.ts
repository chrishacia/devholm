import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const verifyAdmin = vi.hoisted(() => vi.fn());
const listMarketplaceAdminPlugins = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth-helpers', () => ({
  verifyAdmin,
}));

vi.mock('@core/lib/plugin-marketplace-admin.server', () => ({
  listMarketplaceAdminPlugins,
}));

import { GET } from './route';

describe('admin marketplace catalog route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyAdmin.mockResolvedValue({ sub: 'admin-1', roles: ['admin'] });
    listMarketplaceAdminPlugins.mockResolvedValue([
      {
        plugin: {
          id: 'url-shortener',
          name: 'URL Shortener',
          description: 'test',
          source: 'user',
          enabledByDefault: false,
          adminSurface: null,
          capabilities: {
            admin: true,
            api: true,
            publicRoutes: true,
            navigation: true,
            sitemap: false,
            embeds: false,
          },
          isEnabled: false,
          installed: false,
          installedVersion: null,
          bundledVersion: '0.1.0',
          lifecycleState: 'bundled',
          operationStatus: 'idle',
          updatedAt: null,
        },
      },
    ]);
  });

  it('denies non-admin requests', async () => {
    verifyAdmin.mockResolvedValue(null);
    const response = await GET(
      new NextRequest('http://localhost:3000/api/admin/plugins/marketplace/catalog')
    );

    expect(response.status).toBe(401);
  });

  it('returns catalog payload for admins', async () => {
    const response = await GET(
      new NextRequest('http://localhost:3000/api/admin/plugins/marketplace/catalog')
    );

    const body = await response.json();
    expect(response.status).toBe(200);
    expect(Array.isArray(body.plugins)).toBe(true);
    expect(body.plugins[0].plugin.id).toBe('url-shortener');
    expect(typeof body.generatedAt).toBe('string');
  });

  it('returns stable error shape on failures', async () => {
    listMarketplaceAdminPlugins.mockRejectedValue(new Error('db is unavailable'));

    const response = await GET(
      new NextRequest('http://localhost:3000/api/admin/plugins/marketplace/catalog')
    );

    const body = await response.json();
    expect(response.status).toBe(500);
    expect(body.reasonCode).toBe('marketplace-catalog-read-failed');
  });
});
