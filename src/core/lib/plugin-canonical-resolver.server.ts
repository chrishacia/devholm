import { createHash } from 'node:crypto';
import {
  type ArtifactSourceDescriptor,
  type CanonicalPluginConfigEntry,
  type CanonicalSourceDescriptor,
} from '@core/types/plugin-canonical-contracts';
import { validateCanonicalPluginContracts } from '@core/lib/plugin-canonical-contract-validation';
import {
  CANONICAL_PLUGIN_REGISTRY_SCHEMA_VERSION,
  CANONICAL_PLUGIN_RESOLVER_SCHEMA_VERSION,
  type CanonicalResolverFailure,
  type CanonicalResolverInput,
  type CanonicalResolverRegistryContent,
  type CanonicalResolverRegistrySnapshot,
  type CanonicalResolverRegistryVerification,
  type CanonicalResolverResult,
  type CanonicalResolvedPlugin,
  type CanonicalResolverDeterministicContent,
  type CanonicalResolverSourceProvenance,
} from '@core/types/plugin-canonical-resolver';

const MUTABLE_REF_PATTERNS: readonly RegExp[] = [
  /(^|\/)refs\/heads\//i,
  /[?&](ref|branch)=/i,
  /(^|\/)branches\//i,
  /(^|\/)latest(\.|$|\/)/i,
  /(^|\/)nightly(\.|$|\/)/i,
];

function stableJsonValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.normalize('NFC');
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('stable canonical serialization rejects non-finite numbers');
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => stableJsonValue(item));
  }

  if (value && typeof value === 'object' && value.constructor === Object) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));

    const result: Record<string, unknown> = {};
    for (const [key, item] of entries) {
      result[key] = stableJsonValue(item);
    }
    return result;
  }

  return value;
}

export function stableCanonicalStringify(value: unknown): string {
  return JSON.stringify(stableJsonValue(value));
}

export function sha256Hex(payload: unknown): string {
  return createHash('sha256').update(stableCanonicalStringify(payload)).digest('hex');
}

function sortStrings(values: readonly string[] | undefined): readonly string[] {
  return [...(values ?? [])].sort((left, right) => left.localeCompare(right));
}

function normalizeSourceLocator(source: CanonicalSourceDescriptor): string {
  if (source.sourceKind === 'local-development-checkout') {
    return 'local-development-checkout';
  }
  return source.artifactUrlOrLocator;
}

function fallbackPriority(sourceKind: CanonicalSourceDescriptor['sourceKind']): number {
  switch (sourceKind) {
    case 'cache-artifact':
      return 10;
    case 'mirror-artifact':
      return 20;
    case 'marketplace-artifact':
      return 30;
    case 'bundled-fallback-artifact':
      return 40;
    case 'local-development-checkout':
      return 50;
    default:
      return 100;
  }
}

function normalizeFallbackChain(
  source: CanonicalSourceDescriptor
): readonly CanonicalSourceDescriptor['sourceKind'][] {
  if (source.sourceKind === 'local-development-checkout') {
    return ['local-development-checkout'];
  }

  const ordered: CanonicalSourceDescriptor['sourceKind'][] = [
    'cache-artifact',
    'mirror-artifact',
    'marketplace-artifact',
    'bundled-fallback-artifact',
  ];

  ordered.sort((left, right) => {
    const priorityDiff = fallbackPriority(left) - fallbackPriority(right);
    if (priorityDiff !== 0) {
      return priorityDiff;
    }
    return left.localeCompare(right);
  });

  return ordered;
}

function isMutableProductionReference(source: ArtifactSourceDescriptor): boolean {
  if (Boolean((source as { mutableRef?: unknown }).mutableRef)) {
    return true;
  }

  if (source.immutableRefType === 'content-addressed') {
    return false;
  }

  return MUTABLE_REF_PATTERNS.some((pattern) => pattern.test(source.immutableRef));
}

