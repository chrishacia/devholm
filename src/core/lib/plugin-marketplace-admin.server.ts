import { listPluginStates } from '@/db/plugins';
import { getPluginUpdateHistory } from '@core/db/plugin-versioning';
import { resolveCanonicalPluginSourceStatus } from '@core/lib/plugin-development-source-resolution.server';
import { readMarketplaceInstallOperationState } from '@core/lib/plugin-marketplace-install-operation.server';
import { verifyMarketplaceArtifactSignature } from '@core/lib/plugin-marketplace-signing.server';
import { evaluateMarketplacePublisherTrustPolicy } from '@core/lib/plugin-marketplace-publisher-trust.server';
import { loadTrustedMarketplaceKeysFromEnv } from '@core/lib/plugin-marketplace-trusted-keys.server';
import type {
  CanonicalEnvironment,
  CanonicalSourceDescriptor,
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

function mapActionability(params: {
  plugin: PluginAdminRecord;
  catalogEntry: MarketplaceCatalogEntry;
  signature: MarketplaceArtifactTrustVerification;
  trustPolicy: ReturnType<typeof evaluateMarketplacePublisherTrustPolicy> | null;
  hasActiveOperation: boolean;
  hasRollbackCandidate: boolean;
}) {
  const { plugin, catalogEntry, signature, trustPolicy, hasActiveOperation, hasRollbackCandidate } =
    params;

  const blockedByRuntime = !catalogEntry.runtimeInstallSupported;
  const blockedBySignature = signature.trustDecision !== 'trusted';
  const blockedByTrust = Boolean(trustPolicy && trustPolicy.outcome !== 'allow');
  const blockedByOperation = hasActiveOperation;

  const installBlocked =
    blockedByRuntime ||
    blockedBySignature ||
    blockedByTrust ||
    blockedByOperation ||
    plugin.installed;

  const installReasonCode = blockedByOperation
    ? 'operation-in-progress'
    : blockedByRuntime
      ? 'runtime-install-unsupported'
      : blockedBySignature
        ? signature.verificationStatus
        : blockedByTrust
          ? trustPolicy?.reasonCode ?? 'publisher-policy-denied'
          : plugin.installed
            ? 'already-installed'
            : null;

  return {
    install: {
      allowed: !installBlocked,
      reasonCode: installReasonCode,
      remediation:
        installReasonCode === 'operation-in-progress'
          ? 'Wait for the active operation to complete, then retry.'
          : installReasonCode === 'runtime-install-unsupported'
            ? 'Runtime install for this plugin is not available in the current release line.'
            : installReasonCode === 'already-installed'
              ? 'Use update, enable, disable, or uninstall actions instead.'
              : 'Review signature and publisher trust requirements before retrying.',
    },
    update: {
      allowed: false,
      reasonCode: 'update-not-yet-supported',
      remediation: 'Update flow is not yet exposed for marketplace-admin runtime operations.',
    },
    rollback: {
      allowed: false,
      reasonCode: hasRollbackCandidate
        ? 'rollback-contract-not-yet-supported'
        : 'no-eligible-rollback-candidate',
      remediation: hasRollbackCandidate
        ? 'Rollback candidate exists in history, but marketplace rollback runtime contract is not yet exposed.'
        : 'No rollback candidate is currently eligible for this plugin.',
    },
    enable: {
      allowed: plugin.installed && !plugin.isEnabled && !hasActiveOperation,
      reasonCode:
        plugin.installed && !plugin.isEnabled && !hasActiveOperation
          ? null
          : hasActiveOperation
            ? 'operation-in-progress'
            : plugin.isEnabled
              ? 'already-enabled'
              : 'not-installed',
      remediation:
        plugin.installed && !plugin.isEnabled && !hasActiveOperation
          ? 'Enable can proceed.'
          : 'Install and complete active operations before enabling.',
    },
    disable: {
      allowed: plugin.installed && plugin.isEnabled && !hasActiveOperation,
      reasonCode:
        plugin.installed && plugin.isEnabled && !hasActiveOperation
          ? null
          : hasActiveOperation
            ? 'operation-in-progress'
            : !plugin.installed
              ? 'not-installed'
              : 'already-disabled',
      remediation:
        plugin.installed && plugin.isEnabled && !hasActiveOperation
          ? 'Disable can proceed.'
          : 'Only installed and enabled plugins can be disabled.',
    },
  };
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
    recoveryRequired: boolean;
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
  actions: ReturnType<typeof mapActionability>;
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
      const history = await getPluginUpdateHistory(plugin.id);
      const hasActiveOperation = operation?.status === 'in_progress';
      const nowMs = Date.now();
      const hasRollbackCandidate = history.some((item) => {
        if (!item.rollbackAvailableUntil) {
          return false;
        }
        const until = Date.parse(item.rollbackAvailableUntil);
        return Number.isFinite(until) && until > nowMs && item.status === 'success';
      });
      const sourceStatus = sourceStatusByPluginId.get(plugin.id);

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
          status: operation?.status ?? null,
          stage: operation?.stage ?? null,
          operationId: operation?.operationId ?? null,
          updatedAt: operation?.updatedAt ?? null,
          recoveryRequired: operation?.status === 'failed' || operation?.status === 'interrupted',
        },
        sourceResolution: {
          configuredSourceKind: sourceStatus?.configuredSourceKind ?? 'bundled-fallback-artifact',
          resolvedSourceKind: sourceStatus?.resolvedSourceKind ?? null,
          localOverrideEnabled: sourceStatus?.localOverrideEnabled ?? false,
          localOverrideFilesystemPath: sourceStatus?.localOverrideFilesystemPath ?? null,
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
        actions: mapActionability({
          plugin,
          catalogEntry,
          signature,
          trustPolicy,
          hasActiveOperation: Boolean(hasActiveOperation),
          hasRollbackCandidate,
        }),
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
