import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const verifyAdmin = vi.hoisted(() => vi.fn());
const getLatestMarketplaceIntegrityAuditRun = vi.hoisted(() => vi.fn());
const listMarketplaceCacheEntries = vi.hoisted(() => vi.fn());
const startMarketplaceIntegrityAuditRun = vi.hoisted(() => vi.fn());
const completeMarketplaceIntegrityAuditRun = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth-helpers', () => ({
  verifyAdmin,
}));

vi.mock('@/db/marketplace-cache-admin', () => ({
  getLatestMarketplaceIntegrityAuditRun,
  listMarketplaceCacheEntries,
  startMarketplaceIntegrityAuditRun,
  completeMarketplaceIntegrityAuditRun,
}));

import { POST } from './route';

describe('admin marketplace audit route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyAdmin.mockResolvedValue({ email: 'admin@example.com', roles: ['admin'] });
    startMarketplaceIntegrityAuditRun.mockResolvedValue({ runId: 'audit-1' });
    listMarketplaceCacheEntries.mockResolvedValue([]);
    completeMarketplaceIntegrityAuditRun.mockResolvedValue({
      runId: 'audit-1',
      status: 'succeeded',
    });
  });

  it('maps running-audit conflict to 409 reason code', async () => {
    startMarketplaceIntegrityAuditRun.mockRejectedValue(
      new Error('integrity audit already running: audit-2')
    );

    const response = await POST(
      new NextRequest('http://localhost:3000/api/admin/plugins/marketplace/audit', {
        method: 'POST',
        body: JSON.stringify({ mode: 'start' }),
        headers: { 'content-type': 'application/json' },
      })
    );

    const body = await response.json();
    expect(response.status).toBe(409);
    expect(body.reasonCode).toBe('marketplace-cache-audit-conflict');
  });
});
