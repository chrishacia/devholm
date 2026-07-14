import type { ApiExtensionMethod } from '@core/types/extensions.server';

export const CANONICAL_PLUGIN_SCHEMA_VERSION = 1 as const;
export const CANONICAL_DEPENDENCY_POLICY_VERSION = 1 as const;

export type CanonicalSchemaVersion = typeof CANONICAL_PLUGIN_SCHEMA_VERSION;
export type CanonicalDependencyPolicyVersion = typeof CANONICAL_DEPENDENCY_POLICY_VERSION;

export type CanonicalEnvironment = 'development' | 'ci' | 'production';
export type CanonicalReleaseChannel = 'stable' | 'beta' | 'alpha';

export type CanonicalConfigReference = {
  key: string;
  required: boolean;
};

export type CanonicalPublisherIdentity = {
  publisherId: string;
  displayName?: string;
  trustDomain?: string;
};

export type CanonicalSourcePolicy = {
  allowLocalOverrideInDevelopment: boolean;
  requireImmutableArtifactInProduction: boolean;
  requireDigestInProduction: boolean;
  requireSignatureInProduction: boolean;
  prohibitMutableRefsInProduction: boolean;
};

export type CanonicalCompatibilityRequirements = {
  devholmVersion: string;
  nodeVersion?: string;
  platform?: readonly ('linux' | 'darwin' | 'win32')[];
};

export type CanonicalUpdatePolicy = {
  mode: 'manual' | 'stable' | 'beta';
  channel?: CanonicalReleaseChannel;
  allowPrerelease?: boolean;
};

export type CanonicalRollbackPolicy = {
  allowRollback: boolean;
  requiresCheckpoint: boolean;
  requireOperatorApproval: boolean;
};

export type CanonicalDependencyMode =
  | 'self-contained'
  | 'controlled-build-resolution'
  | 'unsupported-runtime-install';

export type CanonicalDependencyPolicy = {
  policyVersion: CanonicalDependencyPolicyVersion;
  mode: CanonicalDependencyMode;
  lockMetadataRequired: boolean;
  forbidLifecycleScriptsInProduction: boolean;
  maxPackageSizeBytes?: number;
  vulnerabilityPolicyRef?: string;
  licenseMetadataRequired: boolean;
  sbomRef?: string;
  nativeDependencies: 'blocked' | 'allowlisted' | 'allowed';
  unsupportedModes?: readonly string[];
};

export type ArtifactSignatureMetadata = {
  algorithm: 'Ed25519';
  keyId: string;
  signature: string;
  signedPayloadVersion: 'v1';
  publisherId: string;
};

export type CanonicalSourceBase = {
  sourceKind:
    | 'marketplace-artifact'
    | 'mirror-artifact'
    | 'cache-artifact'
    | 'bundled-fallback-artifact'
    | 'local-development-checkout';
};

export type ArtifactSourceDescriptor = CanonicalSourceBase & {
  sourceKind:
    | 'marketplace-artifact'
    | 'mirror-artifact'
    | 'cache-artifact'
    | 'bundled-fallback-artifact';
  immutableRef: string;
  immutableRefType: 'content-addressed' | 'release-url' | 'immutable-tag';
  artifactUrlOrLocator: string;
  sha256: string;
  signature?: ArtifactSignatureMetadata;
  publisher: CanonicalPublisherIdentity;
  compatibility: CanonicalCompatibilityRequirements;
  packageFormat: 'tar.gz';
  version: string;
  manifestId: string;
  mutableRef?: false;
};

export type LocalDevelopmentSourceDescriptor = CanonicalSourceBase & {
  sourceKind: 'local-development-checkout';
  filesystemPath: string;
  expectedPluginId: string;
  expectedVersion?: string;
  developmentOnly: true;
  productionEligible: false;
};

export type CanonicalSourceDescriptor = ArtifactSourceDescriptor | LocalDevelopmentSourceDescriptor;

export type CanonicalLocalSourceOverride = {
  enabled: boolean;
  targetPluginId: string;
  source: LocalDevelopmentSourceDescriptor;
};

export type CanonicalPluginContributionFrontend = {
  adminPages?: readonly `/admin/${string}`[];
  navigation?: readonly { href: `/admin/${string}`; label: string }[];
  settingsUi?: readonly string[];
  publicUi?: readonly string[];
  assets?: readonly string[];
  cssBoundaries?: readonly string[];
  sdkCompatibility?: string;
  csp?: {
    directives: readonly string[];
  };
  integrity?: {
    browserBundleSha256?: string;
  };
  contributionMode:
    | 'manifest-ui'
    | 'precompiled-browser-bundle'
    | 'unsupported-framework-injection';
};

