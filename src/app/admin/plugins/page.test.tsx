import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminPluginsPage from './page';

function createPlugin(overrides: Record<string, unknown> = {}) {
  return {
    plugin: {
      id: 'url-shortener',
      name: 'URL Shortener',
      description: 'Short URL service',
      source: 'core',
      enabledByDefault: false,
      adminSurface: null,
      capabilities: {
        admin: true,
        api: true,
        publicRoutes: false,
        navigation: false,
        sitemap: false,
        embeds: false,
      },
      isEnabled: false,
      installed: false,
      installedVersion: null,
      bundledVersion: '1.0.0',
      lifecycleState: 'bundled',
      operationStatus: 'idle',
      updatedAt: null,
    },
    catalogEntry: {
      pluginId: 'url-shortener',
      pluginSubdirectory: 'plugins/url-shortener',
      manifestPath: 'plugins/url-shortener/manifest.json',
      version: '1.0.0',
      runtimeInstallSupported: true,
      installReadiness: 'catalog-contract-ready',
      source: {
        repositoryUrl: 'https://example.com/repo.git',
        ref: 'v1.0.0',
      },
      publisher: {
        publisherId: 'devholm-first-party',
        classification: 'first-party',
      },
    },
    capabilities: {
      permissionKeys: [],
      capabilities: [],
      scopes: [],
    },
    lifecycle: {
      hasAfterInstall: false,
      hasAfterUpgrade: false,
      hasBeforeDisable: false,
      hasBeforeUninstall: false,
      hasPurge: false,
    },
    migration: {
      migrationCount: 1,
      policy: 'declared',
      destructiveDataWipe: 'blocked',
    },
    signature: {
      decision: 'trusted',
      status: 'verified',
      keyId: null,
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
      recoveryRequired: true,
    },
    desiredLifecycleState: 'configured',
    observedLifecycleState: 'recovery-required',
    reconciliation: {
      action: 'require-recovery',
      recoveryClassification: 'recovery-required',
      message: 'Recovery is required before further lifecycle changes can proceed.',
      remediation: 'Open recovery flow and reconcile interrupted lifecycle phases.',
    },
    rollback: {
      eligible: false,
      reasonCode: 'recovery-required',
    },
    latestTransition: {
      eventId: null,
      transition: null,
      result: null,
      timestamp: null,
      errorCode: null,
    },
    migrationCheckpoint: {
      interrupted: true,
      interruptedMigrationId: 'url-shortener:001',
      interruptedDirection: 'up',
      completedCount: 0,
      latestCompletedMigrationId: null,
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
        runtime: 'disabled',
        trust: 'verified',
        health: 'degraded',
        recovery: 'recovery-required',
      },
      summaryState: 'recovery-required',
      validationErrors: [],
    },
    actionAuthority: {
      byId: {
        install: {
          id: 'install',
          enabled: false,
          reasonCode: 'recovery-required',
          safeExplanation: 'Install is blocked until recovery is completed.',
          approvalRequired: true,
          destructive: false,
          recoveryClassification: 'recovery-required',
        },
      },
      available: [],
      blocked: [
        {
          id: 'install',
          reasonCode: 'recovery-required',
          safeExplanation: 'Install is blocked until recovery is completed.',
        },
      ],
    },
    actions: {
      install: {
        allowed: false,
        reasonCode: 'recovery-required',
        remediation: 'Install is blocked until recovery is completed.',
      },
      update: {
        allowed: false,
        reasonCode: 'update-not-yet-supported',
        remediation: 'Not supported',
      },
      rollback: {
        allowed: false,
        reasonCode: 'recovery-required',
        remediation: 'Recovery first',
      },
      enable: {
        allowed: false,
        reasonCode: 'recovery-required',
        remediation: 'Recovery first',
      },
      disable: {
        allowed: false,
        reasonCode: 'already-disabled',
        remediation: 'Already disabled',
      },
    },
    ...overrides,
  };
}

describe('AdminPluginsPage', () => {
  beforeEach(() => {
    const plugin = createPlugin();

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/admin/plugins/marketplace/catalog')) {
        return {
          ok: true,
          json: async () => ({ plugins: [plugin] }),
        } as Response;
      }

      if (url.includes('/api/admin/plugins/marketplace/cache-health')) {
        return {
          ok: true,
          json: async () => ({
            summary: {
              generatedAt: new Date().toISOString(),
              usageBytes: 0,
              usageEntries: 0,
              pinnedUsageBytes: 0,
              pinnedEntries: 0,
              evictableUsageBytes: 0,
              evictableEntries: 0,
              mirrors: { total: 0, enabled: 0, degraded: 0 },
              audits: { latestRunId: null, latestStatus: null, latestCompletedAt: null },
              degraded: {
                overQuota: false,
                mirrorsDegraded: false,
                latestAuditDegraded: false,
              },
              policy: { maxCacheBytes: 1 },
            },
          }),
        } as Response;
      }

      if (url.includes('/api/admin/plugins/marketplace/mirrors')) {
        return {
          ok: true,
          json: async () => ({ mirrors: [] }),
        } as Response;
      }

      return {
        ok: false,
        json: async () => ({ error: 'not-found' }),
      } as Response;
    }) as unknown as typeof fetch;
  });

  it('shows recovery status prominently and uses authority to disable install', async () => {
    render(<AdminPluginsPage />);

    await waitFor(() => {
      expect(screen.getByText('URL Shortener')).toBeInTheDocument();
    });

    expect(screen.getByText(/Recovery required:/)).toBeInTheDocument();
    expect(screen.getByText(/Interrupted migration checkpoint:/)).toBeInTheDocument();

    const installButton = screen.getByRole('button', { name: 'Install' });
    expect(installButton).toBeDisabled();
  });
});