function deterministicProjection(
  entry: CanonicalPluginConfigEntry
): CanonicalResolverDeterministicContent {
  const source = entry.source;

  return {
    pluginId: entry.pluginId,
    selectedVersion: entry.desiredVersion,
    publisherId: entry.publisher.publisherId,
    sourceKind: source.sourceKind,
    immutableRef:
      source.sourceKind === 'local-development-checkout'
        ? 'development-local-override'
        : source.immutableRef,
    artifactSha256: source.sourceKind === 'local-development-checkout' ? null : source.sha256,
    manifestId:
      source.sourceKind === 'local-development-checkout'
        ? source.expectedPluginId
        : source.manifestId,
    packageFormat: source.sourceKind === 'local-development-checkout' ? null : source.packageFormat,
    compatibility: {
      devholmVersion: entry.compatibility.devholmVersion,
      nodeVersion: entry.compatibility.nodeVersion,
      platform: entry.compatibility.platform ? [...entry.compatibility.platform].sort() : undefined,
    },
    contributionSummary: {
      frontendAdminPages: sortStrings(entry.frontend?.adminPages),
      frontendNavigation: sortStrings(entry.frontend?.navigation?.map((item) => item.href)),
      frontendAssets: sortStrings(entry.frontend?.assets),
      frontendContributionMode: entry.frontend?.contributionMode ?? null,
      serverApiRoutes: sortStrings(entry.server?.apiExtensions?.map((item) => item.path)),
      serverPublicRouteIds: sortStrings(entry.server?.publicRouteHandlers?.map((item) => item.id)),
      lifecycleHooks: sortStrings(entry.server?.lifecycleHooks),
      migrationIds: sortStrings(entry.server?.migrations),
      eventIds: sortStrings(entry.server?.events),
      jobIds: sortStrings(entry.server?.jobs),
      scheduledTaskIds: sortStrings(entry.server?.scheduledTasks),
    },
    policySummary: {
      requireImmutableArtifactInProduction: entry.sourcePolicy.requireImmutableArtifactInProduction,
      requireDigestInProduction: entry.sourcePolicy.requireDigestInProduction,
      requireSignatureInProduction: entry.sourcePolicy.requireSignatureInProduction,
      prohibitMutableRefsInProduction: entry.sourcePolicy.prohibitMutableRefsInProduction,
      allowLocalOverrideInDevelopment: entry.sourcePolicy.allowLocalOverrideInDevelopment,
      dependencyPolicyMode: entry.dependencyPolicy.mode,
      dependencyPolicyVersion: entry.dependencyPolicy.policyVersion,
    },
    localOverride: {
      enabled: entry.localSourceOverride?.enabled ?? false,
      developmentOnly: source.sourceKind === 'local-development-checkout',
    },
  };
}

function deterministicProvenance(
  entry: CanonicalPluginConfigEntry
): CanonicalResolverSourceProvenance {
  const source = entry.source;
  return {
    requestedSourceKind: source.sourceKind,
    resolvedSourceKind: source.sourceKind,
    acquisitionLocator: normalizeSourceLocator(source),
    fallbackChain: normalizeFallbackChain(source),
    fallbackUsed: false,
  };
}

