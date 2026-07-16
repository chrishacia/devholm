import { describe, expect, it } from 'vitest';
import {
  CANONICAL_DEPENDENCY_POLICY_VERSION,
  CANONICAL_PLUGIN_SCHEMA_VERSION,
  type CanonicalPluginConfigEntry,
  type CanonicalPluginContractsDocument,
} from '@core/types/plugin-canonical-contracts';
import {
  buildDeterministicCanonicalRegistry,
  createCanonicalDocumentFromEntries,
  sha256Hex,
} from '@core/lib/plugin-canonical-resolver.server';
import { createProductionBuildPreparationManifest } from '@core/lib/plugin-production-build-preparation.server';

function makeEntry(
  pluginId: string,
  overrides: Partial<CanonicalPluginConfigEntry> = {}
): CanonicalPluginConfigEntry {
  return {
    schemaVersion: CANONICAL_PLUGIN_SCHEMA_VERSION,
    pluginId,
    desiredVersion: '1.2.3',
    publisher: {
      publisherId: 'devholm-first-party',
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
    bundledDefault: false,
    compatibility: {
      devholmVersion: '^3.11.0',
    },
    updatePolicy: {
      mode: 'manual',
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
    frontend: {
      contributionMode: 'manifest-ui',
      adminPages: [`/admin/${pluginId}`],
      navigation: [{ href: `/admin/${pluginId}`, label: pluginId }],
      assets: [`/plugins/${pluginId}/asset.js`],
    },
    server: {
      apiExtensions: [{ path: `/api/${pluginId}/status`, methods: ['GET'] }],
      publicRouteHandlers: [{ id: `${pluginId}:public` }],
      lifecycleHooks: ['afterInstall'],
      migrations: [`db/migrations/${pluginId}.ts`],
      events: [`${pluginId}:event`],
      jobs: [`${pluginId}:job`],
      scheduledTasks: [`${pluginId}:task`],
    },
    source: {
      sourceKind: 'bundled-fallback-artifact',
      immutableRef: `bundled:${pluginId}@1.2.3`,
      immutableRefType: 'immutable-tag',
      artifactUrlOrLocator: `bundled://${pluginId}/1.2.3`,
      sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      publisher: {
        publisherId: 'devholm-first-party',
      },
      compatibility: {
        devholmVersion: '^3.11.0',
      },
      packageFormat: 'tar.gz',
      version: '1.2.3',
      manifestId: pluginId,
      mutableRef: false,
    },
    ...overrides,
  };
}

function makeDocument(entries: CanonicalPluginConfigEntry[]): CanonicalPluginContractsDocument {
  return createCanonicalDocumentFromEntries(entries);
}

describe('production build preparation manifest', () => {
  it('keeps included plugins and excludes unconfigured plugins', () => {
    const included = makeEntry('calendar');
    const excluded = makeEntry('gallery', { includedInBuild: false });
    const entries = [included, excluded];
    const registry = buildDeterministicCanonicalRegistry({
      environment: 'production',
      document: makeDocument(entries),
    });

    expect(registry.failures).toEqual([]);
    expect(registry.registry).not.toBeNull();

    const manifest = createProductionBuildPreparationManifest({
      environment: 'production',
      entries,
      registry: registry.registry!,
      registryVerification: {
        ok: true,
        expectedDigestSha256: registry.registry!.contentDigestSha256,
        actualDigestSha256: registry.registry!.contentDigestSha256,
      },
    });

    expect(manifest.includedPluginIds).toEqual(['calendar']);
    expect(manifest.excludedPluginIds).toEqual(['gallery']);
    expect(manifest.configurationDigestSha256).toBeTruthy();
    expect(manifest.registryDigestSha256).toBe(registry.registry!.contentDigestSha256);
    expect(manifest.buildInputSetDigestSha256).toBeTruthy();
    expect(manifest.contentDigestSha256).toBeTruthy();
    expect(manifest.plugins).toHaveLength(1);
    expect(manifest.plugins[0]?.pluginId).toBe('calendar');
    expect(manifest.plugins[0]?.version).toBe('1.2.3');
    expect(manifest.plugins[0]?.stateAxes.build).toBe('build-pending');
    expect(manifest.plugins[0]?.stateAxes.deployment).toBe('deploy-pending');
    expect(manifest.plugins[0]?.summaryState).toBe('disabled');
    expect(manifest.plugins[0]?.transitionalSourceProvenance.resolvedSourceKind).toBe(
      'bundled-fallback-artifact'
    );
    expect(
      manifest.plugins[0]?.configurationProjection.contributionSummary.frontendAdminPages
    ).toEqual(['/admin/calendar']);
    expect(
      manifest.plugins[0]?.configurationProjection.contributionSummary.frontendNavigation
    ).toEqual(['/admin/calendar']);
    expect(
      manifest.plugins[0]?.configurationProjection.contributionSummary.serverApiRoutes
    ).toEqual(['/api/calendar/status']);
    expect(manifest.plugins[0]?.configurationProjection.contributionSummary.lifecycleHooks).toEqual(
      ['afterInstall']
    );
    expect(manifest.plugins[0]?.resolverVerification.ok).toBe(true);
  });

  it('remains deterministic for identical inputs', () => {
    const entries = [makeEntry('calendar'), makeEntry('gallery')];
    const registry = buildDeterministicCanonicalRegistry({
      environment: 'production',
      document: makeDocument(entries),
    });

    expect(registry.failures).toEqual([]);
    expect(registry.registry).not.toBeNull();

    const first = createProductionBuildPreparationManifest({
      environment: 'production',
      entries,
      registry: registry.registry!,
      registryVerification: {
        ok: true,
        expectedDigestSha256: registry.registry!.contentDigestSha256,
        actualDigestSha256: registry.registry!.contentDigestSha256,
      },
    });
    const second = createProductionBuildPreparationManifest({
      environment: 'production',
      entries: [...entries],
      registry: registry.registry!,
      registryVerification: {
        ok: true,
        expectedDigestSha256: registry.registry!.contentDigestSha256,
        actualDigestSha256: registry.registry!.contentDigestSha256,
      },
    });

    expect(first).toEqual(second);
  });

  it('changes digest when build inclusion changes', () => {
    const entries = [makeEntry('calendar')];
    const registry = buildDeterministicCanonicalRegistry({
      environment: 'production',
      document: makeDocument(entries),
    });

    expect(registry.failures).toEqual([]);
    expect(registry.registry).not.toBeNull();

    const included = createProductionBuildPreparationManifest({
      environment: 'production',
      entries,
      registry: registry.registry!,
      registryVerification: {
        ok: true,
        expectedDigestSha256: registry.registry!.contentDigestSha256,
        actualDigestSha256: registry.registry!.contentDigestSha256,
      },
    });

    const excluded = createProductionBuildPreparationManifest({
      environment: 'production',
      entries: [makeEntry('calendar', { includedInBuild: false })],
      registry: registry.registry!,
      registryVerification: {
        ok: true,
        expectedDigestSha256: registry.registry!.contentDigestSha256,
        actualDigestSha256: registry.registry!.contentDigestSha256,
      },
    });

    expect(included.contentDigestSha256).not.toBe(excluded.contentDigestSha256);
    expect(excluded.includedPluginIds).toEqual([]);
  });

  it('uses the authoritative resolver-selected version in the manifest', () => {
    const entries = [makeEntry('calendar')];
    const registry = buildDeterministicCanonicalRegistry({
      environment: 'production',
      document: makeDocument(entries),
    });

    expect(registry.failures).toEqual([]);
    expect(registry.registry).not.toBeNull();

    const mutatedRegistry = {
      ...registry.registry!,
      content: {
        ...registry.registry!.content,
        plugins: registry.registry!.content.plugins.map((plugin) =>
          plugin.pluginId === 'calendar' ? { ...plugin, selectedVersion: '1.2.4' } : plugin
        ),
      },
    };
    const mutatedDigest = sha256Hex(mutatedRegistry.content);

    const manifest = createProductionBuildPreparationManifest({
      environment: 'production',
      entries,
      registry: {
        ...mutatedRegistry,
        contentDigestSha256: mutatedDigest,
      },
      registryVerification: {
        ok: true,
        expectedDigestSha256: mutatedDigest,
        actualDigestSha256: mutatedDigest,
      },
    });

    expect(manifest.plugins[0]?.version).toBe('1.2.4');
    expect(manifest.plugins[0]?.configurationProjection.desiredVersion).toBe('1.2.3');
  });

  it('rejects unverified registry input', () => {
    const entries = [makeEntry('calendar')];
    const registry = buildDeterministicCanonicalRegistry({
      environment: 'production',
      document: makeDocument(entries),
    });

    expect(registry.failures).toEqual([]);
    expect(registry.registry).not.toBeNull();

    expect(() =>
      createProductionBuildPreparationManifest({
        environment: 'production',
        entries,
        registry: registry.registry!,
        registryVerification: {
          ok: false,
          expectedDigestSha256: registry.registry!.contentDigestSha256,
          actualDigestSha256: `${registry.registry!.contentDigestSha256}-tampered`,
          errorCode: 'registry-tampering',
        },
      })
    ).toThrow(/requires a verified registry/);
  });

  it('rejects registry verification digests that do not match the registry snapshot', () => {
    const entries = [makeEntry('calendar')];
    const registry = buildDeterministicCanonicalRegistry({
      environment: 'production',
      document: makeDocument(entries),
    });

    expect(registry.failures).toEqual([]);
    expect(registry.registry).not.toBeNull();

    expect(() =>
      createProductionBuildPreparationManifest({
        environment: 'production',
        entries,
        registry: registry.registry!,
        registryVerification: {
          ok: true,
          expectedDigestSha256: 'expected-mismatch',
          actualDigestSha256: 'actual-mismatch',
        },
      })
    ).toThrow(/verification digest mismatch/);
  });

  it('rejects a registry snapshot whose stored digest does not match its content', () => {
    const entries = [makeEntry('calendar')];
    const registry = buildDeterministicCanonicalRegistry({
      environment: 'production',
      document: makeDocument(entries),
    });

    expect(registry.failures).toEqual([]);
    expect(registry.registry).not.toBeNull();

    expect(() =>
      createProductionBuildPreparationManifest({
        environment: 'production',
        entries,
        registry: {
          ...registry.registry!,
          contentDigestSha256: 'tampered-digest',
        },
        registryVerification: {
          ok: true,
          expectedDigestSha256: 'tampered-digest',
          actualDigestSha256: 'tampered-digest',
        },
      })
    ).toThrow(/registry snapshot digest mismatch/);
  });

  it('computes a content digest that can be recomputed from the manifest alone', () => {
    const entries = [makeEntry('calendar'), makeEntry('gallery')];
    const registry = buildDeterministicCanonicalRegistry({
      environment: 'production',
      document: makeDocument(entries),
    });

    expect(registry.failures).toEqual([]);
    expect(registry.registry).not.toBeNull();

    const manifest = createProductionBuildPreparationManifest({
      environment: 'production',
      entries,
      registry: registry.registry!,
      registryVerification: {
        ok: true,
        expectedDigestSha256: registry.registry!.contentDigestSha256,
        actualDigestSha256: registry.registry!.contentDigestSha256,
      },
    });

    const { contentDigestSha256, ...manifestWithoutDigest } = manifest;
    expect(contentDigestSha256).toBe(sha256Hex(manifestWithoutDigest));
  });
});
