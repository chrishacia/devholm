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

function createCatalogProjection(overrides: Record<string, unknown> = {}) {
  return {
    plugin: {
      id: 'url-shortener',
      name: 'URL Shortener',
      description: 'Reference URL shortener',
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
      isEnabled: true,
      installed: true,
      installedVersion: '0.1.0',
      bundledVersion: '0.1.0',
      lifecycleState: 'installed',
      operationStatus: 'idle',
      updatedAt: '2026-07-18T12:00:00.000Z',
    },
    catalogEntry: {
      pluginId: 'url-shortener',
      pluginSubdirectory: 'plugins/url-shortener',
      manifestPath: 'plugins/url-shortener/manifest.json',
      version: '0.1.0',
      runtimeInstallSupported: false,
      installReadiness: 'catalog-contract-ready',
      source: {
        sourceType: 'marketplace',
        repositoryUrl: 'https://github.com/chrishacia/devholm-plugins',
        ref: 'v0.1.0',
      },
      publisher: {
        publisherId: 'devholm-first-party',
        classification: 'first-party',
      },
      artifact: {
        format: 'tar.gz',
        readiness: 'planned',
        immutable: false,
        signature: { status: 'not-provided' },
      },
    },
    capabilities: {
      permissionKeys: ['plugin.url-shortener.manage'],
      capabilities: ['url-shortener-admin'],
      scopes: ['admin'],
    },
    lifecycle: {
      hasAfterInstall: true,
      hasAfterUpgrade: true,
      hasBeforeDisable: true,
      hasBeforeUninstall: true,
      hasPurge: true,
      disablePolicy: 'non-destructive',
      uninstallPolicy: 'non-destructive',
      dataRetention: 'retain-all-calendar-data',
    },
    migration: {
      migrationCount: 1,
      policy: 'declared',
      destructiveDataWipe: 'blocked',
    },
    signature: {
      decision: 'trusted',
      status: 'verified',
      keyId: 'devholm-first-party-key',
      notes: [],
    },
    trustPolicy: {
      outcome: 'allow',
      reasonCode: 'allowed',
    },
    operation: {
      hasActive: false,
      status: null,
      stage: null,
      operationId: null,
      updatedAt: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      leaseExpired: false,
      recoveryRequired: false,
    },
    desiredLifecycleState: 'configured',
    observedLifecycleState: 'active',
    reconciliation: {
      action: 'none',
      recoveryClassification: 'none',
      message: 'Lifecycle state is healthy for standard orchestrated operations.',
      remediation: 'Proceed with canonical server-provided lifecycle actions.',
    },
    rollback: {
      eligible: false,
      reasonCode: 'no-eligible-rollback-candidate',
    },
    latestTransition: {
      eventId: null,
      transition: null,
      result: null,
      timestamp: null,
      errorCode: null,
    },
    migrationCheckpoint: {
      interrupted: false,
      interruptedMigrationId: null,
      interruptedDirection: null,
      completedCount: 1,
      latestCompletedMigrationId: 'url-shortener:20260701010000',
    },
    sourceResolution: {
      configuredSourceKind: 'bundled-fallback-artifact',
      resolvedSourceKind: 'bundled-fallback-artifact',
      localOverrideEnabled: false,
      localOverrideFilesystemPath: null,
      resolverFailureCodes: [],
      diagnostics: {
        hasErrors: false,
        errorCount: 0,
      },
    },
    history: [],
    lifecycleState: {
      axes: {
        desired: 'configured',
        resolution: 'verified',
        build: 'build-included',
        deployment: 'deployed',
        runtime: 'active',
        trust: 'verified',
        health: 'healthy',
        recovery: 'none',
      },
      summaryState: 'active',
      validationErrors: [],
    },
    actionAuthority: {
      byId: {
        install: {
          id: 'install',
          enabled: false,
          reasonCode: 'already-installed',
          safeExplanation:
            'Install is blocked until policy, trust, and recovery gates are satisfied.',
          approvalRequired: true,
          destructive: false,
          recoveryClassification: 'none',
        },
        enable: {
          id: 'enable',
          enabled: false,
          reasonCode: 'already-enabled',
          safeExplanation: 'Enable is blocked by current lifecycle or recovery constraints.',
          approvalRequired: false,
          destructive: false,
          recoveryClassification: 'none',
        },
        disable: {
          id: 'disable',
          enabled: true,
          reasonCode: null,
          safeExplanation: 'Disable can proceed safely.',
          approvalRequired: false,
          destructive: true,
          recoveryClassification: 'none',
        },
        update: {
          id: 'update',
          enabled: false,
          reasonCode: 'update-not-yet-supported',
          safeExplanation:
            'Update flow is not yet exposed for marketplace-admin runtime operations.',
          approvalRequired: false,
          destructive: false,
          recoveryClassification: 'none',
        },
        rollback: {
          id: 'rollback',
          enabled: false,
          reasonCode: 'no-eligible-rollback-candidate',
          safeExplanation: 'Rollback is blocked by migration, artifact, or recovery constraints.',
          approvalRequired: false,
          destructive: true,
          recoveryClassification: 'recovery-required',
        },
      },
      available: [{ id: 'disable', safeExplanation: 'Disable can proceed safely.' }],
      blocked: [
        {
          id: 'update',
          reasonCode: 'update-not-yet-supported',
          safeExplanation:
            'Update flow is not yet exposed for marketplace-admin runtime operations.',
        },
      ],
    },
    actions: {
      install: {
        allowed: false,
        reasonCode: 'already-installed',
        remediation: 'Install is blocked until policy, trust, and recovery gates are satisfied.',
      },
      update: {
        allowed: false,
        reasonCode: 'update-not-yet-supported',
        remediation: 'Update flow is not yet exposed for marketplace-admin runtime operations.',
      },
      rollback: {
        allowed: false,
        reasonCode: 'no-eligible-rollback-candidate',
        remediation: 'Rollback is blocked by migration, artifact, or recovery constraints.',
      },
      enable: {
        allowed: false,
        reasonCode: 'already-enabled',
        remediation: 'Enable is blocked by current lifecycle or recovery constraints.',
      },
      disable: {
        allowed: true,
        reasonCode: null,
        remediation: 'Disable can proceed safely.',
      },
    },
    ...overrides,
  };
}

