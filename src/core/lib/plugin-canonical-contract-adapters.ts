import type { DevholmBundledPlugin } from '@core/types/plugins';
import {
  CANONICAL_DEPENDENCY_POLICY_VERSION,
  CANONICAL_PLUGIN_SCHEMA_VERSION,
  type CanonicalPluginContributionServer,
  type CanonicalPluginConfigEntry,
} from '@core/types/plugin-canonical-contracts';

type CanonicalLifecycleHook = NonNullable<
  CanonicalPluginContributionServer['lifecycleHooks']
>[number];

function collectLifecycleHooks(plugin: DevholmBundledPlugin): CanonicalLifecycleHook[] | undefined {
  const lifecycle = plugin.manifest.lifecycle;
  if (!lifecycle) {
    return undefined;
  }

  const hooks: CanonicalLifecycleHook[] = [];
  if (lifecycle.afterInstall) hooks.push('afterInstall');
  if (lifecycle.afterUpgrade) hooks.push('afterUpgrade');
  if (lifecycle.beforeDisable) hooks.push('beforeDisable');
  if (lifecycle.beforeUninstall) hooks.push('beforeUninstall');
  if (lifecycle.purge) hooks.push('purge');

  return hooks.length > 0 ? hooks : undefined;
}

export function toCanonicalPluginConfigEntry(
  plugin: DevholmBundledPlugin
): CanonicalPluginConfigEntry {
  const manifest = plugin.manifest;
  const hasAdminPages = Boolean(plugin.adminPageExtensions?.length);
  const hasPublicRoutes = Boolean(plugin.publicRouteExtensions?.length);

  return {
    schemaVersion: CANONICAL_PLUGIN_SCHEMA_VERSION,
    pluginId: manifest.id,
    desiredVersion: manifest.version,
    publisher: {
      publisherId: 'devholm-first-party',
      displayName: 'DevHolm',
      trustDomain: 'first-party',
    },
    sourcePolicy: {
      allowLocalOverrideInDevelopment: true,
      requireImmutableArtifactInProduction: true,
      requireDigestInProduction: true,
      requireSignatureInProduction: false,
      prohibitMutableRefsInProduction: true,
    },
    includedInBuild: true,
    enabledByDefault: false,
    bundledDefault: true,
    compatibility: {
      devholmVersion: manifest.devholmVersion ?? '*',
    },
    configRefs: (manifest.settings ?? []).map((setting) => ({
      key: setting.key,
      required: setting.defaultValue === undefined,
    })),
    updatePolicy: {
      mode: 'manual',
      channel: manifest.releaseChannel ?? 'stable',
      allowPrerelease: false,
    },
    rollbackPolicy: {
      allowRollback: true,
      requiresCheckpoint: true,
      requireOperatorApproval: true,
    },
    dependencyPolicy: {
      policyVersion: CANONICAL_DEPENDENCY_POLICY_VERSION,
      mode: 'self-contained',
      lockMetadataRequired: true,
      forbidLifecycleScriptsInProduction: true,
      licenseMetadataRequired: true,
      nativeDependencies: 'allowlisted',
    },
    source: {
      sourceKind: 'bundled-fallback-artifact',
      immutableRef: `bundled:${manifest.id}@${manifest.version}`,
      immutableRefType: 'immutable-tag',
      artifactUrlOrLocator: `bundled://${manifest.id}/${manifest.version}`,
      sha256: '0000000000000000000000000000000000000000000000000000000000000000',
      publisher: {
        publisherId: 'devholm-first-party',
      },
      compatibility: {
        devholmVersion: manifest.devholmVersion ?? '*',
      },
      packageFormat: 'tar.gz',
      version: manifest.version,
      manifestId: manifest.id,
      mutableRef: false,
    },
    frontend: {
      contributionMode: 'manifest-ui',
      adminPages: hasAdminPages
        ? plugin.adminPageExtensions?.map((extension) => extension.href)
        : undefined,
    },
    server: {
      publicRouteHandlers: hasPublicRoutes
        ? plugin.publicRouteExtensions?.map((extension) => ({ id: extension.id }))
        : undefined,
      lifecycleHooks: collectLifecycleHooks(plugin),
    },
    configDeclarations: (manifest.settings ?? []).map((setting) => ({
      key: setting.key,
      valueType: setting.type,
      required: setting.defaultValue === undefined,
      phase: 'runtime',
      visibility: 'secret',
      defaultValue: setting.defaultValue,
      redaction: 'full',
    })),
  };
}
