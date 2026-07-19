import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginAdminRecord } from '@core/types/plugins';

const listPluginStates = vi.hoisted(() => vi.fn());
const getPluginUpdateHistory = vi.hoisted(() => vi.fn());
const resolveCanonicalPluginSourceStatus = vi.hoisted(() => vi.fn());
const readMarketplaceInstallOperationState = vi.hoisted(() => vi.fn());
const verifyMarketplaceArtifactSignature = vi.hoisted(() => vi.fn());
const evaluateMarketplacePublisherTrustPolicy = vi.hoisted(() => vi.fn());
const loadTrustedMarketplaceKeysFromEnv = vi.hoisted(() => vi.fn());
const readLatestPluginLifecycleOperation = vi.hoisted(() => vi.fn());
const readLatestPluginLifecycleTransitionEventRecord = vi.hoisted(() => vi.fn());
const determinePluginRollbackCompatibility = vi.hoisted(() => vi.fn());
const readCompletedPluginMigrationCheckpoints = vi.hoisted(() => vi.fn());
const readInterruptedPluginMigrationCheckpoint = vi.hoisted(() => vi.fn());
const reconcilePluginLifecycleState = vi.hoisted(() => vi.fn());

vi.mock('@/db/plugins', () => ({
  listPluginStates,
}));

vi.mock('@core/db/plugin-versioning', () => ({
  getPluginUpdateHistory,
}));

vi.mock('@core/lib/plugin-development-source-resolution.server', () => ({
  resolveCanonicalPluginSourceStatus,
}));

vi.mock('@core/lib/plugin-marketplace-install-operation.server', () => ({
  readMarketplaceInstallOperationState,
}));

vi.mock('@core/lib/plugin-marketplace-signing.server', () => ({
  verifyMarketplaceArtifactSignature,
}));

vi.mock('@core/lib/plugin-marketplace-publisher-trust.server', () => ({
  evaluateMarketplacePublisherTrustPolicy,
}));

vi.mock('@core/lib/plugin-marketplace-trusted-keys.server', () => ({
  loadTrustedMarketplaceKeysFromEnv,
}));

vi.mock('@core/lib/plugin-lifecycle-orchestrator.server', () => ({
  readLatestPluginLifecycleOperation,
}));

vi.mock('@core/db/plugin-lifecycle', () => ({
  readLatestPluginLifecycleTransitionEventRecord,
}));

vi.mock('@core/db/plugin-migration-checkpoints', () => ({
  determinePluginRollbackCompatibility,
  readCompletedPluginMigrationCheckpoints,
  readInterruptedPluginMigrationCheckpoint,
}));

vi.mock('@core/lib/plugin-lifecycle-reconciler.server', () => ({
  reconcilePluginLifecycleState,
}));

import { listMarketplaceAdminPlugins } from '@core/lib/plugin-marketplace-admin.server';

function createPluginState(overrides: Partial<PluginAdminRecord> = {}): PluginAdminRecord {
  return {
    id: 'url-shortener',
    name: 'URL Shortener',
    description: 'URL Shortener plugin',
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
    bundled: true,
    installed: true,
    isEnabled: true,
    lifecycleState: 'installed',
    operationStatus: 'idle',
    installedVersion: '0.1.0',
    bundledVersion: '0.1.0',
    updatedAt: null,
    ...overrides,
  };
}