export type CanonicalPluginContributionServer = {
  isolatedEntryPoint?: string;
  apiExtensions?: readonly { path: `/api/${string}`; methods: readonly ApiExtensionMethod[] }[];
  publicRouteHandlers?: readonly { id: string }[];
  lifecycleHooks?: readonly (
    | 'afterInstall'
    | 'afterUpgrade'
    | 'beforeDisable'
    | 'beforeUninstall'
    | 'purge'
  )[];
  migrations?: readonly string[];
  events?: readonly string[];
  jobs?: readonly string[];
  scheduledTasks?: readonly string[];
  environmentRequirements?: readonly string[];
  secretRefs?: readonly string[];
  runtimeCompatibility?: string;
};

export type CanonicalPluginConfigDeclaration = {
  key: string;
  valueType: 'string' | 'number' | 'boolean' | 'json';
  required: boolean;
  phase: 'build' | 'runtime';
  visibility: 'secret' | 'public';
  defaultValue?: string | number | boolean | Record<string, unknown> | null;
  validator?: {
    type: 'regex' | 'enum' | 'range';
    value: string | readonly string[];
  };
  redaction: 'none' | 'partial' | 'full';
};

export type CanonicalPluginConfigEntry = {
  schemaVersion: CanonicalSchemaVersion;
  pluginId: string;
  desiredVersion: string;
  publisher: CanonicalPublisherIdentity;
  sourcePolicy: CanonicalSourcePolicy;
  includedInBuild: boolean;
  enabledByDefault: boolean;
  bundledDefault: boolean;
  compatibility: CanonicalCompatibilityRequirements;
  configRefs?: readonly CanonicalConfigReference[];
  localSourceOverride?: CanonicalLocalSourceOverride;
  updatePolicy: CanonicalUpdatePolicy;
  rollbackPolicy: CanonicalRollbackPolicy;
  dependencyPolicy: CanonicalDependencyPolicy;
  source: CanonicalSourceDescriptor;
  channel?: CanonicalReleaseChannel;
  scope?: string;
  frontend?: CanonicalPluginContributionFrontend;
  server?: CanonicalPluginContributionServer;
  configDeclarations?: readonly CanonicalPluginConfigDeclaration[];
};

export type CanonicalPluginDesiredState =
  | 'configured'
  | 'disabled'
  | 'update-available'
  | 'updating'
  | 'rollback-available'
  | 'rolling-back';

export type CanonicalPluginResolutionState =
  | 'resolving'
  | 'resolved'
  | 'verified'
  | 'awaiting-approval'
  | 'blocked'
  | 'incompatible'
  | 'failed';

export type CanonicalPluginBuildState = 'build-pending' | 'building' | 'build-included' | 'failed';

export type CanonicalPluginDeploymentState = 'deploy-pending' | 'deploying' | 'deployed' | 'failed';

export type CanonicalPluginRuntimeState =
  | 'activating'
  | 'active'
  | 'disabled'
  | 'degraded'
  | 'failed';

export type CanonicalPluginTrustState = 'verified' | 'blocked' | 'awaiting-approval' | 'failed';

export type CanonicalPluginHealthState = 'healthy' | 'degraded' | 'failed';
export type CanonicalPluginRecoveryState =
  | 'none'
  | 'rollback-available'
  | 'rolling-back'
  | 'recovery-required';

export type CanonicalPluginStateAxes = {
  desired: CanonicalPluginDesiredState;
  resolution: CanonicalPluginResolutionState;
  build: CanonicalPluginBuildState;
  deployment: CanonicalPluginDeploymentState;
  runtime: CanonicalPluginRuntimeState;
  trust: CanonicalPluginTrustState;
  health: CanonicalPluginHealthState;
  recovery: CanonicalPluginRecoveryState;
};

export type CanonicalPluginSummaryState =
  | 'configured'
  | 'resolving'
  | 'resolved'
  | 'verified'
  | 'awaiting-approval'
  | 'build-pending'
  | 'building'
  | 'build-included'
  | 'deploy-pending'
  | 'deploying'
  | 'deployed'
  | 'activating'
  | 'active'
  | 'disabled'
  | 'degraded'
  | 'update-available'
  | 'updating'
  | 'rollback-available'
  | 'rolling-back'
  | 'recovery-required'
  | 'incompatible'
  | 'blocked'
  | 'failed';

export type CanonicalPluginContractsDocument = {
  schemaVersion: CanonicalSchemaVersion;
  plugins: readonly CanonicalPluginConfigEntry[];
};