function validateEntryPolicy(
  input: CanonicalResolverInput,
  entry: CanonicalPluginConfigEntry
): CanonicalResolverFailure[] {
  const failures: CanonicalResolverFailure[] = [];
  const source = entry.source;
  const supportedSourceKinds = new Set<CanonicalSourceDescriptor['sourceKind']>([
    'marketplace-artifact',
    'mirror-artifact',
    'cache-artifact',
    'bundled-fallback-artifact',
    'local-development-checkout',
  ]);

  if (!supportedSourceKinds.has(source.sourceKind)) {
    failures.push({
      pluginId: entry.pluginId,
      code: 'unsupported-source-type',
      field: 'source.sourceKind',
      message: `unsupported source kind ${(source as { sourceKind: string }).sourceKind}`,
    });
    return failures;
  }

  const isProductionLike = input.environment === 'production' || input.environment === 'ci';

  if (source.sourceKind === 'local-development-checkout') {
    if (isProductionLike) {
      failures.push({
        pluginId: entry.pluginId,
        code: 'local-override-forbidden',
        field: 'source.sourceKind',
        message: 'production-like resolution forbids local-development-checkout sources',
      });
    }

    if (source.expectedPluginId !== entry.pluginId) {
      failures.push({
        pluginId: entry.pluginId,
        code: 'local-override-identity-mismatch',
        field: 'source.expectedPluginId',
        message: `local override expectedPluginId ${source.expectedPluginId} does not match configured pluginId ${entry.pluginId}`,
      });
    }

    if (!entry.sourcePolicy.allowLocalOverrideInDevelopment) {
      failures.push({
        pluginId: entry.pluginId,
        code: 'local-override-forbidden',
        field: 'sourcePolicy.allowLocalOverrideInDevelopment',
        message: 'local overrides are disabled by canonical source policy',
      });
    }

    return failures;
  }

  if (source.version !== entry.desiredVersion) {
    failures.push({
      pluginId: entry.pluginId,
      code: 'exact-version-unavailable',
      field: 'source.version',
      message: `resolved source version ${source.version} does not match desiredVersion ${entry.desiredVersion}`,
    });
  }

  if (source.manifestId !== entry.pluginId) {
    failures.push({
      pluginId: entry.pluginId,
      code: 'local-override-identity-mismatch',
      field: 'source.manifestId',
      message: `resolved manifestId ${source.manifestId} does not match pluginId ${entry.pluginId}`,
    });
  }

  if (source.publisher.publisherId !== entry.publisher.publisherId) {
    failures.push({
      pluginId: entry.pluginId,
      code: 'publisher-untrusted',
      field: 'source.publisher.publisherId',
      message: `resolved publisherId ${source.publisher.publisherId} does not match configured publisherId ${entry.publisher.publisherId}`,
    });
  }

  if (isProductionLike && entry.sourcePolicy.requireImmutableArtifactInProduction) {
    if (isMutableProductionReference(source)) {
      failures.push({
        pluginId: entry.pluginId,
        code: 'mutable-production-reference',
        field: 'source.immutableRef',
        message: 'production-like resolution requires immutable artifact references',
      });
    }
  }

  if (isProductionLike && entry.sourcePolicy.requireDigestInProduction) {
    if (!source.sha256 || !/^[a-f0-9]{64}$/i.test(source.sha256)) {
      failures.push({
        pluginId: entry.pluginId,
        code: 'digest-missing',
        field: 'source.sha256',
        message: 'production-like resolution requires a valid SHA-256 digest',
      });
    }
  }

  if (isProductionLike && entry.sourcePolicy.requireSignatureInProduction) {
    if (!source.signature?.signature || !source.signature.keyId) {
      failures.push({
        pluginId: entry.pluginId,
        code: 'signature-missing',
        field: 'source.signature',
        message: 'production-like resolution requires signed artifact metadata',
      });
    }
  }

  if (entry.sourcePolicy.prohibitMutableRefsInProduction && isProductionLike && source.mutableRef) {
    failures.push({
      pluginId: entry.pluginId,
      code: 'mutable-production-reference',
      field: 'source.mutableRef',
      message: 'source.mutableRef cannot be true in production-like resolution',
    });
  }

  return failures;
}

