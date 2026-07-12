import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const verifyAdmin = vi.hoisted(() => vi.fn());
const executeFirstPartyMarketplaceInstall = vi.hoisted(() => vi.fn());
const parseMarketplaceInstallSourceDescriptor = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth-helpers', () => ({
  verifyAdmin,
}));

vi.mock('@core/lib/plugin-marketplace-install-execution.server', () => ({
  executeFirstPartyMarketplaceInstall,
}));

vi.mock('@core/lib/plugin-install-source-descriptor.server', () => ({
  parseMarketplaceInstallSourceDescriptor,
}));

import { POST } from './route';

describe('admin marketplace install route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyAdmin.mockResolvedValue({
      sub: 'admin-123',
      email: 'admin@example.com',
      roles: ['admin'],
    });

    parseMarketplaceInstallSourceDescriptor.mockReturnValue({
      descriptor: {
        sourceType: 'marketplace',
        repoUrl: 'https://github.com/chrishacia/devholm-plugins',
        ref: 'refs/tags/calendar-v0.1.0',
        pluginSubdirectory: 'plugins/calendar',
        manifestPath: 'plugins/calendar/manifest.json',
        expectedPluginId: 'calendar',
        expectedVersion: '0.1.0',
      },
      errors: [],
    });

    executeFirstPartyMarketplaceInstall.mockResolvedValue({
      pluginId: 'calendar',
      version: '0.1.0',
      sha256: 'a'.repeat(64),
      plannerSummary: 'ready: dry-run planning completed with no blockers',
      inspection: {
        entries: [],
        totalEntries: 0,
        totalUncompressedBytes: 0,
        compressedBytes: 0,
        compressionRatio: 1,
      },
      validation: {
        packageRoot: 'plugins/calendar',
        manifestRelativePath: 'plugins/calendar/manifest.json',
        pluginId: 'calendar',
        version: '0.1.0',
        hasLifecycleDeclarations: true,
        hasMigrationDeclarations: true,
        lifecycleDeclarationKeys: ['afterInstall'],
        migrationCount: 1,
      },
      installRoot: '/tmp/root',
      activePath: '/tmp/root/calendar/active',
      versionPath: '/tmp/root/calendar/versions/0.1.0',
      previousVersion: null,
      rollbackPath: null,
      lifecycleExecution: 'skipped',
      migrationExecution: 'skipped',
      installedAt: new Date().toISOString(),
    });
  });

  it('returns unauthorized when admin token is missing', async () => {
    verifyAdmin.mockResolvedValue(null);

    const request = new NextRequest('http://localhost:3000/api/admin/plugins/marketplace/install', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('executes install with explicit approval and initiatedBy identity', async () => {
    const request = new NextRequest('http://localhost:3000/api/admin/plugins/marketplace/install', {
      method: 'POST',
      body: JSON.stringify({
        descriptor: {
          sourceType: 'marketplace',
          repoUrl: 'https://github.com/chrishacia/devholm-plugins',
          ref: 'refs/tags/calendar-v0.1.0',
          pluginSubdirectory: 'plugins/calendar',
          manifestPath: 'plugins/calendar/manifest.json',
          expectedPluginId: 'calendar',
          expectedVersion: '0.1.0',
        },
        catalogEntry: {
          pluginId: 'calendar',
        },
        artifactPath: '/tmp/calendar-v0.1.0.tar.gz',
        explicitAdminApproval: true,
      }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.notes).toContain('lifecycle hooks were not executed in this phase');
    expect(executeFirstPartyMarketplaceInstall).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactPath: '/tmp/calendar-v0.1.0.tar.gz',
        explicitAdminApproval: true,
        initiatedBy: 'admin@example.com',
      })
    );
  });

  it('returns bad request when descriptor parsing fails', async () => {
    parseMarketplaceInstallSourceDescriptor.mockReturnValue({
      descriptor: null,
      errors: ['ref is required'],
    });

    const request = new NextRequest('http://localhost:3000/api/admin/plugins/marketplace/install', {
      method: 'POST',
      body: JSON.stringify({
        descriptor: {},
        catalogEntry: {},
        artifactPath: '/tmp/calendar-v0.1.0.tar.gz',
        explicitAdminApproval: true,
      }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain('Invalid install descriptor');
  });

  it('returns conflict response for blocked execution errors', async () => {
    executeFirstPartyMarketplaceInstall.mockRejectedValue(
      new Error('planner blocked runtime install: blocked: 1 blocker(s) detected')
    );

    const request = new NextRequest('http://localhost:3000/api/admin/plugins/marketplace/install', {
      method: 'POST',
      body: JSON.stringify({
        descriptor: {
          sourceType: 'marketplace',
          repoUrl: 'https://github.com/chrishacia/devholm-plugins',
          ref: 'refs/tags/calendar-v0.1.0',
          pluginSubdirectory: 'plugins/calendar',
          manifestPath: 'plugins/calendar/manifest.json',
          expectedPluginId: 'calendar',
          expectedVersion: '0.1.0',
        },
        catalogEntry: { pluginId: 'calendar' },
        artifactPath: '/tmp/calendar-v0.1.0.tar.gz',
        explicitAdminApproval: true,
      }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain('planner blocked runtime install');
  });
});
