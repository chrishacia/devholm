import type {
  CanonicalEnvironment,
  CanonicalPluginConfigEntry,
  CanonicalPluginContractsDocument,
  CanonicalSourceDescriptor,
} from '@core/types/plugin-canonical-contracts';

export const CANONICAL_PLUGIN_RESOLVER_SCHEMA_VERSION = 1 as const;
export const CANONICAL_PLUGIN_REGISTRY_SCHEMA_VERSION = 1 as const;

export type CanonicalPluginResolverSchemaVersion = typeof CANONICAL_PLUGIN_RESOLVER_SCHEMA_VERSION;
export type CanonicalPluginRegistrySchemaVersion = typeof CANONICAL_PLUGIN_REGISTRY_SCHEMA_VERSION;

export type CanonicalResolverFailureCode =
  | 'invalid-canonical-configuration'
  | 'duplicate-plugin-identity'
  | 'exact-version-unavailable'
  | 'mutable-production-reference'
  | 'local-override-forbidden'
  | 'local-override-identity-mismatch'
  | 'artifact-unavailable'
  | 'offline-artifact-unavailable'
  | 'digest-missing'
  | 'digest-mismatch'
  | 'signature-missing'
  | 'signature-invalid'
  | 'publisher-untrusted'
  | 'publisher-revoked'
  | 'key-revoked'
  | 'compatibility-failure'
  | 'package-contract-failure'
  | 'unsafe-archive'
  | 'mirror-exhaustion'
  | 'cache-corruption'
  | 'conflicting-generated-route'
  | 'conflicting-registry-contribution'
  | 'registry-nondeterminism'
  | 'registry-tampering'
  | 'unsupported-source-type'
  | 'unsupported-contract-version';

export type CanonicalResolverSourceProvenance = {
  requestedSourceKind: CanonicalSourceDescriptor['sourceKind'];
  resolvedSourceKind: CanonicalSourceDescriptor['sourceKind'];
  acquisitionLocator: string;
  fallbackChain: readonly CanonicalSourceDescriptor['sourceKind'][];
  fallbackUsed: boolean;
};

export type CanonicalResolverDeterministicContent = {
  pluginId: string;
  selectedVersion: string;
  publisherId: string;
  sourceKind: CanonicalSourceDescriptor['sourceKind'];
  immutableRef: string;
  artifactSha256: string | null;
  manifestId: string;
  packageFormat: 'tar.gz' | null;
  compatibility: {
    devholmVersion: string;
    nodeVersion?: string;
    platform?: readonly ('linux' | 'darwin' | 'win32')[];
  };
  contributionSummary: {
    frontendAdminPages: readonly string[];
    frontendNavigation: readonly string[];
    frontendAssets: readonly string[];
    frontendContributionMode: string | null;
    serverApiRoutes: readonly string[];
    serverPublicRouteIds: readonly string[];
    lifecycleHooks: readonly string[];
    migrationIds: readonly string[];
    eventIds: readonly string[];
    jobIds: readonly string[];
    scheduledTaskIds: readonly string[];
  };
  policySummary: {
    requireImmutableArtifactInProduction: boolean;
    requireDigestInProduction: boolean;
    requireSignatureInProduction: boolean;
    prohibitMutableRefsInProduction: boolean;
    allowLocalOverrideInDevelopment: boolean;
    dependencyPolicyMode: string;
    dependencyPolicyVersion: number;
  };
  localOverride: {
    enabled: boolean;
    developmentOnly: boolean;
  };
};

export type CanonicalResolverOperationalObservation = {
  resolvedAt: string;
  environment: CanonicalEnvironment;
  provenance: CanonicalResolverSourceProvenance;
  warnings: readonly string[];
};

export type CanonicalResolvedPlugin = {
  deterministic: CanonicalResolverDeterministicContent;
  observation: CanonicalResolverOperationalObservation;
};

export type CanonicalResolverFailure = {
  pluginId: string;
  code: CanonicalResolverFailureCode;
  message: string;
  field?: string;
};

export type CanonicalResolverInput = {
  environment: CanonicalEnvironment;
  document: CanonicalPluginContractsDocument;
  offlineOnly?: boolean;
  nowIso?: string;
};

export type CanonicalResolverResult = {
  schemaVersion: CanonicalPluginResolverSchemaVersion;
  environment: CanonicalEnvironment;
  resolved: readonly CanonicalResolvedPlugin[];
  failures: readonly CanonicalResolverFailure[];
};

export type CanonicalResolverRegistryContent = {
  schemaVersion: CanonicalPluginRegistrySchemaVersion;
  environment: CanonicalEnvironment;
  plugins: readonly CanonicalResolverDeterministicContent[];
};

export type CanonicalResolverRegistrySnapshot = {
  schemaVersion: CanonicalPluginRegistrySchemaVersion;
  generatorVersion: string;
  contentDigestSha256: string;
  content: CanonicalResolverRegistryContent;
};

export type CanonicalResolverRegistryVerification = {
  ok: boolean;
  expectedDigestSha256: string;
  actualDigestSha256: string;
  errorCode?: 'registry-tampering' | 'unsupported-contract-version' | 'registry-nondeterminism';
};

export type CanonicalResolverProjectionInput = {
  plugins: readonly CanonicalPluginConfigEntry[];
  environment: CanonicalEnvironment;
};
