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
  resolveCanonicalPlugins,
  verifyDeterministicCanonicalRegistry,
} from '@core/lib/plugin-canonical-resolver.server';

function entry(
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
    enabledByDefault: true,
    bundledDefault: false,
    compatibility: {
      devholmVersion: '^3.0.0',
    },
    updatePolicy: {
      mode: 'manual',
      channel: 'stable',
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
      sourceKind: 'marketplace-artifact',
      immutableRef: `sha256:${pluginId}:abc123`,
      immutableRefType: 'content-addressed',
      artifactUrlOrLocator: `https://example.invalid/${pluginId}.tar.gz`,
      sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      publisher: {
        publisherId: 'devholm-first-party',
      },
      compatibility: {
        devholmVersion: '^3.0.0',
      },
      packageFormat: 'tar.gz',
      version: '1.2.3',
      manifestId: pluginId,
      mutableRef: false,
    },
    ...overrides,
  };
}

function doc(plugins: CanonicalPluginConfigEntry[]): CanonicalPluginContractsDocument {
  return {
    schemaVersion: CANONICAL_PLUGIN_SCHEMA_VERSION,
    plugins,
  };
}

describe('plugin canonical resolver', () => {
  it('resolves deterministically for identical inputs', () => {
    const input = {
      environment: 'ci' as const,
      document: doc([entry('calendar'), entry('gallery')]),
      nowIso: '2026-07-14T00:00:00.000Z',
    };

    const first = resolveCanonicalPlugins(input);
    const second = resolveCanonicalPlugins(input);

    expect(first.failures).toEqual([]);
    expect(second.failures).toEqual([]);
    expect(first.resolved).toEqual(second.resolved);
  });

  it('rejects local filesystem override in production-like environment', () => {
    const localOverride = entry('calendar', {
      source: {
        sourceKind: 'local-development-checkout',
        filesystemPath: '/tmp/dev-plugin/calendar',
        expectedPluginId: 'calendar',
        expectedVersion: '1.2.3',
        developmentOnly: true,
        productionEligible: false,
      },
    });

    const result = resolveCanonicalPlugins({
      environment: 'production',
      document: doc([localOverride]),
    });

    expect(result.failures.some((failure) => failure.code === 'local-override-forbidden')).toBe(
      true
    );
  });

  it('rejects mutable production references', () => {
    const mutable = entry('calendar', {
      source: {
        sourceKind: 'marketplace-artifact',
        immutableRef: 'refs/heads/main',
        immutableRefType: 'release-url',
        artifactUrlOrLocator: 'https://example.invalid/calendar.tar.gz',
        sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        publisher: {
          publisherId: 'devholm-first-party',
        },
        compatibility: {
          devholmVersion: '^3.0.0',
        },
        packageFormat: 'tar.gz',
        version: '1.2.3',
        manifestId: 'calendar',
        mutableRef: false,
      },
    });

    const result = resolveCanonicalPlugins({
      environment: 'production',
      document: doc([mutable]),
    });

    expect(result.failures.some((failure) => failure.code === 'mutable-production-reference')).toBe(
      true
    );
  });

  it('rejects missing digest for production-like resolution', () => {
    const missingDigest = entry('calendar', {
      source: {
        sourceKind: 'marketplace-artifact',
        immutableRef: 'sha256:calendar:abc123',
        immutableRefType: 'content-addressed',
        artifactUrlOrLocator: 'https://example.invalid/calendar.tar.gz',
        sha256: '',
        publisher: {
          publisherId: 'devholm-first-party',
        },
        compatibility: {
          devholmVersion: '^3.0.0',
        },
        packageFormat: 'tar.gz',
        version: '1.2.3',
        manifestId: 'calendar',
        mutableRef: false,
      } as never,
    });

    const result = resolveCanonicalPlugins({
      environment: 'production',
      document: doc([missingDigest]),
    });

    expect(result.failures.some((failure) => failure.code === 'digest-missing')).toBe(true);
  });

  it('rejects publisher mismatch between config and source', () => {
    const mismatch = entry('calendar', {
      publisher: {
        publisherId: 'devholm-first-party',
      },
      source: {
        sourceKind: 'marketplace-artifact',
        immutableRef: 'sha256:calendar:abc123',
        immutableRefType: 'content-addressed',
        artifactUrlOrLocator: 'https://example.invalid/calendar.tar.gz',
        sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        publisher: {
          publisherId: 'other-publisher',
        },
        compatibility: {
          devholmVersion: '^3.0.0',
        },
        packageFormat: 'tar.gz',
        version: '1.2.3',
        manifestId: 'calendar',
        mutableRef: false,
      },
    });

    const result = resolveCanonicalPlugins({
      environment: 'ci',
      document: doc([mismatch]),
    });

    expect(result.failures.some((failure) => failure.code === 'publisher-untrusted')).toBe(true);
  });

  it('builds identical registry content regardless of input order', () => {
    const first = buildDeterministicCanonicalRegistry({
      environment: 'ci',
      document: createCanonicalDocumentFromEntries([entry('gallery'), entry('calendar')]),
    });

    const second = buildDeterministicCanonicalRegistry({
      environment: 'ci',
      document: createCanonicalDocumentFromEntries([entry('calendar'), entry('gallery')]),
    });

    expect(first.failures).toEqual([]);
    expect(second.failures).toEqual([]);
    expect(first.registry?.contentDigestSha256).toEqual(second.registry?.contentDigestSha256);
    expect(first.registry?.content).toEqual(second.registry?.content);
  });

  it('detects deterministic registry tampering', () => {
    const built = buildDeterministicCanonicalRegistry({
      environment: 'ci',
      document: createCanonicalDocumentFromEntries([entry('calendar')]),
    });

    expect(built.failures).toEqual([]);
    expect(built.registry).not.toBeNull();

    const tampered = {
      ...built.registry!,
      content: {
        ...built.registry!.content,
        plugins: built.registry!.content.plugins.map((plugin) =>
          plugin.pluginId === 'calendar' ? { ...plugin, selectedVersion: '9.9.9' } : plugin
        ),
      },
    };

    const verification = verifyDeterministicCanonicalRegistry(tampered);
    expect(verification.ok).toBe(false);
    expect(verification.errorCode).toBe('registry-tampering');
  });

  it('rejects unsupported source type from untrusted external input', () => {
    const invalid = entry('calendar', {
      source: {
        sourceKind: 'git-tag',
      } as never,
    });

    const result = resolveCanonicalPlugins({
      environment: 'ci',
      document: doc([invalid]),
    });

    expect(result.failures.some((failure) => failure.code === 'unsupported-source-type')).toBe(
      true
    );
  });

  it('enforces url-shortener canonical resolver failures for digest, version, and production override policy', () => {
    const digestMissing = resolveCanonicalPlugins({
      environment: 'production',
      document: doc([
        entry('url-shortener', {
          source: {
            sourceKind: 'marketplace-artifact',
            immutableRef: 'sha256:url-shortener:abc123',
            immutableRefType: 'content-addressed',
            artifactUrlOrLocator: 'https://example.invalid/url-shortener.tar.gz',
            sha256: '',
            publisher: {
              publisherId: 'devholm-first-party',
            },
            compatibility: {
              devholmVersion: '^3.0.0',
            },
            packageFormat: 'tar.gz',
            version: '1.2.3',
            manifestId: 'url-shortener',
            mutableRef: false,
          } as never,
        }),
      ]),
    });

    expect(digestMissing.failures.some((failure) => failure.code === 'digest-missing')).toBe(true);

    const exactVersionMismatch = resolveCanonicalPlugins({
      environment: 'ci',
      document: doc([
        entry('url-shortener', {
          desiredVersion: '1.2.4',
          source: {
            sourceKind: 'marketplace-artifact',
            immutableRef: 'sha256:url-shortener:abc123',
            immutableRefType: 'content-addressed',
            artifactUrlOrLocator: 'https://example.invalid/url-shortener.tar.gz',
            sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            publisher: {
              publisherId: 'devholm-first-party',
            },
            compatibility: {
              devholmVersion: '^3.0.0',
            },
            packageFormat: 'tar.gz',
            version: '1.2.3',
            manifestId: 'url-shortener',
            mutableRef: false,
          },
        }),
      ]),
    });

    expect(
      exactVersionMismatch.failures.some((failure) => failure.code === 'exact-version-unavailable')
    ).toBe(true);

    const localOverrideRejectedInProd = resolveCanonicalPlugins({
      environment: 'production',
      document: doc([
        entry('url-shortener', {
          source: {
            sourceKind: 'local-development-checkout',
            filesystemPath: '/tmp/url-shortener-dev',
            expectedPluginId: 'url-shortener',
            expectedVersion: '1.2.3',
            developmentOnly: true,
            productionEligible: false,
          },
        }),
      ]),
    });

    expect(
      localOverrideRejectedInProd.failures.some(
        (failure) => failure.code === 'local-override-forbidden'
      )
    ).toBe(true);
  });
});
