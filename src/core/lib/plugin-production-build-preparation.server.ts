import fs from 'node:fs';
import path from 'node:path';
import type {
  CanonicalEnvironment,
  CanonicalPluginConfigEntry,
  CanonicalPluginStateAxes,
  CanonicalPluginSummaryState,
} from '@core/types/plugin-canonical-contracts';
import { sha256Hex } from '@core/lib/plugin-canonical-resolver.server';
import {
  summarizeCanonicalPluginState,
  validateCanonicalStateAxes,
} from '@core/lib/plugin-canonical-contract-validation';
import type {
  CanonicalResolverDeterministicContent,
  CanonicalResolverRegistrySnapshot,
  CanonicalResolverRegistryVerification,
} from '@core/types/plugin-canonical-resolver';

export interface ProductionBuildPreparationPluginRecord {
  pluginId: string;
  version: string;
  includedInBuild: true;
  pluginSourceWorkspaceRoot: string;
  generatedPluginRoot: string;
  generatedMigrationDir: string;
  transitionalSourceProvenance: {
    requestedSourceKind: CanonicalPluginConfigEntry['source']['sourceKind'];
    resolvedSourceKind: CanonicalResolverDeterministicContent['sourceKind'];
    bundledTransitionalSource: boolean;
  };
  deterministicResolverReference: {
    generatorVersion: string;
    contentDigestSha256: string;
  };
  stateAxes: CanonicalPluginStateAxes;
  summaryState: CanonicalPluginSummaryState;
  resolverVerification: CanonicalResolverRegistryVerification;
  configurationProjection: {
    includedInBuild: boolean;
    desiredVersion: string;
    publisherId: string;
    immutableRef: string;
    artifactSha256: string | null;
    manifestId: string;
    packageFormat: 'tar.gz' | null;
    compatibility: CanonicalResolverDeterministicContent['compatibility'];
    contributionSummary: CanonicalResolverDeterministicContent['contributionSummary'];
    policySummary: CanonicalResolverDeterministicContent['policySummary'];
    localOverride: CanonicalResolverDeterministicContent['localOverride'];
  };
  deterministicProjectionDigestSha256: string;
}

export interface ProductionBuildPreparationManifest {
  schemaVersion: 1;
  environment: CanonicalEnvironment;
  configurationDigestSha256: string;
  registryDigestSha256: string;
  buildInputSetDigestSha256: string;
  contentDigestSha256: string;
  includedPluginIds: readonly string[];
  excludedPluginIds: readonly string[];
  plugins: readonly ProductionBuildPreparationPluginRecord[];
}

function buildPendingStateAxes(): CanonicalPluginStateAxes {
  return {
    desired: 'configured',
    resolution: 'verified',
    build: 'build-pending',
    deployment: 'deploy-pending',
    runtime: 'disabled',
    trust: 'verified',
    health: 'healthy',
    recovery: 'none',
  };
}

function sortStrings(values: readonly string[]): readonly string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function toPluginRecord(input: {
  entry: CanonicalPluginConfigEntry;
  resolved: CanonicalResolverDeterministicContent;
  registry: CanonicalResolverRegistrySnapshot;
  verification: CanonicalResolverRegistryVerification;
}): ProductionBuildPreparationPluginRecord {
  const stateAxes = buildPendingStateAxes();
  const validationErrors = validateCanonicalStateAxes(stateAxes);
  if (validationErrors.length > 0) {
    throw new Error(
      `Invalid production build state axes for ${input.entry.pluginId}: ${validationErrors.join(' | ')}`
    );
  }

  return {
    pluginId: input.entry.pluginId,
    version: input.resolved.selectedVersion,
    includedInBuild: true,
    pluginSourceWorkspaceRoot: `src/user/extensions/plugins/${input.entry.pluginId}`,
    generatedPluginRoot: `generated/plugins/${input.entry.pluginId}`,
    generatedMigrationDir: `generated/plugins/${input.entry.pluginId}/migrations`,
    transitionalSourceProvenance: {
      requestedSourceKind: input.entry.source.sourceKind,
      resolvedSourceKind: input.resolved.sourceKind,
      bundledTransitionalSource: input.resolved.sourceKind === 'bundled-fallback-artifact',
    },
    deterministicResolverReference: {
      generatorVersion: input.registry.generatorVersion,
      contentDigestSha256: input.registry.contentDigestSha256,
    },
    stateAxes,
    summaryState: summarizeCanonicalPluginState(stateAxes),
    resolverVerification: input.verification,
    configurationProjection: {
      includedInBuild: input.entry.includedInBuild,
      desiredVersion: input.entry.desiredVersion,
      publisherId: input.entry.publisher.publisherId,
      immutableRef: input.resolved.immutableRef,
      artifactSha256: input.resolved.artifactSha256,
      manifestId: input.resolved.manifestId,
      packageFormat: input.resolved.packageFormat,
      compatibility: input.resolved.compatibility,
      contributionSummary: input.resolved.contributionSummary,
      policySummary: input.resolved.policySummary,
      localOverride: input.resolved.localOverride,
    },
    deterministicProjectionDigestSha256: sha256Hex(input.resolved),
  };
}

