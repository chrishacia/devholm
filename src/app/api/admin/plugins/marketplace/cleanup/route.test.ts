import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const verifyAdmin = vi.hoisted(() => vi.fn());
const listMarketplaceEligibleEvictionCandidates = vi.hoisted(() => vi.fn());
const startMarketplaceCleanupRun = vi.hoisted(() => vi.fn());
const completeMarketplaceCleanupRun = vi.hoisted(() => vi.fn());
const executeMarketplaceCleanupPlan = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth-helpers', () => ({
  verifyAdmin,
}));

vi.mock('@/db/marketplace-cache-admin', () => ({
  listMarketplaceEligibleEvictionCandidates,
  startMarketplaceCleanupRun,
  completeMarketplaceCleanupRun,
  executeMarketplaceCleanupPlan,
}));

import { POST } from './route';

describe('admin marketplace cleanup route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyAdmin.mockResolvedValue({
      email: 'admin@example.com',
      roles: ['admin'],
    });

    listMarketplaceEligibleEvictionCandidates.mockResolvedValue({
      policy: { version: 1 },
      selectedEntries: 1,
      selectedBytes: 128,
      evictableEntries: 2,
      evictableBytes: 256,
      candidates: [],
      degraded: { overQuota: false },
    });
    startMarketplaceCleanupRun.mockResolvedValue({ runId: 'run-1' });
    completeMarketplaceCleanupRun.mockResolvedValue({ runId: 'run-1', status: 'succeeded' });
    executeMarketplaceCleanupPlan.mockResolvedValue({
      run: { runId: 'run-2', status: 'succeeded' },
      plan: { selectedEntries: 1, candidates: [] },
    });
  });

  it('requires admin auth', async () => {
    verifyAdmin.mockResolvedValue(null);

    const response = await POST(
      new NextRequest('http://localhost:3000/api/admin/plugins/marketplace/cleanup', {
        method: 'POST',
        body: JSON.stringify({ mode: 'dry-run' }),
        headers: { 'content-type': 'application/json' },
      })
    );

    expect(response.status).toBe(401);
  });

  it('requires explicit confirmation for execute mode', async () => {
    const response = await POST(
      new NextRequest('http://localhost:3000/api/admin/plugins/marketplace/cleanup', {
        method: 'POST',
        body: JSON.stringify({ mode: 'execute' }),
        headers: { 'content-type': 'application/json' },
      })
    );

    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.reasonCode).toBe('marketplace-cache-cleanup-confirmation-required');
  });

  it('executes cleanup when confirmation is present', async () => {
    const response = await POST(
      new NextRequest('http://localhost:3000/api/admin/plugins/marketplace/cleanup', {
        method: 'POST',
        body: JSON.stringify({ mode: 'execute', confirmation: 'execute-cleanup', limit: 10 }),
        headers: { 'content-type': 'application/json' },
      })
    );

    expect(response.status).toBe(200);
    expect(executeMarketplaceCleanupPlan).toHaveBeenCalledWith({
      initiatedBy: 'admin@example.com',
      limit: 10,
    });
  });

  it('returns conflict reason when cleanup is already running', async () => {
    executeMarketplaceCleanupPlan.mockRejectedValue(new Error('cleanup already running: run-1'));

    const response = await POST(
      new NextRequest('http://localhost:3000/api/admin/plugins/marketplace/cleanup', {
        method: 'POST',
        body: JSON.stringify({ mode: 'execute', confirmation: 'execute-cleanup' }),
        headers: { 'content-type': 'application/json' },
      })
    );

    const body = await response.json();
    expect(response.status).toBe(409);
    expect(body.reasonCode).toBe('marketplace-cache-cleanup-conflict');
  });
});
