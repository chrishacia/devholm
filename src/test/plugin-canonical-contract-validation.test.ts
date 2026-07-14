import { describe, expect, it } from 'vitest';
import {
  CANONICAL_DEPENDENCY_POLICY_VERSION,
  CANONICAL_PLUGIN_SCHEMA_VERSION,
  type CanonicalPluginConfigEntry,
  type CanonicalPluginContractsDocument,
  type CanonicalPluginStateAxes,
} from '@core/types/plugin-canonical-contracts';
import {
  summarizeCanonicalPluginState,
  validateCanonicalPluginContracts,
  validateCanonicalStateAxes,
} from '@core/lib/plugin-canonical-contract-validation';

function makeBasePlugin(
  overrides: Partial<CanonicalPluginConfigEntry> = {}
): CanonicalPluginConfigEntry {
  return {
    schemaVersion: CANONICAL_PLUGIN_SCHEMA_VERSION,
    pluginId: 'url-shortener',
    desiredVersion: '1.2.3',
    publisher: {
      publisherId: 'devholm-first-party',
      displayName: 'DevHolm',
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
    source: {
      sourceKind: 'marketplace-artifact',
      immutableRef: 'sha256:abc123',
      immutableRefType: 'content-addressed',
      artifactUrlOrLocator: 'https://example.test/plugins/url-shortener-1.2.3.tgz',
      sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      publisher: {
        publisherId: 'devholm-first-party',
      },
      compatibility: {
        devholmVersion: '^3.11.0',
      },
      packageFormat: 'tar.gz',
      version: '1.2.3',
      manifestId: 'url-shortener',
      mutableRef: false,
    },
    frontend: {
      contributionMode: 'manifest-ui',
      adminPages: ['/admin/url-shortener'],
    },
    configDeclarations: [
      {
        key: 'plugin:url-shortener:api-key',
        valueType: 'string',
        required: true,
        phase: 'runtime',
        visibility: 'secret',
        redaction: 'full',
      },
    ],
    ...overrides,
  };
}

function asDocument(plugins: CanonicalPluginConfigEntry[]): CanonicalPluginContractsDocument {
  return {
    schemaVersion: CANONICAL_PLUGIN_SCHEMA_VERSION,
    plugins,
  };
}

describe('plugin-canonical-contract-validation: canonical config', () => {
  it('accepts valid minimal config', () => {
    const errors = validateCanonicalPluginContracts(asDocument([makeBasePlugin()]), 'production');
    expect(errors).toEqual([]);
  });

  it('accepts valid bundled default config', () => {
    const errors = validateCanonicalPluginContracts(
      asDocument([
        makeBasePlugin({
          bundledDefault: true,
          includedInBuild: true,
        }),
      ]),
      'production'
    );
    expect(errors).toEqual([]);
  });

  it('rejects duplicate IDs', () => {
    const errors = validateCanonicalPluginContracts(
      asDocument([makeBasePlugin(), makeBasePlugin()]),
      'production'
    );
    expect(errors.some((error) => error.code === 'duplicate-plugin-id')).toBe(true);
  });

  it('rejects unsupported schema and invalid version/id', () => {
    const errors = validateCanonicalPluginContracts(
      asDocument([
        makeBasePlugin({
          schemaVersion: 99 as 1,
          pluginId: 'Invalid ID',
          desiredVersion: 'not-semver',
        }),
      ]),
      'production'
    );

    expect(errors.some((error) => error.code === 'unsupported-schema-version')).toBe(true);
    expect(errors.some((error) => error.code === 'invalid-plugin-id')).toBe(true);
    expect(errors.some((error) => error.code === 'invalid-version')).toBe(true);
  });

  it('rejects contradictory state intent', () => {
    const errors = validateCanonicalPluginContracts(
      asDocument([
        makeBasePlugin({
          bundledDefault: true,
          includedInBuild: false,
        }),
      ]),
      'production'
    );

    expect(errors.some((error) => error.code === 'bundled-default-without-build-inclusion')).toBe(
      true
    );
  });
});

describe('plugin-canonical-contract-validation: environment policy', () => {
  it('allows local override in development', () => {
    const errors = validateCanonicalPluginContracts(
      asDocument([
        makeBasePlugin({
          source: {
            sourceKind: 'local-development-checkout',
            filesystemPath: './plugins/url-shortener',
            expectedPluginId: 'url-shortener',
            developmentOnly: true,
            productionEligible: false,
          },
          localSourceOverride: {
            enabled: true,
            targetPluginId: 'url-shortener',
            source: {
              sourceKind: 'local-development-checkout',
              filesystemPath: './plugins/url-shortener',
              expectedPluginId: 'url-shortener',
              developmentOnly: true,
              productionEligible: false,
            },
          },
        }),
      ]),
      'development'
    );

    expect(errors).toEqual([]);
  });

  it('rejects local override in production and ID mismatch', () => {
    const errors = validateCanonicalPluginContracts(
      asDocument([
        makeBasePlugin({
          source: {
            sourceKind: 'local-development-checkout',
            filesystemPath: './plugins/url-shortener',
            expectedPluginId: 'url-shortener',
            developmentOnly: true,
            productionEligible: false,
          },
          localSourceOverride: {
            enabled: true,
            targetPluginId: 'calendar',
            source: {
              sourceKind: 'local-development-checkout',
              filesystemPath: './plugins/url-shortener',
              expectedPluginId: 'url-shortener',
              developmentOnly: true,
              productionEligible: false,
            },
          },
        }),
      ]),
      'production'
    );

    expect(errors.some((error) => error.code === 'local-override-not-allowed')).toBe(true);
    expect(errors.some((error) => error.code === 'local-override-id-mismatch')).toBe(true);
  });
});

describe('plugin-canonical-contract-validation: artifact and dependency policy', () => {
  it('rejects mutable production refs and missing digest', () => {
    const errors = validateCanonicalPluginContracts(
      asDocument([
        makeBasePlugin({
          sourcePolicy: {
            allowLocalOverrideInDevelopment: true,
            requireImmutableArtifactInProduction: false,
            requireDigestInProduction: true,
            requireSignatureInProduction: true,
            prohibitMutableRefsInProduction: false,
          },
          source: {
            sourceKind: 'marketplace-artifact',
            immutableRef: '',
            immutableRefType: 'release-url',
            artifactUrlOrLocator: '',
            sha256: 'not-sha256',
            publisher: {
              publisherId: 'devholm-first-party',
            },
            compatibility: {
              devholmVersion: '^3.11.0',
            },
            packageFormat: 'tar.gz',
            version: '1.2.3',
            manifestId: 'url-shortener',
          },
        }),
      ]),
      'production'
    );

    expect(errors.some((error) => error.code === 'mutable-production-ref')).toBe(true);
    expect(errors.some((error) => error.code === 'missing-digest')).toBe(true);
    expect(errors.some((error) => error.code === 'missing-signature')).toBe(true);
  });

  it('rejects unsupported dependency mode in production', () => {
    const errors = validateCanonicalPluginContracts(
      asDocument([
        makeBasePlugin({
          dependencyPolicy: {
            policyVersion: CANONICAL_DEPENDENCY_POLICY_VERSION,
            mode: 'unsupported-runtime-install',
            lockMetadataRequired: true,
            forbidLifecycleScriptsInProduction: false,
            licenseMetadataRequired: true,
            nativeDependencies: 'blocked',
          },
        }),
      ]),
      'production'
    );

    expect(errors.some((error) => error.code === 'unsupported-dependency-mode')).toBe(true);
    expect(errors.some((error) => error.code === 'lifecycle-scripts-allowed-production')).toBe(
      true
    );
  });
});

describe('plugin-canonical-contract-validation: contribution boundaries', () => {
  it('rejects unsupported frontend injection in CI and secret exposure', () => {
    const errors = validateCanonicalPluginContracts(
      asDocument([
        makeBasePlugin({
          frontend: {
            contributionMode: 'unsupported-framework-injection',
          },
          configDeclarations: [
            {
              key: 'plugin:url-shortener:secret',
              valueType: 'string',
              required: true,
              phase: 'runtime',
              visibility: 'public',
              redaction: 'full',
            },
          ],
        }),
      ]),
      'ci'
    );

    expect(errors.some((error) => error.code === 'unsupported-frontend-contribution')).toBe(true);
    expect(errors.some((error) => error.code === 'secret-config-exposed-public')).toBe(true);
  });
});

describe('plugin-canonical-contract-validation: state model', () => {
  it('accepts valid combinations and provides deterministic summary projection', () => {
    const axes: CanonicalPluginStateAxes = {
      desired: 'configured',
      resolution: 'verified',
      build: 'build-included',
      deployment: 'deployed',
      runtime: 'active',
      trust: 'verified',
      health: 'healthy',
      recovery: 'none',
    };

    expect(validateCanonicalStateAxes(axes)).toEqual([]);
    expect(summarizeCanonicalPluginState(axes)).toBe('active');
  });

  it('rejects impossible combinations', () => {
    const axes: CanonicalPluginStateAxes = {
      desired: 'configured',
      resolution: 'blocked',
      build: 'build-pending',
      deployment: 'deploy-pending',
      runtime: 'active',
      trust: 'blocked',
      health: 'healthy',
      recovery: 'none',
    };

    const errors = validateCanonicalStateAxes(axes);
    expect(errors.some((message) => message.includes('cannot be runtime=active'))).toBe(true);
    expect(summarizeCanonicalPluginState(axes)).toBe('blocked');
  });
});
