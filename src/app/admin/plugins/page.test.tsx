import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
        enable: {
          id: 'enable',
          enabled: false,
          reasonCode: 'recovery-required',
          safeExplanation: 'Enable is blocked by current lifecycle or recovery constraints.',
          approvalRequired: false,
          destructive: false,
          recoveryClassification: 'recovery-required',
        },
        disable: {
          id: 'disable',
          enabled: false,
          reasonCode: 'recovery-required',
          safeExplanation: 'Disable is blocked by current lifecycle or recovery constraints.',
          approvalRequired: false,
          destructive: true,
          recoveryClassification: 'recovery-required',
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
          reasonCode: 'recovery-required',
          safeExplanation: 'Rollback is blocked by migration, artifact, or recovery constraints.',
          approvalRequired: false,
          destructive: true,
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

function mockFetchForPlugin(plugin: Record<string, unknown>) {
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
}

async function renderWithPlugin(plugin: Record<string, unknown>) {
  mockFetchForPlugin(plugin);
  render(<AdminPluginsPage />);
  await waitFor(() => {
    expect(screen.getByText('URL Shortener')).toBeInTheDocument();
  });
}

describe('AdminPluginsPage', () => {
  beforeEach(() => {
    mockFetchForPlugin(createPlugin());
  });

  it('shows recovery status prominently and uses authority to disable install', async () => {
    await renderWithPlugin(createPlugin());

    expect(screen.getByText(/Recovery required:/)).toBeInTheDocument();
    expect(screen.getByText(/Interrupted migration checkpoint:/)).toBeInTheDocument();

    const installButton = screen.getByRole('button', { name: 'Install' });
    expect(installButton).toBeDisabled();
  });

  it('renders canonical active truth without contradictory not-installed messaging', async () => {
    const plugin = createPlugin({
      plugin: {
        ...createPlugin().plugin,
        installed: true,
        isEnabled: true,
        installedVersion: '0.1.0',
      },
      operation: {
        ...createPlugin().operation,
        recoveryRequired: false,
      },
      trustPolicy: {
        outcome: 'allow',
        reasonCode: 'allowed',
      },
      signature: {
        decision: 'trusted',
        status: 'verified',
        keyId: 'devholm-first-party-key',
        notes: [],
      },
      lifecycleState: {
        ...createPlugin().lifecycleState,
        axes: {
          ...createPlugin().lifecycleState.axes,
          deployment: 'deployed',
          runtime: 'active',
          health: 'healthy',
          recovery: 'none',
        },
        summaryState: 'active',
      },
      observedLifecycleState: 'active',
      rollback: {
        eligible: false,
        reasonCode: 'no-eligible-rollback-candidate',
      },
      actionAuthority: {
        ...createPlugin().actionAuthority,
        byId: {
          ...createPlugin().actionAuthority.byId,
          disable: {
            id: 'disable',
            enabled: true,
            reasonCode: null,
            safeExplanation: 'Disable can proceed safely.',
            approvalRequired: false,
            destructive: true,
            recoveryClassification: 'none',
          },
        },
      },
    });

    await renderWithPlugin(plugin);

    expect(screen.getByText('Available: 1.0.0')).toBeInTheDocument();
    expect(screen.getByText('Installed: 0.1.0')).toBeInTheDocument();
    expect(screen.getByText('Trust: allowed')).toBeInTheDocument();
    expect(screen.getByText('Canonical active')).toBeInTheDocument();
    expect(screen.getByText('Source: Bundled Default')).toBeInTheDocument();
    expect(screen.queryByText('Not installed')).not.toBeInTheDocument();
  });

  it('renders local override state with source labeling and safe path redaction in inspect view', async () => {
    const plugin = createPlugin({
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
      operation: {
        ...createPlugin().operation,
        recoveryRequired: false,
      },
      actionAuthority: {
        ...createPlugin().actionAuthority,
        byId: {
          ...createPlugin().actionAuthority.byId,
          install: {
            ...createPlugin().actionAuthority.byId.install,
            reasonCode: 'already-installed',
          },
        },
      },
    });

    await renderWithPlugin(plugin);

    expect(screen.getByText('Source: Local Override')).toBeInTheDocument();
    expect(screen.getByText('Resolved source: local-development-checkout')).toBeInTheDocument();

    const inspectButton = screen.getByRole('button', { name: 'Inspect URL Shortener' });
    fireEvent.click(inspectButton);

    await waitFor(() => {
      expect(screen.getByText('Development source')).toBeInTheDocument();
    });
    expect(
      screen.getByText(/Local override active at \[redacted-local-override-path\]/)
    ).toBeInTheDocument();
  });

  it('renders disabled runtime truth with enable path and disable blocked reason', async () => {
    const plugin = createPlugin({
      plugin: {
        ...createPlugin().plugin,
        installed: true,
        isEnabled: false,
      },
      operation: {
        ...createPlugin().operation,
        recoveryRequired: false,
      },
      observedLifecycleState: 'disabled',
      lifecycleState: {
        ...createPlugin().lifecycleState,
        axes: {
          ...createPlugin().lifecycleState.axes,
          runtime: 'disabled',
          health: 'healthy',
          recovery: 'none',
        },
        summaryState: 'disabled',
      },
      actionAuthority: {
        ...createPlugin().actionAuthority,
        byId: {
          ...createPlugin().actionAuthority.byId,
          enable: {
            id: 'enable',
            enabled: true,
            reasonCode: null,
            safeExplanation: 'Enable can proceed safely.',
            approvalRequired: false,
            destructive: false,
            recoveryClassification: 'none',
          },
          disable: {
            id: 'disable',
            enabled: false,
            reasonCode: 'already-disabled',
            safeExplanation: 'Disable is blocked by current lifecycle or recovery constraints.',
            approvalRequired: false,
            destructive: true,
            recoveryClassification: 'none',
          },
        },
      },
      rollback: {
        eligible: false,
        reasonCode: 'no-eligible-rollback-candidate',
      },
    });

    await renderWithPlugin(plugin);

    expect(screen.getByText('Disabled')).toBeInTheDocument();
    expect(screen.getByText('Installed')).toBeInTheDocument();
    expect(screen.queryByText('Not installed')).not.toBeInTheDocument();
    expect(
      screen.getByText('Rollback blocked: no-eligible-rollback-candidate')
    ).toBeInTheDocument();
  });

  it('renders pending update and blocks unsafe actions while operation is active', async () => {
    const plugin = createPlugin({
      plugin: {
        ...createPlugin().plugin,
        installed: true,
      },
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
      actionAuthority: {
        ...createPlugin().actionAuthority,
        byId: {
          ...createPlugin().actionAuthority.byId,
          disable: {
            ...createPlugin().actionAuthority.byId.disable,
            enabled: false,
            reasonCode: 'operation-in-progress',
          },
        },
      },
    });

    await renderWithPlugin(plugin);

    expect(screen.getByText(/Operation in progress: executing/)).toBeInTheDocument();
    expect(screen.getByText('Desired updating')).toBeInTheDocument();
    expect(screen.getByText('Lease worker-a')).toBeInTheDocument();
  });

  it('renders rollback available and blocked rollback reasons from truthful state', async () => {
    const rollbackAvailable = createPlugin({
      operation: {
        ...createPlugin().operation,
        recoveryRequired: false,
      },
      rollback: {
        eligible: true,
        reasonCode: 'compatible',
      },
      actionAuthority: {
        ...createPlugin().actionAuthority,
        byId: {
          ...createPlugin().actionAuthority.byId,
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
    });

    await renderWithPlugin(rollbackAvailable);
    expect(screen.getByText('Rollback available')).toBeInTheDocument();

    const rollbackBlocked = createPlugin({
      operation: {
        ...createPlugin().operation,
        recoveryRequired: false,
      },
      rollback: {
        eligible: false,
        reasonCode: 'irreversible-migrations-present',
      },
      actionAuthority: {
        ...createPlugin().actionAuthority,
        byId: {
          ...createPlugin().actionAuthority.byId,
          rollback: {
            id: 'rollback',
            enabled: false,
            reasonCode: 'irreversible-migrations-present',
            safeExplanation: 'Rollback is blocked by migration, artifact, or recovery constraints.',
            approvalRequired: false,
            destructive: true,
            recoveryClassification: 'recovery-required',
          },
        },
      },
    });

    await renderWithPlugin(rollbackBlocked);
    expect(
      screen.getByText('Rollback blocked: irreversible-migrations-present')
    ).toBeInTheDocument();
  });

  it('renders blocked install and remediation for missing configuration state', async () => {
    const plugin = createPlugin({
      plugin: {
        ...createPlugin().plugin,
        installed: false,
      },
      trustPolicy: {
        outcome: 'deny',
        reasonCode: 'policy-malformed',
      },
      operation: {
        ...createPlugin().operation,
        recoveryRequired: false,
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
        ...createPlugin().lifecycleState,
        axes: {
          ...createPlugin().lifecycleState.axes,
          resolution: 'blocked',
          trust: 'blocked',
          health: 'degraded',
          recovery: 'none',
        },
        summaryState: 'blocked',
      },
      actionAuthority: {
        ...createPlugin().actionAuthority,
        byId: {
          ...createPlugin().actionAuthority.byId,
          install: {
            ...createPlugin().actionAuthority.byId.install,
            enabled: false,
            reasonCode: 'source-resolution-failed',
            safeExplanation: 'Fix configuration issues and rerun trust validation.',
          },
        },
      },
    });

    await renderWithPlugin(plugin);
    expect(
      screen.getByText('Source resolution failed: canonical-source-missing')
    ).toBeInTheDocument();
    expect(screen.getByText(/Install blocked: source-resolution-failed/)).toBeInTheDocument();
    expect(
      screen.getByText(/Fix configuration issues and rerun trust validation/)
    ).toBeInTheDocument();

    const installButton = screen.getByRole('button', { name: 'Install' });
    expect(installButton).toBeDisabled();
  });
});
