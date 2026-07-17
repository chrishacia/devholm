import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const verifyAdmin = vi.hoisted(() => vi.fn());
const runPluginLifecycleRecoveryScan = vi.hoisted(() => vi.fn());
const reconcileSinglePluginLifecycle = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth-helpers', () => ({
  verifyAdmin,
}));

vi.mock('@core/lib/plugin-lifecycle-recovery-runner.server', () => ({
  runPluginLifecycleRecoveryScan,
  reconcileSinglePluginLifecycle,
}));

import { POST } from './route';

describe('admin plugin recovery reconcile route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyAdmin.mockResolvedValue({
      sub: 'admin-123',
      email: 'admin@example.com',
      roles: ['admin'],
    });
    runPluginLifecycleRecoveryScan.mockResolvedValue({
      scannedAt: '2026-07-16T00:00:00.000Z',
      pluginCount: 1,
      results: [
        {
          pluginId: 'url-shortener',
          action: 'none',
          reason: 'No nonterminal lifecycle operation detected.',
          operationId: null,
        },
      ],
    });
    reconcileSinglePluginLifecycle.mockResolvedValue({
      action: 'require-recovery',
      reason: 'Interrupted migration checkpoint requires reconciliation.',
      operationId: 'op-1',
    });
  });

  it('returns unauthorized when admin token is missing', async () => {
    verifyAdmin.mockResolvedValue(null);

    const request = new NextRequest('http://localhost:3000/api/admin/plugins/recovery/reconcile', {
      method: 'POST',
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('runs bounded scan when pluginId is not provided', async () => {
    const request = new NextRequest('http://localhost:3000/api/admin/plugins/recovery/reconcile', {
      method: 'POST',
      body: JSON.stringify({ limit: 10 }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(runPluginLifecycleRecoveryScan).toHaveBeenCalledWith({ limit: 10 });
    expect(body.pluginCount).toBe(1);
  });

  it('reconciles a single plugin when pluginId is provided', async () => {
    const request = new NextRequest('http://localhost:3000/api/admin/plugins/recovery/reconcile', {
      method: 'POST',
      body: JSON.stringify({ pluginId: 'url-shortener' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(reconcileSinglePluginLifecycle).toHaveBeenCalledWith('url-shortener');
    expect(body.results[0].action).toBe('require-recovery');
  });
});