describe('marketplace admin projection for url-shortener', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    listPluginStates.mockResolvedValue([createPluginState()]);
    getPluginUpdateHistory.mockResolvedValue([]);
    resolveCanonicalPluginSourceStatus.mockReturnValue({
      plugins: [
        {
          pluginId: 'url-shortener',
          configuredSourceKind: 'bundled-fallback-artifact',
          resolvedSourceKind: 'bundled-fallback-artifact',
          localOverrideEnabled: false,
          localOverrideFilesystemPath: null,
          resolverFailureCodes: [],
        },
      ],
      diagnostics: {
        errors: [],
      },
    });
    readMarketplaceInstallOperationState.mockResolvedValue(null);
    verifyMarketplaceArtifactSignature.mockReturnValue({
      trustDecision: 'trusted',
      verificationStatus: 'verified',
      keyId: 'devholm-first-party-key',
      notes: [],
    });
    evaluateMarketplacePublisherTrustPolicy.mockReturnValue({
      outcome: 'allow',
      reasonCode: 'allowed',
    });
    loadTrustedMarketplaceKeysFromEnv.mockReturnValue([]);
    readLatestPluginLifecycleOperation.mockResolvedValue(null);
    readLatestPluginLifecycleTransitionEventRecord.mockResolvedValue(null);
    determinePluginRollbackCompatibility.mockResolvedValue({
      rollbackCompatible: true,
      reason: 'compatible',
    });
    readCompletedPluginMigrationCheckpoints.mockResolvedValue([]);
    readInterruptedPluginMigrationCheckpoint.mockResolvedValue(null);
    reconcilePluginLifecycleState.mockResolvedValue({
      action: 'none',
      reason: 'No operation',
      operationId: null,
    });
  });

  it('projects canonical active state with trusted source and deployed lifecycle axes', async () => {
    const plugins = await listMarketplaceAdminPlugins();

    expect(plugins).toHaveLength(1);
    const projected = plugins[0];

    expect(projected.plugin.id).toBe('url-shortener');
    expect(projected.desiredLifecycleState).toBe('configured');
    expect(projected.lifecycleState.axes.build).toBe('build-included');
    expect(projected.lifecycleState.axes.deployment).toBe('deployed');
    expect(projected.lifecycleState.axes.runtime).toBe('active');
    expect(projected.lifecycleState.axes.trust).toBe('verified');
    expect(projected.sourceResolution.configuredSourceKind).toBe('bundled-fallback-artifact');
    expect(projected.sourceResolution.localOverrideEnabled).toBe(false);
    expect(projected.actions.disable.allowed).toBe(true);
  });

  it('redacts local override filesystem path while preserving local source truth', async () => {
    resolveCanonicalPluginSourceStatus.mockReturnValue({
      plugins: [
        {
          pluginId: 'url-shortener',
          configuredSourceKind: 'local-development-checkout',
          resolvedSourceKind: 'local-development-checkout',
          localOverrideEnabled: true,
          localOverrideFilesystemPath: '/tmp/url-shortener-local',
          resolverFailureCodes: [],
        },
      ],
      diagnostics: {
        errors: [],
      },
    });

    const plugins = await listMarketplaceAdminPlugins();
    const projected = plugins[0];

    expect(projected.sourceResolution.configuredSourceKind).toBe('local-development-checkout');
    expect(projected.sourceResolution.resolvedSourceKind).toBe('local-development-checkout');
    expect(projected.sourceResolution.localOverrideEnabled).toBe(true);
    expect(projected.sourceResolution.localOverrideFilesystemPath).toBe(
      '[redacted-local-override-path]'
    );
    expect(projected.sourceResolution.resolverFailureCodes).toEqual([]);
  });

  it('projects disabled runtime state and blocks disable while allowing enable', async () => {
    listPluginStates.mockResolvedValue([
      createPluginState({
        isEnabled: false,
        lifecycleState: 'disabled',
      }),
    ]);

    const plugins = await listMarketplaceAdminPlugins();
    const projected = plugins[0];

    expect(projected.lifecycleState.axes.runtime).toBe('disabled');
    expect(projected.actions.enable.allowed).toBe(true);
    expect(projected.actions.disable.allowed).toBe(false);
    expect(projected.actions.disable.reasonCode).toBe('already-disabled');
  });

  it('projects pending update operation with active operation state and blocked toggles', async () => {
    readLatestPluginLifecycleOperation.mockResolvedValue({
      status: 'running',
      currentPhase: 'executing',
      updatedAt: '2026-07-01T00:00:00.000Z',
      leaseOwner: 'worker-1',
      leaseExpiresAt: '2099-01-01T00:00:00.000Z',
    });

    const plugins = await listMarketplaceAdminPlugins();
    const projected = plugins[0];

    expect(projected.operation.hasActive).toBe(true);
    expect(projected.operation.status).toBe('in_progress');
    expect(projected.operation.stage).toBe('executing');
    expect(projected.desiredLifecycleState).toBe('updating');
    expect(projected.actions.enable.allowed).toBe(false);
    expect(projected.actions.enable.reasonCode).toBe('operation-in-progress');
    expect(projected.actions.disable.allowed).toBe(false);
    expect(projected.actions.disable.reasonCode).toBe('operation-in-progress');
  });

  it('projects rollback availability and compatibility blocks accurately', async () => {
    const rollbackUntil = new Date(Date.now() + 10 * 60_000).toISOString();
    getPluginUpdateHistory.mockResolvedValue([
      {
        pluginId: 'url-shortener',
        fromVersion: '0.1.0',
        toVersion: '0.2.0',
        status: 'success',
        appliedAt: '2026-07-01T00:00:00.000Z',
        rollbackAvailableUntil: rollbackUntil,
      },
    ]);

    let plugins = await listMarketplaceAdminPlugins();
    let projected = plugins[0];

    expect(projected.rollback.eligible).toBe(true);
    expect(projected.rollback.reasonCode).toBe('compatible');
    expect(projected.actions.rollback.allowed).toBe(true);
    expect(projected.lifecycleState.summaryState).toBe('rollback-available');

    determinePluginRollbackCompatibility.mockResolvedValue({
      rollbackCompatible: false,
      reason: 'irreversible-migrations-present',
    });

    plugins = await listMarketplaceAdminPlugins();
    projected = plugins[0];

    expect(projected.rollback.eligible).toBe(false);
    expect(projected.rollback.reasonCode).toBe('irreversible-migrations-present');
    expect(projected.actions.rollback.allowed).toBe(false);
    expect(projected.actions.rollback.reasonCode).toBe('irreversible-migrations-present');
  });

  it('projects recovery-required and trust/source blocks with actionable remediation signals', async () => {
    resolveCanonicalPluginSourceStatus.mockReturnValue({
      plugins: [
        {
          pluginId: 'url-shortener',
          configuredSourceKind: 'bundled-fallback-artifact',
          resolvedSourceKind: null,
          localOverrideEnabled: false,
          localOverrideFilesystemPath: null,
          resolverFailureCodes: ['canonical-source-missing'],
        },
      ],
      diagnostics: {
        errors: [{ code: 'canonical-source-missing' }],
      },
    });
    evaluateMarketplacePublisherTrustPolicy.mockReturnValue({
      outcome: 'deny',
      reasonCode: 'publisher-revoked',
    });
    readInterruptedPluginMigrationCheckpoint.mockResolvedValue({
      migrationId: 'url-shortener:20260701010000',
      direction: 'up',
    });
    reconcilePluginLifecycleState.mockResolvedValue({
      action: 'require-recovery',
      reason: 'Interrupted migration checkpoint requires explicit reconciliation.',
      operationId: 'op-1',
    });

    const plugins = await listMarketplaceAdminPlugins();
    const projected = plugins[0];

    expect(projected.trustPolicy.outcome).toBe('deny');
    expect(projected.trustPolicy.reasonCode).toBe('publisher-revoked');
    expect(projected.lifecycleState.axes.trust).toBe('blocked');
    expect(projected.lifecycleState.axes.resolution).toBe('failed');
    expect(projected.operation.recoveryRequired).toBe(true);
    expect(projected.reconciliation.action).toBe('require-recovery');
    expect(projected.reconciliation.recoveryClassification).toBe('recovery-required');
    expect(projected.actions.install.allowed).toBe(false);
    expect(projected.actions.install.reasonCode).toBe('recovery-required');
    expect(projected.sourceResolution.resolverFailureCodes).toContain('canonical-source-missing');
  });
});
