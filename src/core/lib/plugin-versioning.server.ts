import { satisfies, valid, validRange, maxSatisfying } from 'semver';
import type {
  DevholmPluginManifest,
  PluginUpdatePreflight,
  PluginMigration,
  PluginMigrationMetadata,
  MigrationReversibility,
} from '@core/types/plugins';

/**
 * Check if a plugin version is compatible with the current DevHolm version
 */
export function isCompatibleWithDevholm(
  pluginDevholmRange: string | undefined,
  currentDevholmVersion: string
): { compatible: boolean; reason?: string } {
  if (!pluginDevholmRange) {
    return {
      compatible: true,
      reason: 'No specific DevHolm version requirement',
    };
  }

  if (!valid(currentDevholmVersion)) {
    return {
      compatible: false,
      reason: `Invalid DevHolm version: ${currentDevholmVersion}`,
    };
  }

  if (!validRange(pluginDevholmRange)) {
    return {
      compatible: false,
      reason: `Invalid DevHolm version range in manifest: ${pluginDevholmRange}`,
    };
  }

  const isCompatible = satisfies(currentDevholmVersion, pluginDevholmRange, {
    includePrerelease: true,
  });

  if (!isCompatible) {
    return {
      compatible: false,
      reason: `Plugin requires DevHolm ${pluginDevholmRange}, but you have ${currentDevholmVersion}`,
    };
  }

  return { compatible: true };
}

function normalizeMigrationMetadata(
  migration: PluginMigration | PluginMigrationMetadata
): PluginMigrationMetadata {
  return {
    ...migration,
    reversibility: getMigrationReversibility(migration),
  };
}

/**
 * Check if a plugin dependency is satisfied
 */
export function isDependencySatisfied(
  dependencyId: string,
  requiredRange: string,
  installedVersion: string | undefined
): { satisfied: boolean; reason?: string } {
  if (!installedVersion) {
    return {
      satisfied: false,
      reason: `Required plugin ${dependencyId}@${requiredRange} is not installed`,
    };
  }

  if (!valid(installedVersion)) {
    return {
      satisfied: false,
      reason: `Invalid installed version for ${dependencyId}: ${installedVersion}`,
    };
  }

  if (!validRange(requiredRange)) {
    return {
      satisfied: false,
      reason: `Invalid version range for ${dependencyId}: ${requiredRange}`,
    };
  }

  const isSatisfied = satisfies(installedVersion, requiredRange, { includePrerelease: true });

  if (!isSatisfied) {
    return {
      satisfied: false,
      reason: `Plugin dependency ${dependencyId}@${requiredRange} not satisfied, installed: ${installedVersion}`,
    };
  }

  return { satisfied: true };
}

/**
 * Check compatibility of all plugin dependencies
 */
export function checkDependencyCompatibility(
  manifest: DevholmPluginManifest,
  getInstalledPluginVersion: (pluginId: string) => string | undefined
): { compatible: boolean; warnings: string[] } {
  const warnings: string[] = [];

  if (!manifest.dependencies?.plugins) {
    return { compatible: true, warnings };
  }

  for (const [depId, depRange] of Object.entries(manifest.dependencies.plugins)) {
    const installed = getInstalledPluginVersion(depId);
    const result = isDependencySatisfied(depId, depRange, installed);

    if (!result.satisfied) {
      warnings.push(result.reason || `Dependency ${depId} not satisfied`);
    }
  }

  return {
    compatible: warnings.length === 0,
    warnings,
  };
}

/**
 * Classify migration reversibility
 */
export function getMigrationReversibility(
  migration: Partial<PluginMigrationMetadata>
): MigrationReversibility {
  if (migration.reversibility) {
    return migration.reversibility;
  }

  // Default: migrations without explicit metadata are considered reversible
  return 'reversible';
}

/**
 * Build an update preflight analysis
 */