describe('admin marketplace catalog route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyAdmin.mockResolvedValue({ sub: 'admin-1', roles: ['admin'] });
    listMarketplaceAdminPlugins.mockResolvedValue([createCatalogProjection()]);
  });

  it('denies non-admin requests', async () => {
    verifyAdmin.mockResolvedValue(null);
    const response = await GET(
      new NextRequest('http://localhost:3000/api/admin/plugins/marketplace/catalog')
    );

    expect(response.status).toBe(401);
  });

  it('rejects authenticated but unauthorized requests through verifyAdmin gate', async () => {
    verifyAdmin.mockResolvedValue(null);

    const response = await GET(
      new NextRequest('http://localhost:3000/api/admin/plugins/marketplace/catalog', {
        headers: {
          authorization: 'Bearer non-admin-token',
        },
      })
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns catalog payload for admins with truthful url-shortener projection fields', async () => {
    const response = await GET(
      new NextRequest('http://localhost:3000/api/admin/plugins/marketplace/catalog')
    );

    const body = await response.json();
    expect(response.status).toBe(200);
    expect(Array.isArray(body.plugins)).toBe(true);
    const projected = body.plugins[0];

    expect(projected.plugin.id).toBe('url-shortener');
    expect(projected.catalogEntry.pluginSubdirectory).toBe('plugins/url-shortener');
    expect(projected.plugin.name).toBe('URL Shortener');
    expect(projected.catalogEntry.version).toBe('0.1.0');
    expect(projected.catalogEntry.source.sourceType).toBe('marketplace');
    expect(projected.sourceResolution.localOverrideEnabled).toBe(false);
    expect(projected.catalogEntry.publisher.publisherId).toBe('devholm-first-party');
    expect(projected.signature.decision).toBe('trusted');
    expect(projected.trustPolicy.outcome).toBe('allow');
    expect(projected.lifecycleState.axes.build).toBe('build-included');
    expect(projected.lifecycleState.axes.deployment).toBe('deployed');
    expect(projected.desiredLifecycleState).toBe('configured');
    expect(projected.observedLifecycleState).toBe('active');
    expect(projected.plugin.isEnabled).toBe(true);
    expect(projected.operation.status).toBeNull();
    expect(projected.actions.update.allowed).toBe(false);
    expect(projected.actions.update.reasonCode).toBe('update-not-yet-supported');
    expect(projected.rollback.eligible).toBe(false);
    expect(projected.rollback.reasonCode).toBe('no-eligible-rollback-candidate');
    expect(projected.operation.recoveryRequired).toBe(false);
    expect(projected.actionAuthority.available.map((entry: { id: string }) => entry.id)).toContain(
      'disable'
    );
    expect(projected.actionAuthority.blocked.map((entry: { id: string }) => entry.id)).toContain(
      'update'
    );
    expect(projected.actions.update.remediation.length).toBeGreaterThan(0);
    expect(typeof body.generatedAt).toBe('string');
  });

  it('returns redacted local override path when development override is active', async () => {
    listMarketplaceAdminPlugins.mockResolvedValue([
      createCatalogProjection({
        sourceResolution: {
          configuredSourceKind: 'local-development-checkout',
          resolvedSourceKind: 'local-development-checkout',
          localOverrideEnabled: true,
          localOverrideFilesystemPath: '[redacted-local-override-path]',
          resolverFailureCodes: [],
          diagnostics: {
            hasErrors: false,
            errorCount: 0,
          },
        },
      }),
    ]);

    const response = await GET(
      new NextRequest('http://localhost:3000/api/admin/plugins/marketplace/catalog')
    );

    const body = await response.json();
    const projected = body.plugins[0];
    expect(projected.sourceResolution.localOverrideEnabled).toBe(true);
    expect(projected.sourceResolution.localOverrideFilesystemPath).toBe(
      '[redacted-local-override-path]'
    );
    expect(projected.sourceResolution.resolvedSourceKind).toBe('local-development-checkout');
  });

  it('serializes disabled lifecycle truth without contradictory not-installed state', async () => {
    listMarketplaceAdminPlugins.mockResolvedValue([
      createCatalogProjection({
        plugin: {
          ...createCatalogProjection().plugin,
          installed: true,
          isEnabled: false,
          lifecycleState: 'disabled',
        },
        observedLifecycleState: 'disabled',
        lifecycleState: {
          ...createCatalogProjection().lifecycleState,
          axes: {
            ...createCatalogProjection().lifecycleState.axes,
            runtime: 'disabled',
          },
          summaryState: 'disabled',
        },
        actions: {
          ...createCatalogProjection().actions,
          enable: {
            allowed: true,
            reasonCode: null,
            remediation: 'Enable can proceed safely.',
          },
          disable: {
            allowed: false,
            reasonCode: 'already-disabled',
            remediation: 'Disable is blocked by current lifecycle or recovery constraints.',
          },
        },
      }),
    ]);

    const response = await GET(
      new NextRequest('http://localhost:3000/api/admin/plugins/marketplace/catalog')
    );

    const projected = (await response.json()).plugins[0];
    expect(projected.plugin.installed).toBe(true);
    expect(projected.plugin.isEnabled).toBe(false);
    expect(projected.lifecycleState.axes.runtime).toBe('disabled');
    expect(projected.actions.enable.allowed).toBe(true);
    expect(projected.actions.disable.allowed).toBe(false);
  });

  it('serializes pending operation truth and blocks unsafe actions during execution', async () => {
    listMarketplaceAdminPlugins.mockResolvedValue([
      createCatalogProjection({
        operation: {
          hasActive: true,
          status: 'in_progress',
          stage: 'executing',
          operationId: 'op-123',
          updatedAt: '2026-07-18T13:00:00.000Z',
          leaseOwner: 'worker-a',
          leaseExpiresAt: '2099-01-01T00:00:00.000Z',
          leaseExpired: false,
          recoveryRequired: false,
        },
        desiredLifecycleState: 'updating',
        actions: {
          ...createCatalogProjection().actions,
          enable: {
            allowed: false,
            reasonCode: 'operation-in-progress',
            remediation: 'Enable is blocked by current lifecycle or recovery constraints.',
          },
          disable: {
            allowed: false,
            reasonCode: 'operation-in-progress',
            remediation: 'Disable is blocked by current lifecycle or recovery constraints.',
          },
        },
      }),
    ]);

    const response = await GET(
      new NextRequest('http://localhost:3000/api/admin/plugins/marketplace/catalog')
    );

    const projected = (await response.json()).plugins[0];
    expect(projected.operation.hasActive).toBe(true);
    expect(projected.operation.status).toBe('in_progress');
    expect(projected.operation.stage).toBe('executing');
    expect(projected.desiredLifecycleState).toBe('updating');
    expect(projected.actions.enable.reasonCode).toBe('operation-in-progress');
    expect(projected.actions.disable.reasonCode).toBe('operation-in-progress');
  });

  it('serializes safe update-available state with explicit target metadata and allowed update action', async () => {
    listMarketplaceAdminPlugins.mockResolvedValue([
      createCatalogProjection({
        plugin: {
          ...createCatalogProjection().plugin,
          installedVersion: '0.1.0',
        },
        catalogEntry: {
          ...createCatalogProjection().catalogEntry,
          version: '0.2.0',
          source: {
            ...createCatalogProjection().catalogEntry.source,
            ref: 'v0.2.0',
          },
        },
        lifecycleState: {
          ...createCatalogProjection().lifecycleState,
          summaryState: 'update-available',
        },
        actionAuthority: {
          ...createCatalogProjection().actionAuthority,
          byId: {
            ...createCatalogProjection().actionAuthority.byId,
            update: {
              id: 'update',
              enabled: true,
              reasonCode: null,
              safeExplanation: 'Update can proceed with canonical lifecycle orchestration.',
              approvalRequired: true,
              destructive: false,
              recoveryClassification: 'none',
            },
          },
          available: [
            {
              id: 'update',
              safeExplanation: 'Update can proceed with canonical lifecycle orchestration.',
            },
          ],
          blocked: [],
        },
        actions: {
          ...createCatalogProjection().actions,
          update: {
            allowed: true,
            reasonCode: null,
            remediation: 'Update can proceed with canonical lifecycle orchestration.',
          },
        },
        history: [
          {
            fromVersion: '0.1.0',
            toVersion: '0.2.0',
            status: 'success',
            appliedAt: '2026-07-18T00:00:00.000Z',
            rollbackAvailableUntil: '2026-08-18T00:00:00.000Z',
          },
        ],
      }),
    ]);

    const response = await GET(
      new NextRequest('http://localhost:3000/api/admin/plugins/marketplace/catalog')
    );

    const projected = (await response.json()).plugins[0];
    expect(projected.plugin.installedVersion).toBe('0.1.0');
    expect(projected.catalogEntry.version).toBe('0.2.0');
    expect(projected.catalogEntry.source.ref).toBe('v0.2.0');
    expect(projected.lifecycleState.summaryState).toBe('update-available');
    expect(projected.actions.update.allowed).toBe(true);
    expect(projected.actions.update.reasonCode).toBeNull();
    expect(projected.history[0]).toMatchObject({
      fromVersion: '0.1.0',
      toVersion: '0.2.0',
    });
  });

  it('serializes rollback availability and irreversible-migration rollback block reasons', async () => {
    listMarketplaceAdminPlugins.mockResolvedValue([
      createCatalogProjection({
        rollback: {
          eligible: true,
          reasonCode: 'compatible',
        },
        actionAuthority: {
          ...createCatalogProjection().actionAuthority,
          byId: {
            ...createCatalogProjection().actionAuthority.byId,
            rollback: {
              id: 'rollback',
              enabled: true,
              reasonCode: null,
              safeExplanation: 'Rollback is available for the current state.',
              approvalRequired: false,
              destructive: true,
              recoveryClassification: 'rollback-eligible',
            },
          },
        },
        actions: {
          ...createCatalogProjection().actions,
          rollback: {
            allowed: true,
            reasonCode: null,
            remediation: 'Rollback is available for the current state.',
          },
        },
      }),
      createCatalogProjection({
        rollback: {
          eligible: false,
          reasonCode: 'irreversible-migrations-present',
        },
        actions: {
          ...createCatalogProjection().actions,
          rollback: {
            allowed: false,
            reasonCode: 'irreversible-migrations-present',
            remediation: 'Rollback is blocked by migration, artifact, or recovery constraints.',
          },
        },
      }),
    ]);

    const response = await GET(
      new NextRequest('http://localhost:3000/api/admin/plugins/marketplace/catalog')
    );

    const body = await response.json();
    expect(body.plugins[0].rollback.eligible).toBe(true);
    expect(body.plugins[0].actions.rollback.allowed).toBe(true);
    expect(body.plugins[1].rollback.reasonCode).toBe('irreversible-migrations-present');
    expect(body.plugins[1].actions.rollback.reasonCode).toBe('irreversible-migrations-present');
  });

  it('serializes trust and compatibility blocks with recovery-required remediation', async () => {
    listMarketplaceAdminPlugins.mockResolvedValue([
      createCatalogProjection({
        trustPolicy: {
          outcome: 'deny',
          reasonCode: 'publisher-revoked',
        },
        signature: {
          decision: 'blocked',
          status: 'revoked',
          keyId: 'old-key',
          notes: ['key revoked'],
        },
        sourceResolution: {
          configuredSourceKind: 'bundled-fallback-artifact',
          resolvedSourceKind: null,
          localOverrideEnabled: false,
          localOverrideFilesystemPath: null,
          resolverFailureCodes: ['canonical-source-missing'],
          diagnostics: {
            hasErrors: true,
            errorCount: 1,
          },
        },
        lifecycleState: {
          ...createCatalogProjection().lifecycleState,
          axes: {
            ...createCatalogProjection().lifecycleState.axes,
            resolution: 'failed',
            trust: 'blocked',
            health: 'failed',
            recovery: 'recovery-required',
          },
          summaryState: 'recovery-required',
        },
        operation: {
          ...createCatalogProjection().operation,
          recoveryRequired: true,
        },
        reconciliation: {
          action: 'require-recovery',
          recoveryClassification: 'recovery-required',
          message: 'Recovery is required before further lifecycle changes can proceed.',
          remediation: 'Open recovery flow and reconcile interrupted lifecycle phases.',
        },
        actions: {
          ...createCatalogProjection().actions,
          install: {
            allowed: false,
            reasonCode: 'recovery-required',
            remediation: 'Recovery action is required before normal lifecycle mutations continue.',
          },
        },
      }),
    ]);

    const response = await GET(
      new NextRequest('http://localhost:3000/api/admin/plugins/marketplace/catalog')
    );

    const projected = (await response.json()).plugins[0];
    expect(projected.signature.decision).toBe('blocked');
    expect(projected.trustPolicy.reasonCode).toBe('publisher-revoked');
    expect(projected.lifecycleState.axes.trust).toBe('blocked');
    expect(projected.lifecycleState.axes.resolution).toBe('failed');
    expect(projected.operation.recoveryRequired).toBe(true);
    expect(projected.reconciliation.action).toBe('require-recovery');
    expect(projected.actions.install.reasonCode).toBe('recovery-required');
    expect(projected.sourceResolution.resolverFailureCodes).toContain('canonical-source-missing');
  });

  it('shows missing configuration as blocked state with actionable remediation payload', async () => {
    listMarketplaceAdminPlugins.mockResolvedValue([
      createCatalogProjection({
        trustPolicy: {
          outcome: 'deny',
          reasonCode: 'policy-malformed',
        },
        lifecycleState: {
          ...createCatalogProjection().lifecycleState,
          axes: {
            ...createCatalogProjection().lifecycleState.axes,
            resolution: 'blocked',
          },
          summaryState: 'blocked',
        },
        actions: {
          ...createCatalogProjection().actions,
          install: {
            allowed: false,
            reasonCode: 'trust-blocked',
            remediation: 'Fix configuration issues and rerun trust validation.',
          },
        },
      }),
    ]);

    const response = await GET(
      new NextRequest('http://localhost:3000/api/admin/plugins/marketplace/catalog')
    );

    const projected = (await response.json()).plugins[0];
    expect(projected.trustPolicy.reasonCode).toBe('policy-malformed');
    expect(projected.lifecycleState.summaryState).toBe('blocked');
    expect(projected.actions.install.allowed).toBe(false);
    expect(projected.actions.install.remediation).toBe(
      'Fix configuration issues and rerun trust validation.'
    );
  });

  it('returns stable error shape on failures', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    listMarketplaceAdminPlugins.mockRejectedValue(
      new Error('DB password=supersecret path=/tmp/private stacktrace internal')
    );

    const response = await GET(
      new NextRequest('http://localhost:3000/api/admin/plugins/marketplace/catalog')
    );

    const body = await response.json();
    expect(response.status).toBe(500);
    expect(body.error).toBe('Failed to fetch marketplace catalog');
    expect(body.reasonCode).toBe('marketplace-catalog-read-failed');
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('supersecret');
    expect(serialized).not.toContain('/tmp/private');
    expect(serialized.toLowerCase()).not.toContain('stack');
    expect(serialized.toLowerCase()).not.toContain('database');
    consoleErrorSpy.mockRestore();
  });
});