export function resolveCanonicalPlugins(input: CanonicalResolverInput): CanonicalResolverResult {
  if (input.document.schemaVersion !== 1) {
    return {
      schemaVersion: CANONICAL_PLUGIN_RESOLVER_SCHEMA_VERSION,
      environment: input.environment,
      resolved: [],
      failures: [
        {
          pluginId: '*',
          code: 'unsupported-contract-version',
          field: 'document.schemaVersion',
          message: `unsupported canonical contract schemaVersion ${input.document.schemaVersion}`,
        },
      ],
    };
  }

  const validationErrors = validateCanonicalPluginContracts(input.document, input.environment);
  const failures: CanonicalResolverFailure[] = validationErrors.map((error) => ({
    pluginId: error.pluginId,
    code: 'invalid-canonical-configuration',
    message: `${error.code}: ${error.message}`,
  }));

  const seenPluginIds = new Set<string>();
  for (const entry of input.document.plugins) {
    if (seenPluginIds.has(entry.pluginId)) {
      failures.push({
        pluginId: entry.pluginId,
        code: 'duplicate-plugin-identity',
        field: 'pluginId',
        message: `duplicate pluginId ${entry.pluginId} in canonical document`,
      });
    }
    seenPluginIds.add(entry.pluginId);
    failures.push(...validateEntryPolicy(input, entry));
  }

  if (failures.length > 0) {
    return {
      schemaVersion: CANONICAL_PLUGIN_RESOLVER_SCHEMA_VERSION,
      environment: input.environment,
      resolved: [],
      failures,
    };
  }

  const resolved: CanonicalResolvedPlugin[] = input.document.plugins
    .map((entry) => ({
      deterministic: deterministicProjection(entry),
      observation: {
        resolvedAt: input.nowIso ?? new Date().toISOString(),
        environment: input.environment,
        provenance: deterministicProvenance(entry),
        warnings: [],
      },
    }))
    .sort((left, right) => left.deterministic.pluginId.localeCompare(right.deterministic.pluginId));

  return {
    schemaVersion: CANONICAL_PLUGIN_RESOLVER_SCHEMA_VERSION,
    environment: input.environment,
    resolved,
    failures: [],
  };
}

export function buildDeterministicCanonicalRegistry(input: CanonicalResolverInput): {
  registry: CanonicalResolverRegistrySnapshot | null;
  failures: readonly CanonicalResolverFailure[];
} {
  const resolution = resolveCanonicalPlugins(input);
  if (resolution.failures.length > 0) {
    return {
      registry: null,
      failures: resolution.failures,
    };
  }

  const content: CanonicalResolverRegistryContent = {
    schemaVersion: CANONICAL_PLUGIN_REGISTRY_SCHEMA_VERSION,
    environment: input.environment,
    plugins: resolution.resolved.map((item) => item.deterministic),
  };

  const registry: CanonicalResolverRegistrySnapshot = {
    schemaVersion: CANONICAL_PLUGIN_REGISTRY_SCHEMA_VERSION,
    generatorVersion: 'issue94-resolver-v1',
    contentDigestSha256: sha256Hex(content),
    content,
  };

  return { registry, failures: [] };
}

export function verifyDeterministicCanonicalRegistry(snapshot: {
  schemaVersion: number;
  generatorVersion: string;
  contentDigestSha256: string;
  content: unknown;
}): CanonicalResolverRegistryVerification {
  if (snapshot.schemaVersion !== CANONICAL_PLUGIN_REGISTRY_SCHEMA_VERSION) {
    return {
      ok: false,
      expectedDigestSha256: '',
      actualDigestSha256: snapshot.contentDigestSha256,
      errorCode: 'unsupported-contract-version',
    };
  }

  const expectedDigestSha256 = sha256Hex(snapshot.content);
  if (expectedDigestSha256 !== snapshot.contentDigestSha256) {
    return {
      ok: false,
      expectedDigestSha256,
      actualDigestSha256: snapshot.contentDigestSha256,
      errorCode: 'registry-tampering',
    };
  }

  return {
    ok: true,
    expectedDigestSha256,
    actualDigestSha256: snapshot.contentDigestSha256,
  };
}

export function createCanonicalDocumentFromEntries(
  entries: readonly CanonicalPluginConfigEntry[]
): { schemaVersion: 1; plugins: readonly CanonicalPluginConfigEntry[] } {
  return {
    schemaVersion: 1,
    plugins: [...entries].sort((left, right) => left.pluginId.localeCompare(right.pluginId)),
  };
}