export function createProductionBuildPreparationManifest(input: {
  environment: CanonicalEnvironment;
  entries: readonly CanonicalPluginConfigEntry[];
  registry: CanonicalResolverRegistrySnapshot;
  registryVerification: CanonicalResolverRegistryVerification;
}): ProductionBuildPreparationManifest {
  if (input.registry.schemaVersion !== 1) {
    throw new Error(
      `Production build preparation requires registry schemaVersion 1, found ${input.registry.schemaVersion}`
    );
  }

  if (input.registry.content.environment !== input.environment) {
    throw new Error(
      `Production build preparation registry environment mismatch: expected ${input.environment}, found ${input.registry.content.environment}`
    );
  }

  if (!input.registryVerification.ok) {
    throw new Error(
      `Production build preparation requires a verified registry: expected ${input.registryVerification.expectedDigestSha256}, found ${input.registryVerification.actualDigestSha256}`
    );
  }

  const includedPluginIds = sortStrings(
    input.entries.filter((entry) => entry.includedInBuild).map((entry) => entry.pluginId)
  );
  const excludedPluginIds = sortStrings(
    input.entries.filter((entry) => !entry.includedInBuild).map((entry) => entry.pluginId)
  );

  const configurationDigestSha256 = sha256Hex(
    input.entries
      .slice()
      .sort((left, right) => left.pluginId.localeCompare(right.pluginId))
      .map((entry) => ({
        pluginId: entry.pluginId,
        desiredVersion: entry.desiredVersion,
        includedInBuild: entry.includedInBuild,
        sourceKind: entry.source.sourceKind,
        immutableRef:
          entry.source.sourceKind === 'local-development-checkout'
            ? entry.source.filesystemPath
            : entry.source.immutableRef,
        artifactSha256:
          entry.source.sourceKind === 'local-development-checkout' ? null : entry.source.sha256,
        manifestId:
          entry.source.sourceKind === 'local-development-checkout'
            ? entry.source.expectedPluginId
            : entry.source.manifestId,
      }))
  );

  const resolvedByPluginId = new Map(
    input.registry.content.plugins.map((plugin) => [plugin.pluginId, plugin])
  );

  const plugins = input.entries
    .filter((entry) => entry.includedInBuild)
    .sort((left, right) => left.pluginId.localeCompare(right.pluginId))
    .map((entry) => {
      const resolved = resolvedByPluginId.get(entry.pluginId);
      if (!resolved) {
        throw new Error(
          `Production build preparation registry is missing resolver output for ${entry.pluginId}`
        );
      }

      return toPluginRecord({
        entry,
        resolved,
        registry: input.registry,
        verification: input.registryVerification,
      });
    });

  const buildInputSetDigestSha256 = sha256Hex({
    configurationDigestSha256,
    registryDigestSha256: input.registry.contentDigestSha256,
    includedPluginIds,
    excludedPluginIds,
    plugins: plugins.map((plugin) => ({
      pluginId: plugin.pluginId,
      deterministicProjectionDigestSha256: plugin.deterministicProjectionDigestSha256,
      stateAxes: plugin.stateAxes,
      summaryState: plugin.summaryState,
    })),
  });

  const payloadWithoutDigest = {
    schemaVersion: 1 as const,
    environment: input.environment,
    configurationDigestSha256,
    registryDigestSha256: input.registry.contentDigestSha256,
    buildInputSetDigestSha256,
    includedPluginIds,
    excludedPluginIds,
    plugins,
  };

  const contentDigestSha256 = sha256Hex(payloadWithoutDigest);

  return {
    ...payloadWithoutDigest,
    contentDigestSha256,
  };
}

export function writeProductionBuildPreparationManifest(
  rootDir: string,
  manifest: ProductionBuildPreparationManifest
): string {
  const outputDir = path.join(rootDir, 'generated/plugins');
  const outputPath = path.join(outputDir, 'production-build-preparation.json');
  const tempPath = path.join(
    outputDir,
    `production-build-preparation.json.tmp-${process.pid}-${Date.now()}`
  );

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(tempPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, outputPath);

  return outputPath;
}
