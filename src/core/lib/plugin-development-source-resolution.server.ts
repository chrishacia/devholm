import fs from 'fs';
import path from 'path';
import type {
  CanonicalEnvironment,
  CanonicalPluginConfigEntry,
  CanonicalPluginContractsDocument,
  LocalDevelopmentSourceDescriptor,
} from '@core/types/plugin-canonical-contracts';
import {
  createCanonicalDocumentFromEntries,
  resolveCanonicalPlugins,
} from '@core/lib/plugin-canonical-resolver.server';
import { toCanonicalPluginConfigEntry } from '@core/lib/plugin-canonical-contract-adapters';
import { bundledPlugins } from '@user/extensions/plugins/registry';

export const LOCAL_PLUGIN_OVERRIDE_ENV = 'DEVHOLM_PLUGIN_LOCAL_OVERRIDES';

export type PluginOverrideMap = Readonly<Record<string, string>>;

export interface PluginSourceOverrideDescriptor {
  pluginId: string;
  requestedPath: string;
  filesystemPath: string;
}

export interface PluginSourceResolutionDiagnostics {
  errors: readonly string[];
  warnings: readonly string[];
}

export interface CanonicalPluginSourceResolution {
  environment: CanonicalEnvironment;
  document: CanonicalPluginContractsDocument;
  entries: readonly CanonicalPluginConfigEntry[];
  appliedOverrides: readonly PluginSourceOverrideDescriptor[];
  diagnostics: PluginSourceResolutionDiagnostics;
}

function normalizeFilesystemPath(value: string): string {
  return value.replace(/\\/g, '/');
}

function parsePluginOverrideMap(rawValue: string): PluginOverrideMap {
  const parsed = JSON.parse(rawValue) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(
      `${LOCAL_PLUGIN_OVERRIDE_ENV} must be a JSON object mapping plugin IDs to filesystem paths`
    );
  }

  const entries = Object.entries(parsed as Record<string, unknown>);
  const result: Record<string, string> = {};
  for (const [pluginId, overridePath] of entries) {
    if (!pluginId.trim()) {
      throw new Error(`${LOCAL_PLUGIN_OVERRIDE_ENV} contains an empty plugin ID key`);
    }

    if (typeof overridePath !== 'string' || !overridePath.trim()) {
      throw new Error(
        `${LOCAL_PLUGIN_OVERRIDE_ENV} override for ${pluginId} must be a non-empty string path`
      );
    }

    result[pluginId] = overridePath;
  }

  return result;
}

export function readPluginLocalOverrideMap(rawValue: string | undefined): PluginOverrideMap {
  if (!rawValue || !rawValue.trim()) {
    return {};
  }

  return parsePluginOverrideMap(rawValue.trim());
}

function toLocalDevelopmentSourceDescriptor(input: {
  pluginId: string;
  requestedPath: string;
  rootDir: string;
  desiredVersion: string;
}): PluginSourceOverrideDescriptor & { source: LocalDevelopmentSourceDescriptor } {
  const resolvedPath = path.resolve(input.rootDir, input.requestedPath);
  const stats = fs.existsSync(resolvedPath) ? fs.statSync(resolvedPath) : null;
  if (!stats || !stats.isDirectory()) {
    throw new Error(
      `Local override for ${input.pluginId} must point to an existing directory (resolved ${resolvedPath})`
    );
  }

  const source: LocalDevelopmentSourceDescriptor = {
    sourceKind: 'local-development-checkout',
    filesystemPath: normalizeFilesystemPath(resolvedPath),
    expectedPluginId: input.pluginId,
    expectedVersion: input.desiredVersion,
    developmentOnly: true,
    productionEligible: false,
  };

  return {
    pluginId: input.pluginId,
    requestedPath: input.requestedPath,
    filesystemPath: normalizeFilesystemPath(resolvedPath),
    source,
  };
}