export function buildUpdatePreflight(
  pluginId: string,
  currentVersion: string,
  proposedVersion: string,
  currentDevholmVersion: string,
  currentManifest: DevholmPluginManifest,
  proposedManifest: DevholmPluginManifest,
  getInstalledPluginVersion: (pluginId: string) => string | undefined
): PluginUpdatePreflight {
  const warnings: string[] = [];
  const irreversibleChanges: string[] = [];

  // Check DevHolm compatibility
  const devholmCompat = isCompatibleWithDevholm(
    proposedManifest.devholmVersion,
    currentDevholmVersion
  );

  // Check dependency compatibility
  if (!devholmCompat.compatible && devholmCompat.reason) {
    warnings.push(devholmCompat.reason);
  }
  const depCompat = checkDependencyCompatibility(proposedManifest, getInstalledPluginVersion);
  if (!depCompat.compatible) {
    warnings.push(...depCompat.warnings);
  }

  // Analyze migrations
  const proposedMigrations = (proposedManifest.migrations || []).map(normalizeMigrationMetadata);
  const currentMigrations = (currentManifest.migrations || []).map(normalizeMigrationMetadata);

  const currentMigrationIds = new Set(currentMigrations.map((m) => m.id));
  const proposedMigrationIds = new Set(proposedMigrations.map((m) => m.id));

  const migrationsToApply: PluginMigrationMetadata[] = [];
  for (const migration of proposedMigrations) {
    if (!currentMigrationIds.has(migration.id)) {
      migrationsToApply.push(migration);
      const reversibility = getMigrationReversibility(migration);
      if (reversibility === 'irreversible') {
        irreversibleChanges.push(
          `Migration ${migration.id}: ${migration.irreversibleWarning || 'irreversible change'}`
        );
      }
    }
  }

  const migrationsToRevert: PluginMigrationMetadata[] = [];
  for (const migration of currentMigrations) {
    if (!proposedMigrationIds.has(migration.id)) {
      migrationsToRevert.push(migration);
    }
  }

  // Detect capability changes
  const currentCapabilities = new Set(
    Object.entries(currentManifest.lifecycle || {})
      .filter(([, fn]) => fn !== undefined)
      .map(([name]) => name)
  );
  const proposedCapabilities = new Set(
    Object.entries(proposedManifest.lifecycle || {})
      .filter(([, fn]) => fn !== undefined)
      .map(([name]) => name)
  );

  const capabilityChanges = {
    added: Array.from(proposedCapabilities).filter((c) => !currentCapabilities.has(c)),
    removed: Array.from(currentCapabilities).filter((c) => !proposedCapabilities.has(c)),
  };

  // Detect dependency changes
  const currentDeps = currentManifest.dependencies?.plugins || {};
  const proposedDeps = proposedManifest.dependencies?.plugins || {};

  const dependencyChanges = {
    added: {} as Record<string, string>,
    removed: {} as Record<string, string>,
    upgraded: {} as Record<string, { from: string; to: string }>,
  };

  for (const [depId, range] of Object.entries(proposedDeps)) {
    if (!currentDeps[depId]) {
      dependencyChanges.added[depId] = range;
    } else if (currentDeps[depId] !== range) {
      dependencyChanges.upgraded[depId] = {
        from: currentDeps[depId],
        to: range,
      };
    }
  }

  for (const [depId] of Object.entries(currentDeps)) {
    if (!proposedDeps[depId]) {
      dependencyChanges.removed[depId] = currentDeps[depId];
    }
  }

  return {
    pluginId,
    currentVersion,
    proposedVersion,
    isCompatibleWithCurrentDevholm: devholmCompat.compatible,
    isCompatibleWithDependencies: depCompat.compatible,
    migrationsToApply,
    migrationsToRevert,
    capabilityChanges: Object.values(capabilityChanges).some((arr) => arr.length > 0)
      ? capabilityChanges
      : undefined,
    dependencyChanges: Object.values(dependencyChanges).some((obj) => Object.keys(obj).length > 0)
      ? dependencyChanges
      : undefined,
    warnings,
    irreversibleChanges,
  };
}

/**
 * Find compatible versions from a list of available versions
 */
export function findCompatibleVersions(
  availableVersions: string[],
  versionRange: string
): string[] {
  if (!validRange(versionRange)) {
    return [];
  }

  return availableVersions.filter(
    (v) => valid(v) && satisfies(v, versionRange, { includePrerelease: true })
  );
}

/**
 * Find the latest compatible version
 */
export function findLatestCompatibleVersion(
  availableVersions: string[],
  versionRange: string
): string | undefined {
  const compatible = findCompatibleVersions(availableVersions, versionRange);
  return maxSatisfying(compatible, versionRange, { includePrerelease: true }) || undefined;
}
