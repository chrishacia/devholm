import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const verifyAdmin = vi.hoisted(() => vi.fn());
const ensureMarketplaceInstallStartupReconciliation = vi.hoisted(() => vi.fn());
const readMarketplaceInstallOperationState = vi.hoisted(() => vi.fn());
const cancelMarketplaceInstallOperation = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth-helpers', () => ({
  verifyAdmin,
}));

vi.mock('@core/lib/plugin-marketplace-install-operation.server', () => ({
  ensureMarketplaceInstallStartupReconciliation,
  readMarketplaceInstallOperationState,
  cancelMarketplaceInstallOperation,
}));

import { GET, POST } from './route';

describe('admin marketplace install status route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DEVHOLM_MARKETPLACE_FIRST_PARTY_INSTALL_ENABLED = 'true';
    verifyAdmin.mockResolvedValue({
      sub: 'admin-123',
      email: 'admin@example.com',
      roles: ['admin'],
    });

    readMarketplaceInstallOperationState.mockResolvedValue({
      operationId: 'op-1',
      pluginId: 'calendar',
      targetVersion: '0.1.0',
      targetSha256: 'a'.repeat(64),
      status: 'in_progress',
      stage: 'verify_artifact',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      acquisitionMode: 'remote-first-party',
      offlineOnly: true,
      cancellation: {
        requested: false,
        policy: 'best-effort-before-promotion',
      },
      notes: [],
    });

    cancelMarketplaceInstallOperation.mockResolvedValue({
      operationId: 'op-1',
      pluginId: 'calendar',
      targetVersion: '0.1.0',
      targetSha256: 'a'.repeat(64),
      status: 'in_progress',
      stage: 'verify_artifact',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      acquisitionMode: 'remote-first-party',
      offlineOnly: true,
      cancellation: {
        requested: true,
        requestedAt: new Date().toISOString(),
        requestedBy: 'admin@example.com',
        policy: 'best-effort-before-promotion',
      },
      notes: ['cancellation requested'],
    });
  });

  it('returns unauthorized when admin token is missing', async () => {
    verifyAdmin.mockResolvedValue(null);

    const request = new NextRequest(
      'http://localhost:3000/api/admin/plugins/marketplace/install/status?pluginId=calendar'
    );

    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it('returns operation state for a plugin', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/admin/plugins/marketplace/install/status?pluginId=calendar'
    );

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.operation.pluginId).toBe('calendar');
    expect(body.operation.status).toBe('in_progress');
    expect(ensureMarketplaceInstallStartupReconciliation).toHaveBeenCalled();
  });

  it('returns bad request when pluginId is missing', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/admin/plugins/marketplace/install/status'
    );

    const response = await GET(request);
    expect(response.status).toBe(400);
  });

  it('accepts cancellation request for in-progress operation', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/admin/plugins/marketplace/install/status',
      {
        method: 'POST',
        body: JSON.stringify({
          pluginId: 'calendar',
          action: 'cancel',
        }),
        headers: { 'content-type': 'application/json' },
      }
    );

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.operation.cancellation.requested).toBe(true);
    expect(cancelMarketplaceInstallOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginId: 'calendar',
        requestedBy: 'admin@example.com',
      })
    );
  });

  it('returns conflict when cancellation is requested for non-running operation', async () => {
    cancelMarketplaceInstallOperation.mockResolvedValue({
      operationId: 'op-1',
      pluginId: 'calendar',
      targetVersion: '0.1.0',
      targetSha256: 'a'.repeat(64),
      status: 'succeeded',
      stage: 'complete',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      acquisitionMode: 'remote-first-party',
      offlineOnly: true,
      cancellation: {
        requested: false,
        policy: 'best-effort-before-promotion',
      },
      notes: ['operation completed successfully'],
    });

    const request = new NextRequest(
      'http://localhost:3000/api/admin/plugins/marketplace/install/status',
      {
        method: 'POST',
        body: JSON.stringify({ pluginId: 'calendar', action: 'cancel' }),
        headers: { 'content-type': 'application/json' },
      }
    );

    const response = await POST(request);
    expect(response.status).toBe(409);
  });
});