export function buildCanonicalPluginSourceResolution(input: {
  environment: CanonicalEnvironment;
  rootDir: string;
  overrideRaw?: string;
  strict?: boolean;
}): CanonicalPluginSourceResolution {
  const strict = input.strict !== false;
  const diagnosticsErrors: string[] = [];
  const diagnosticsWarnings: string[] = [];

  let overrideMap: PluginOverrideMap = {};
  try {
    overrideMap = readPluginLocalOverrideMap(input.overrideRaw);
  } catch (error) {
    diagnosticsErrors.push(error instanceof Error ? error.message : String(error));
  }

  if (input.environment !== 'development' && Object.keys(overrideMap).length > 0) {
    diagnosticsErrors.push(
      `${LOCAL_PLUGIN_OVERRIDE_ENV} is development-only and cannot be used when environment=${input.environment}`
    );
  }

  const baseEntries = bundledPlugins.map(toCanonicalPluginConfigEntry);
  const baseEntryByPluginId = new Map(baseEntries.map((entry) => [entry.pluginId, entry]));
  const overrides: PluginSourceOverrideDescriptor[] = [];

  for (const [pluginId, requestedPath] of Object.entries(overrideMap)) {
    const entry = baseEntryByPluginId.get(pluginId);
    if (!entry) {
      diagnosticsErrors.push(
        `Local override references unknown plugin ${pluginId}. Only configured plugin identities may be overridden.`
      );
      continue;
    }

    if (input.environment !== 'development') {
      continue;
    }

    try {
      const override = toLocalDevelopmentSourceDescriptor({
        pluginId,
        requestedPath,
        rootDir: input.rootDir,
        desiredVersion: entry.desiredVersion,
      });

      overrides.push({
        pluginId: override.pluginId,
        requestedPath: override.requestedPath,
        filesystemPath: override.filesystemPath,
      });

      baseEntryByPluginId.set(pluginId, {
        ...entry,
        source: override.source,
        localSourceOverride: {
          enabled: true,
          targetPluginId: pluginId,
          source: override.source,
        },
      });
    } catch (error) {
      diagnosticsErrors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (Object.keys(overrideMap).length === 0 && input.environment === 'development') {
    diagnosticsWarnings.push(
      `${LOCAL_PLUGIN_OVERRIDE_ENV} is not set; using bundled default sources for development resolution`
    );
  }

  const entries = Array.from(baseEntryByPluginId.values()).sort((left, right) =>
    left.pluginId.localeCompare(right.pluginId)
  );
  const document = createCanonicalDocumentFromEntries(entries);

  if (strict && diagnosticsErrors.length > 0) {
    throw new Error(diagnosticsErrors.join(' | '));
  }

  return {
    environment: input.environment,
    document,
    entries,
    appliedOverrides: overrides,
    diagnostics: {
      errors: diagnosticsErrors,
      warnings: diagnosticsWarnings,
    },
  };
}

export interface CanonicalPluginResolvedSourceStatus {
  pluginId: string;
  configuredSourceKind: CanonicalPluginConfigEntry['source']['sourceKind'];
  resolvedSourceKind: CanonicalPluginConfigEntry['source']['sourceKind'] | null;
  localOverrideEnabled: boolean;
  localOverrideFilesystemPath: string | null;
  resolverFailureCodes: readonly string[];
}

export function resolveCanonicalPluginSourceStatus(input: {
  environment: CanonicalEnvironment;
  rootDir: string;
  overrideRaw?: string;
}): {
  diagnostics: PluginSourceResolutionDiagnostics;
  plugins: readonly CanonicalPluginResolvedSourceStatus[];
} {
  const configured = buildCanonicalPluginSourceResolution({
    environment: input.environment,
    rootDir: input.rootDir,
    overrideRaw: input.overrideRaw,
    strict: false,
  });

  const resolution = resolveCanonicalPlugins({
    environment: input.environment,
    document: configured.document,
  });

  const resolvedByPluginId = new Map(
    resolution.resolved.map((entry) => [entry.deterministic.pluginId, entry])
  );
  const failuresByPluginId = new Map<string, string[]>();
  for (const failure of resolution.failures) {
    const target = failuresByPluginId.get(failure.pluginId) ?? [];
    target.push(failure.code);
    failuresByPluginId.set(failure.pluginId, target);
  }

  const plugins = configured.entries.map((entry) => {
    const resolved = resolvedByPluginId.get(entry.pluginId);
    const override = configured.appliedOverrides.find((value) => value.pluginId === entry.pluginId);

    return {
      pluginId: entry.pluginId,
      configuredSourceKind: entry.source.sourceKind,
      resolvedSourceKind: resolved?.deterministic.sourceKind ?? null,
      localOverrideEnabled: Boolean(entry.localSourceOverride?.enabled),
      localOverrideFilesystemPath: override?.filesystemPath ?? null,
      resolverFailureCodes: failuresByPluginId.get(entry.pluginId) ?? [],
    };
  });

  return {
    diagnostics: configured.diagnostics,
    plugins,
  };
}
