import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { MARKETPLACE_TEST_TRUSTED_KEYS } from '@/test/fixtures/marketplace-signing-fixtures';

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
    process.env.DEVHOLM_MARKETPLACE_FIRST_PARTY_INSTALL_ENABLED = 'true';
    process.env.DEVHOLM_MARKETPLACE_TRUSTED_KEYS_JSON = JSON.stringify(
      MARKETPLACE_TEST_TRUSTED_KEYS
    );
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
      capabilityContract: {
        hasEscalation: false,
        approvals: [],
        blockers: [],
        summary: 'no capability escalation detected compared with installed snapshot',
      },
      operation: {
        operationId: 'op-123',
        pluginId: 'calendar',
        targetVersion: '0.1.0',
        targetSha256: 'a'.repeat(64),
        status: 'succeeded',
        stage: 'complete',
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        acquisitionMode: 'local-path',
        offlineOnly: false,
        cancellation: {
          requested: false,
          policy: 'best-effort-before-promotion',
        },
        notes: [],
      },
      trust: {
        algorithm: 'Ed25519',
        keyId: 'devholm-first-party-test-key',
        signedPayloadVersion: 'v1',
        signedPayloadSha256: 'b'.repeat(64),
        verificationTimestamp: new Date().toISOString(),
        trustDecision: 'trusted',
        verificationStatus: 'verified',
        publisherId: 'devholm-first-party',
        revocationState: 'none',
        notes: [],
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

  it('rejects execution when marketplace runtime install feature gate is disabled', async () => {
    process.env.DEVHOLM_MARKETPLACE_FIRST_PARTY_INSTALL_ENABLED = 'false';

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

    expect(response.status).toBe(403);
    expect(body.error).toContain('disabled');
    expect(executeFirstPartyMarketplaceInstall).not.toHaveBeenCalled();
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
    expect(body.result.activePath).toBeUndefined();
    expect(body.result.versionPath).toBeUndefined();
    expect(body.result.operation.operationId).toBe('op-123');
    expect(executeFirstPartyMarketplaceInstall).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactPath: '/tmp/calendar-v0.1.0.tar.gz',
        explicitAdminApproval: true,
        initiatedBy: 'admin@example.com',
      })
    );
  });

  it('passes remote acquisition mode flags to execution', async () => {
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
        acquisitionMode: 'remote-first-party',
        offlineOnly: true,
        explicitAdminApproval: true,
      }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(executeFirstPartyMarketplaceInstall).toHaveBeenCalledWith(
      expect.objectContaining({
        acquisitionMode: 'remote-first-party',
        offlineOnly: true,
        artifactPath: undefined,
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

  it('returns forbidden when execution service reports disabled gate', async () => {
    executeFirstPartyMarketplaceInstall.mockRejectedValue(
      new Error('Marketplace first-party runtime install execution is disabled')
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
    expect(response.status).toBe(403);
  });
});
