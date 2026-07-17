import { listPluginStates } from '@/db/plugins';
import { getPluginUpdateHistory } from '@core/db/plugin-versioning';
import { resolveCanonicalPluginSourceStatus } from '@core/lib/plugin-development-source-resolution.server';
import { readMarketplaceInstallOperationState } from '@core/lib/plugin-marketplace-install-operation.server';
import { verifyMarketplaceArtifactSignature } from '@core/lib/plugin-marketplace-signing.server';
import { evaluateMarketplacePublisherTrustPolicy } from '@core/lib/plugin-marketplace-publisher-trust.server';
import { loadTrustedMarketplaceKeysFromEnv } from '@core/lib/plugin-marketplace-trusted-keys.server';
import { deriveCanonicalMarketplaceLifecycleView } from '@core/lib/plugin-lifecycle-state-view.server';
import { readLatestPluginLifecycleOperation } from '@core/lib/plugin-lifecycle-orchestrator.server';
import { readLatestPluginLifecycleTransitionEventRecord } from '@core/db/plugin-lifecycle';
import {
  determinePluginRollbackCompatibility,
  readCompletedPluginMigrationCheckpoints,
  readInterruptedPluginMigrationCheckpoint,
} from '@core/db/plugin-migration-checkpoints';
import { reconcilePluginLifecycleState } from '@core/lib/plugin-lifecycle-reconciler.server';
import {
  derivePluginLifecycleActionAuthority,
  type PluginLifecycleActionAuthority,
} from '@core/lib/plugin-lifecycle-action-authority.server';
import type {
  CanonicalEnvironment,
  CanonicalSourceDescriptor,
  CanonicalPluginStateAxes,
  CanonicalPluginSummaryState,
} from '@core/types/plugin-canonical-contracts';
import type {
  MarketplaceArtifactReference,
  MarketplaceArtifactTrustVerification,
  MarketplaceCatalogEntry,
  MarketplacePackageLifecycleSummary,
  MarketplacePackageMigrationPolicySummary,
  MarketplacePackagePermissionSummary,
} from '@core/types/plugin-marketplace-contract';
import type { PluginAdminRecord } from '@core/types/plugins';
import { bundledPlugins } from '@user/extensions/plugins/registry';
import * as path from 'node:path';

const FIRST_PARTY_INSTALL_ROOT = path.resolve(
  process.cwd(),
  'generated/plugins/marketplace-first-party'
);

const FIRST_PARTY_REPO_URL = 'https://github.com/chrishacia/devholm-plugins';
const FIRST_PARTY_PUBLISHER_ID = 'devholm-first-party';

function isRuntimeInstallEnabled(): boolean {
  return process.env.DEVHOLM_MARKETPLACE_FIRST_PARTY_INSTALL_ENABLED === 'true';
}

function toArtifact(): MarketplaceArtifactReference {
  if (!isRuntimeInstallEnabled()) {
    return {
      format: 'tar.gz',
      readiness: 'planned',
      immutable: false,
      signature: { status: 'not-provided' },
    };
  }

  return {
    format: 'tar.gz',
    readiness: 'planned',
    immutable: false,
    signature: { status: 'not-provided' },
  };
}

function toPermissionSummary(pluginId: string): MarketplacePackagePermissionSummary {
  const plugin = bundledPlugins.find((entry) => entry.manifest.id === pluginId);
  const permissions = plugin?.manifest.permissions ?? [];
  return {
    permissionKeys: permissions.map((entry) => entry.key),
    capabilities: permissions.map((entry) => entry.capability),
    scopes: permissions.map((entry) => entry.scope),
  };
}

function toLifecycleSummary(pluginId: string): MarketplacePackageLifecycleSummary {
  const plugin = bundledPlugins.find((entry) => entry.manifest.id === pluginId);
  const lifecycle = plugin?.manifest.lifecycle;
  const policy = plugin?.manifest.lifecyclePolicy;

  return {
    hasAfterInstall: Boolean(lifecycle?.afterInstall),
    hasAfterUpgrade: Boolean(lifecycle?.afterUpgrade),
    hasBeforeDisable: Boolean(lifecycle?.beforeDisable),
    hasBeforeUninstall: Boolean(lifecycle?.beforeUninstall),
    hasPurge: Boolean(lifecycle?.purge),
    disablePolicy: policy?.disablePolicy,
    uninstallPolicy: policy?.uninstallPolicy,
    dataRetention: policy?.dataRetention,
  };
}

