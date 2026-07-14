import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const verifyAdmin = vi.hoisted(() => vi.fn());
const getMarketplaceAdminPlugin = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth-helpers', () => ({
  verifyAdmin,
}));

vi.mock('@core/lib/plugin-marketplace-admin.server', () => ({
  getMarketplaceAdminPlugin,
}));

import { GET } from './route';

describe('admin marketplace plugin detail route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyAdmin.mockResolvedValue({ sub: 'admin-1', roles: ['admin'] });
    getMarketplaceAdminPlugin.mockResolvedValue({
      plugin: {
        id: 'calendar',
        name: 'Calendar',
      },
    });
  });

  it('denies non-admin requests', async () => {
    verifyAdmin.mockResolvedValue(null);

    const response = await GET(new NextRequest('http://localhost:3000'), {
      params: Promise.resolve({ pluginId: 'calendar' }),
    });

    expect(response.status).toBe(401);
  });

  it('validates missing plugin id', async () => {
    const response = await GET(new NextRequest('http://localhost:3000'), {
      params: Promise.resolve({ pluginId: '   ' }),
    });

    expect(response.status).toBe(400);
  });

  it('returns plugin detail when found', async () => {
    const response = await GET(new NextRequest('http://localhost:3000'), {
      params: Promise.resolve({ pluginId: 'calendar' }),
    });

    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.plugin.plugin.id).toBe('calendar');
  });

  it('returns 404 for unknown plugin', async () => {
    getMarketplaceAdminPlugin.mockResolvedValue(null);

    const response = await GET(new NextRequest('http://localhost:3000'), {
      params: Promise.resolve({ pluginId: 'missing' }),
    });

    const body = await response.json();
    expect(response.status).toBe(404);
    expect(body.reasonCode).toBe('plugin-not-found');
  });
});
