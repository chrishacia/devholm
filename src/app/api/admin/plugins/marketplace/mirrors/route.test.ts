import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const verifyAdmin = vi.hoisted(() => vi.fn());
const getMarketplaceMirrorById = vi.hoisted(() => vi.fn());
const listMarketplaceMirrors = vi.hoisted(() => vi.fn());
const upsertMarketplaceMirror = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth-helpers', () => ({
  verifyAdmin,
}));

vi.mock('@/db/marketplace-cache-admin', () => ({
  getMarketplaceMirrorById,
  listMarketplaceMirrors,
  upsertMarketplaceMirror,
}));

import { GET, PATCH, POST } from './route';

describe('admin marketplace mirrors route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyAdmin.mockResolvedValue({ sub: 'admin-1', roles: ['admin'] });
    listMarketplaceMirrors.mockResolvedValue([]);
    upsertMarketplaceMirror.mockResolvedValue({
      mirrorId: 'primary',
      baseUrl: 'https://mirror.example.test',
    });
    getMarketplaceMirrorById.mockResolvedValue({
      mirrorId: 'primary',
      baseUrl: 'https://mirror.example.test',
      enabled: true,
      priority: 1,
      authType: 'none',
      authSecretRef: null,
      authSecretValue: null,
      authHeaders: null,
      healthState: 'healthy',
      lastCheckedAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      failureCount: 0,
      lastStatusCode: null,
      lastError: null,
      metadata: { scope: 'global' },
      updatedAt: new Date().toISOString(),
    });
  });

  it('requires admin auth', async () => {
    verifyAdmin.mockResolvedValue(null);
    const response = await GET(
      new NextRequest('http://localhost:3000/api/admin/plugins/marketplace/mirrors')
    );
    expect(response.status).toBe(401);
  });

  it('creates mirror records', async () => {
    const response = await POST(
      new NextRequest('http://localhost:3000/api/admin/plugins/marketplace/mirrors', {
        method: 'POST',
        body: JSON.stringify({
          mirrorId: 'primary',
          baseUrl: 'https://mirror.example.test',
          enabled: true,
          priority: 1,
          metadata: { scope: 'global' },
        }),
        headers: { 'content-type': 'application/json' },
      })
    );

    expect(response.status).toBe(200);
    expect(upsertMarketplaceMirror).toHaveBeenCalled();
  });

  it('patches existing mirror records', async () => {
    const response = await PATCH(
      new NextRequest('http://localhost:3000/api/admin/plugins/marketplace/mirrors', {
        method: 'PATCH',
        body: JSON.stringify({ mirrorId: 'primary', enabled: false, priority: 10 }),
        headers: { 'content-type': 'application/json' },
      })
    );

    expect(response.status).toBe(200);
    expect(upsertMarketplaceMirror).toHaveBeenCalledWith(
      expect.objectContaining({
        mirrorId: 'primary',
        enabled: false,
        priority: 10,
      })
    );
  });

  it('returns 404 when patch target mirror does not exist', async () => {
    getMarketplaceMirrorById.mockResolvedValue(null);

    const response = await PATCH(
      new NextRequest('http://localhost:3000/api/admin/plugins/marketplace/mirrors', {
        method: 'PATCH',
        body: JSON.stringify({ mirrorId: 'missing', enabled: false }),
        headers: { 'content-type': 'application/json' },
      })
    );

    const body = await response.json();
    expect(response.status).toBe(404);
    expect(body.reasonCode).toBe('marketplace-cache-mirror-not-found');
  });
});