function toMigrationSummary(pluginId: string): MarketplacePackageMigrationPolicySummary {
  const plugin = bundledPlugins.find((entry) => entry.manifest.id === pluginId);
  const migrations = plugin?.manifest.migrations ?? [];
  const purgePolicy = plugin?.manifest.lifecyclePolicy?.purge;

  return {
    migrationCount: migrations.length,
    policy: migrations.length > 0 ? 'declared' : 'none',
    destructiveDataWipe: purgePolicy?.destructiveDataWipe ?? 'unknown',
  };
}

function toCatalogEntry(plugin: PluginAdminRecord): MarketplaceCatalogEntry {
  const bundled = bundledPlugins.find((entry) => entry.manifest.id === plugin.id);
  const manifestVersion = bundled?.manifest.version ?? plugin.bundledVersion ?? '0.1.0';

  return {
    pluginId: plugin.id,
    displayName: plugin.name,
    version: manifestVersion,
    installReadiness: isRuntimeInstallEnabled() ? 'catalog-contract-ready' : 'scaffold-only',
    runtimeInstallSupported: false,
    bundledFallbackRequired: true,
    pluginSubdirectory: `plugins/${plugin.id}`,
    manifestPath: `plugins/${plugin.id}/manifest.json`,
    readmePath: `plugins/${plugin.id}/README.md`,
    landingPagePath: `plugins/${plugin.id}/index.html`,
    source: {
      sourceType: 'marketplace',
      repositoryUrl: FIRST_PARTY_REPO_URL,
      ref: `v${manifestVersion}`,
    },
    publisher: {
      publisherId: FIRST_PARTY_PUBLISHER_ID,
      classification: 'first-party',
    },
    artifact: toArtifact(),
  };
}

function evaluateSignatureAndTrust(catalogEntry: MarketplaceCatalogEntry): {
  signature: MarketplaceArtifactTrustVerification;
  trustPolicy: ReturnType<typeof evaluateMarketplacePublisherTrustPolicy> | null;
} {
  const signature = verifyMarketplaceArtifactSignature({
    catalogEntry,
    signature: catalogEntry.artifact.signature,
    trustedKeys: loadTrustedMarketplaceKeysFromEnv(),
  });

  if (!signature.keyId) {
    return {
      signature,
      trustPolicy: null,
    };
  }

  const trustPolicy = evaluateMarketplacePublisherTrustPolicy({
    publisherId: catalogEntry.publisher.publisherId,
    publisherClass: catalogEntry.publisher.classification,
    signingKeyId: signature.keyId,
    pluginId: catalogEntry.pluginId,
    operation: 'install',
    policyDocument: null,
  });

  return { signature, trustPolicy };
}

async function readOperation(pluginId: string) {
  try {
    return await readMarketplaceInstallOperationState(FIRST_PARTY_INSTALL_ROOT, pluginId);
  } catch {
    return null;
  }
}

function mapRecoveryClassification(
  action: string
): 'none' | 'retryable' | 'recovery-required' | 'manual-intervention-required' {
  if (action === 'manual-intervention-required') {
    return 'manual-intervention-required';
  }

  if (action === 'take-over-expired-lease' || action === 'resume-safe-retry') {
    return 'retryable';
  }

  if (action === 'require-recovery' || action === 'schedule-rollback') {
    return 'recovery-required';
  }

  return 'none';
}

function mapSafeOperatorMessage(action: string): string {
  switch (action) {
    case 'resume-safe-retry':
      return 'A lifecycle operation is actively running and should be allowed to finish.';
    case 'take-over-expired-lease':
      return 'The previous lifecycle lease expired; takeover can be executed safely.';
    case 'finalize-proven-success':
      return 'An expired operation has durable success evidence and can be finalized.';
    case 'schedule-rollback':
      return 'Rollback should be scheduled before additional lifecycle mutations.';
    case 'require-recovery':
      return 'Recovery is required before further lifecycle changes can proceed.';
    case 'manual-intervention-required':
      return 'Manual intervention is required before lifecycle operations can continue.';
    default:
      return 'Lifecycle state is healthy for standard orchestrated operations.';
  }
}

function mapRemediation(action: string): string {
  switch (action) {
    case 'resume-safe-retry':
      return 'Monitor operation progress and wait for durable completion.';
    case 'take-over-expired-lease':
      return 'Use the takeover action to reconcile the expired operation lease.';
    case 'finalize-proven-success':
      return 'Finalize the operation and refresh operator state projections.';
    case 'schedule-rollback':
      return 'Run rollback through canonical orchestrator APIs and verify migration compatibility.';
    case 'require-recovery':
      return 'Open recovery flow and reconcile interrupted or ambiguous lifecycle phases.';
    case 'manual-intervention-required':
      return 'Follow manual intervention runbook and acknowledge completion.';
    default:
      return 'Proceed with canonical server-provided lifecycle actions.';
  }
}

