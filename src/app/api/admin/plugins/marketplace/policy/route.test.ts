import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const verifyAdmin = vi.hoisted(() => vi.fn());
const getMarketplaceCachePolicy = vi.hoisted(() => vi.fn());
const setMarketplaceCachePolicy = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth-helpers', () => ({
  verifyAdmin,
}));

vi.mock('@/db/marketplace-cache-admin', () => ({
  DEFAULT_MARKETPLACE_CACHE_POLICY: {
    version: 1,
    maxCacheBytes: 1024,
    maxArtifactAgeMs: 1000,
    warnUsageRatio: 0.9,
    evictionBatchSize: 10,
  },
  getMarketplaceCachePolicy,
  setMarketplaceCachePolicy,
}));

import { GET, PUT } from './route';

describe('admin marketplace policy route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyAdmin.mockResolvedValue({
      sub: 'admin-1',
      email: 'admin@example.com',
      roles: ['admin'],
    });

    getMarketplaceCachePolicy.mockResolvedValue({
      version: 1,
      maxCacheBytes: 2048,
      maxArtifactAgeMs: 2000,
      warnUsageRatio: 0.95,
      evictionBatchSize: 100,
    });

    setMarketplaceCachePolicy.mockResolvedValue({
      version: 1,
      maxCacheBytes: 4096,
      maxArtifactAgeMs: 3000,
      warnUsageRatio: 0.9,
      evictionBatchSize: 120,
    });
  });

  it('requires admin auth', async () => {
    verifyAdmin.mockResolvedValue(null);

    const response = await GET(
      new NextRequest('http://localhost:3000/api/admin/plugins/marketplace/policy')
    );
    expect(response.status).toBe(401);
  });

  it('updates policy for authorized admin', async () => {
    const request = new NextRequest('http://localhost:3000/api/admin/plugins/marketplace/policy', {
      method: 'PUT',
      body: JSON.stringify({
        version: 1,
        maxCacheBytes: 4096,
        maxArtifactAgeMs: 3000,
        warnUsageRatio: 0.9,
        evictionBatchSize: 120,
      }),
      headers: {
        'content-type': 'application/json',
      },
    });

    const response = await PUT(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(setMarketplaceCachePolicy).toHaveBeenCalledWith(
      {
        version: 1,
        maxCacheBytes: 4096,
        maxArtifactAgeMs: 3000,
        warnUsageRatio: 0.9,
        evictionBatchSize: 120,
      },
      'admin@example.com'
    );
    expect(body.policy.maxCacheBytes).toBe(4096);
  });
});