export interface MarketplaceAdminPluginView {
  plugin: PluginAdminRecord;
  catalogEntry: MarketplaceCatalogEntry;
  capabilities: MarketplacePackagePermissionSummary;
  lifecycle: MarketplacePackageLifecycleSummary;
  migration: MarketplacePackageMigrationPolicySummary;
  signature: {
    decision: MarketplaceArtifactTrustVerification['trustDecision'];
    status: MarketplaceArtifactTrustVerification['verificationStatus'];
    keyId: string | null;
    notes: readonly string[];
  };
  trustPolicy: {
    outcome: 'allow' | 'deny' | 'unknown';
    reasonCode: string;
  };
  operation: {
    hasActive: boolean;
    status: string | null;
    stage: string | null;
    operationId: string | null;
    updatedAt: string | null;
    leaseOwner: string | null;
    leaseExpiresAt: string | null;
    leaseExpired: boolean;
    recoveryRequired: boolean;
  };
  desiredLifecycleState: string;
  observedLifecycleState: string;
  reconciliation: {
    action: string;
    recoveryClassification:
      | 'none'
      | 'retryable'
      | 'recovery-required'
      | 'manual-intervention-required';
    message: string;
    remediation: string;
  };
  rollback: {
    eligible: boolean;
    reasonCode: string;
  };
  latestTransition: {
    eventId: string | null;
    transition: string | null;
    result: 'succeeded' | 'failed' | null;
    timestamp: string | null;
    errorCode: string | null;
  };
  migrationCheckpoint: {
    interrupted: boolean;
    interruptedMigrationId: string | null;
    interruptedDirection: 'up' | 'down' | null;
    completedCount: number;
    latestCompletedMigrationId: string | null;
  };
  sourceResolution: {
    configuredSourceKind: CanonicalSourceDescriptor['sourceKind'];
    resolvedSourceKind: CanonicalSourceDescriptor['sourceKind'] | null;
    localOverrideEnabled: boolean;
    localOverrideFilesystemPath: string | null;
    resolverFailureCodes: readonly string[];
    diagnostics: {
      hasErrors: boolean;
      errorCount: number;
    };
  };
  history: Array<{
    fromVersion: string;
    toVersion: string;
    status: 'success' | 'failed' | 'rolled_back';
    appliedAt: string;
    rollbackAvailableUntil?: string;
  }>;
  lifecycleState: {
    axes: CanonicalPluginStateAxes;
    summaryState: CanonicalPluginSummaryState;
    validationErrors: readonly string[];
  };
  actionAuthority: PluginLifecycleActionAuthority;
  actions: {
    install: { allowed: boolean; reasonCode: string | null; remediation: string };
    update: { allowed: boolean; reasonCode: string | null; remediation: string };
    rollback: { allowed: boolean; reasonCode: string | null; remediation: string };
    enable: { allowed: boolean; reasonCode: string | null; remediation: string };
    disable: { allowed: boolean; reasonCode: string | null; remediation: string };
  };
}

function resolveMarketplaceEnvironment(): CanonicalEnvironment {
  if (process.env.NODE_ENV === 'production') {
    return 'production';
  }

  if (process.env.CI === 'true') {
    return 'ci';
  }

  return 'development';
}

export async function listMarketplaceAdminPlugins(): Promise<MarketplaceAdminPluginView[]> {
  const pluginStates = await listPluginStates();
  const sourceEnvironment = resolveMarketplaceEnvironment();
  const sourceResolution = resolveCanonicalPluginSourceStatus({
    environment: sourceEnvironment,
    rootDir: process.cwd(),
    overrideRaw: process.env.DEVHOLM_PLUGIN_LOCAL_OVERRIDES,
  });
  const sourceStatusByPluginId = new Map(
    sourceResolution.plugins.map((entry) => [entry.pluginId, entry])
  );
  const sourceDiagnostics = {
    hasErrors: sourceResolution.diagnostics.errors.length > 0,
    errorCount: sourceResolution.diagnostics.errors.length,
  };

  return Promise.all(
    pluginStates.map(async (plugin) => {
      const catalogEntry = toCatalogEntry(plugin);
      const capabilities = toPermissionSummary(plugin.id);
      const lifecycle = toLifecycleSummary(plugin.id);
      const migration = toMigrationSummary(plugin.id);
      const { signature, trustPolicy } = evaluateSignatureAndTrust(catalogEntry);
      const operation = await readOperation(plugin.id);
      const lifecycleOperation = await readLatestPluginLifecycleOperation(plugin.id);
      const latestTransition = await readLatestPluginLifecycleTransitionEventRecord(plugin.id);
      const interruptedCheckpoint = await readInterruptedPluginMigrationCheckpoint(plugin.id);
      const completedCheckpoints = await readCompletedPluginMigrationCheckpoints(plugin.id);
      const rollbackCompatibility = await determinePluginRollbackCompatibility(plugin.id);
      const reconciliation = await reconcilePluginLifecycleState(plugin.id);
      const history = await getPluginUpdateHistory(plugin.id);
      const hasActiveOperation =
        operation?.status === 'in_progress' || lifecycleOperation?.status === 'running';
      const leaseExpiresAt = lifecycleOperation?.leaseExpiresAt ?? null;
      const leaseExpired =
        Boolean(leaseExpiresAt) &&
        Number.isFinite(Date.parse(String(leaseExpiresAt))) &&
        Date.parse(String(leaseExpiresAt)) <= Date.now();
      const nowMs = Date.now();
      const hasRollbackCandidate = history.some((item) => {
        if (!item.rollbackAvailableUntil) {
          return false;
        }
        const until = Date.parse(item.rollbackAvailableUntil);
        return Number.isFinite(until) && until > nowMs && item.status === 'success';
      });
      const sourceStatus = sourceStatusByPluginId.get(plugin.id);
      const lifecycleState = deriveCanonicalMarketplaceLifecycleView({
        installed: plugin.installed,
        enabled: plugin.isEnabled,
        operation: {
          hasActive: Boolean(hasActiveOperation),
          status: operation?.status ?? null,
          stage: operation?.stage ?? null,
          recoveryRequired: operation?.status === 'failed' || operation?.status === 'interrupted',
        },
        signature: {
          decision: signature.trustDecision,
          status: signature.verificationStatus,
        },
        trustPolicy: trustPolicy
          ? {
              outcome: trustPolicy.outcome,
              reasonCode: trustPolicy.reasonCode,
            }
          : {
              outcome: 'unknown',
              reasonCode: 'signature-missing-or-key-unknown',
            },
        sourceResolutionHasErrors: sourceDiagnostics.hasErrors,
        history,
        nowMs,
      });

      const rollbackEligible =
        hasRollbackCandidate &&
        rollbackCompatibility.rollbackCompatible &&
        interruptedCheckpoint === null &&
        reconciliation.action !== 'require-recovery' &&
        reconciliation.action !== 'manual-intervention-required';

      const rollbackReasonCode = !hasRollbackCandidate
        ? 'no-eligible-rollback-candidate'
        : !rollbackCompatibility.rollbackCompatible
          ? rollbackCompatibility.reason
          : interruptedCheckpoint
            ? 'interrupted-migration-present'
            : reconciliation.action === 'require-recovery' ||
                reconciliation.action === 'manual-intervention-required'
              ? 'recovery-required'
              : 'compatible';

      const actionAuthority = derivePluginLifecycleActionAuthority({
        installed: plugin.installed,
        enabled: plugin.isEnabled,
        hasActiveOperation: Boolean(hasActiveOperation),
        leaseExpired,
        trustAllowed: signature.trustDecision === 'trusted' && trustPolicy?.outcome === 'allow',
        runtimeInstallSupported: catalogEntry.runtimeInstallSupported,
        sourceResolutionHasErrors: sourceDiagnostics.hasErrors,
        rollbackEligible,
        rollbackReason: rollbackReasonCode,
        reconciliationAction: reconciliation.action,
        canonical: {
          axes: lifecycleState.axes,
          summaryState: lifecycleState.summaryState,
        },
        canMutate: true,
      });

      const mappedActions = {
        install: {
          allowed: actionAuthority.byId.install.enabled,
          reasonCode: actionAuthority.byId.install.reasonCode,
          remediation: actionAuthority.byId.install.safeExplanation,
        },
        update: {
          allowed: actionAuthority.byId.update.enabled,
          reasonCode: actionAuthority.byId.update.reasonCode,
          remediation: actionAuthority.byId.update.safeExplanation,
        },
        rollback: {
          allowed: actionAuthority.byId.rollback.enabled,
          reasonCode: actionAuthority.byId.rollback.reasonCode,
          remediation: actionAuthority.byId.rollback.safeExplanation,
        },
        enable: {
          allowed: actionAuthority.byId.enable.enabled,
          reasonCode: actionAuthority.byId.enable.reasonCode,
          remediation: actionAuthority.byId.enable.safeExplanation,
        },
        disable: {
          allowed: actionAuthority.byId.disable.enabled,
          reasonCode: actionAuthority.byId.disable.reasonCode,
          remediation: actionAuthority.byId.disable.safeExplanation,
        },
      };

      return {
        plugin,
        catalogEntry,
        capabilities,
        lifecycle,
        migration,
        signature: {
          decision: signature.trustDecision,
          status: signature.verificationStatus,
          keyId: signature.keyId,
          notes: signature.notes,
        },
        trustPolicy: trustPolicy
          ? {
              outcome: trustPolicy.outcome,
              reasonCode: trustPolicy.reasonCode,
            }
          : {
              outcome: 'unknown',
              reasonCode: 'signature-missing-or-key-unknown',
            },
        operation: {
          hasActive: Boolean(hasActiveOperation),
          status:
            operation?.status ??
            (lifecycleOperation?.status === 'running'
              ? 'in_progress'
              : lifecycleOperation?.status === 'failed'
                ? 'failed'
                : lifecycleOperation?.status === 'succeeded'
                  ? 'succeeded'
                  : null),
          stage:
            operation?.stage ??
            (lifecycleOperation?.currentPhase === 'executing'
              ? 'executing'
              : lifecycleOperation?.currentPhase === 'completed'
                ? 'complete'
                : null),
          operationId: operation?.operationId ?? null,
          updatedAt: operation?.updatedAt ?? lifecycleOperation?.updatedAt ?? null,
          leaseOwner: lifecycleOperation?.leaseOwner ?? null,
          leaseExpiresAt,
          leaseExpired,
          recoveryRequired:
            operation?.status === 'failed' ||
            operation?.status === 'interrupted' ||
            lifecycleOperation?.status === 'failed' ||
            interruptedCheckpoint !== null ||
            reconciliation.action === 'require-recovery' ||
            reconciliation.action === 'manual-intervention-required',
        },
        desiredLifecycleState: lifecycleState.axes.desired,
        observedLifecycleState: lifecycleState.summaryState,
        reconciliation: {
          action: reconciliation.action,
          recoveryClassification: mapRecoveryClassification(reconciliation.action),
          message: mapSafeOperatorMessage(reconciliation.action),
          remediation: mapRemediation(reconciliation.action),
        },
        rollback: {
          eligible: rollbackEligible,
          reasonCode: rollbackReasonCode,
        },
        latestTransition: {
          eventId: latestTransition?.eventId ?? null,
          transition: latestTransition?.transition ?? null,
          result: latestTransition?.result ?? null,
          timestamp: latestTransition?.timestamp ?? null,
          errorCode: latestTransition?.error?.code ?? null,
        },
        migrationCheckpoint: {
          interrupted: interruptedCheckpoint !== null,
          interruptedMigrationId: interruptedCheckpoint?.migrationId ?? null,
          interruptedDirection: interruptedCheckpoint?.direction ?? null,
          completedCount: completedCheckpoints.length,
          latestCompletedMigrationId:
            completedCheckpoints.length > 0
              ? completedCheckpoints[completedCheckpoints.length - 1]?.migrationId ?? null
              : null,
        },
        sourceResolution: {
          configuredSourceKind: sourceStatus?.configuredSourceKind ?? 'bundled-fallback-artifact',
          resolvedSourceKind: sourceStatus?.resolvedSourceKind ?? null,
          localOverrideEnabled: sourceStatus?.localOverrideEnabled ?? false,
          localOverrideFilesystemPath:
            sourceStatus?.localOverrideEnabled && sourceStatus?.localOverrideFilesystemPath
              ? '[redacted-local-override-path]'
              : null,
          resolverFailureCodes: sourceStatus?.resolverFailureCodes ?? [],
          diagnostics: sourceDiagnostics,
        },
        history: history.map((item) => ({
          fromVersion: item.fromVersion,
          toVersion: item.toVersion,
          status: item.status,
          appliedAt: item.appliedAt,
          rollbackAvailableUntil: item.rollbackAvailableUntil,
        })),
        lifecycleState,
        actionAuthority,
        actions: mappedActions,
      };
    })
  );
}

export async function getMarketplaceAdminPlugin(
  pluginId: string
): Promise<MarketplaceAdminPluginView | null> {
  const all = await listMarketplaceAdminPlugins();
  return all.find((entry) => entry.plugin.id === pluginId) ?? null;
}
