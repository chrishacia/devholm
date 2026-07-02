import packageJson from '../../../package.json';
import { satisfies, valid } from 'semver';
import type { DevholmBundledPlugin, DevholmPluginManifest } from '@core/types/plugins';
import { bundledPlugins } from '@user/extensions/plugins/registry';

export function isVersionCompatible(currentVersion: string, expectedRange: string): boolean {
  if (!expectedRange || !expectedRange.trim()) {
    return false;
  }

  if (!valid(currentVersion)) {
    return false;
  }

  return satisfies(currentVersion, expectedRange, { includePrerelease: true });
}

export function validateManifest(manifest: DevholmPluginManifest): string[] {
  const errors: string[] = [];

  if (!manifest.id.trim()) {
    errors.push('manifest.id is required');
  }

  if (!manifest.name.trim()) {
    errors.push(`manifest.name is required for plugin ${manifest.id || '<unknown>'}`);
  }

  if (!manifest.version.trim()) {
    errors.push(`manifest.version is required for plugin ${manifest.id || '<unknown>'}`);
  }

  if (!manifest.enablementSettingKey.trim()) {
    errors.push(`enablementSettingKey is required for plugin ${manifest.id || '<unknown>'}`);
  }

  if (
    manifest.enablementSettingKey &&
    !manifest.enablementSettingKey.startsWith(`plugin:${manifest.id}:`)
  ) {
    errors.push(
      `enablementSettingKey ${manifest.enablementSettingKey} must be namespaced under plugin:${manifest.id}:`
    );
  }

  if (manifest.migrations) {
    const ids = new Set<string>();
    for (const migration of manifest.migrations) {
      if (!migration.id.startsWith(`${manifest.id}:`)) {
        errors.push(
          `migration id ${migration.id} must be globally namespaced as ${manifest.id}:<migration-id>`
        );
      }
      if (ids.has(migration.id)) {
        errors.push(`duplicate migration id ${migration.id} in plugin ${manifest.id}`);
      }
      ids.add(migration.id);
    }
  }

  return errors;
}

export function getBundledPlugins(): readonly DevholmBundledPlugin[] {
  return bundledPlugins;
}

export function getBundledPluginManifests(): readonly DevholmPluginManifest[] {
  return bundledPlugins.map((plugin) => plugin.manifest);
}

export function validatePluginManifestList(manifests: readonly DevholmPluginManifest[]): string[] {
  const errors: string[] = [];
  const seenPluginIds = new Set<string>();

  for (const manifest of manifests) {
    if (seenPluginIds.has(manifest.id)) {
      errors.push(`duplicate plugin id ${manifest.id}`);
    }
    seenPluginIds.add(manifest.id);

    errors.push(...validateManifest(manifest));

    if (manifest.devholmVersion) {
      const compatible = isVersionCompatible(packageJson.version, manifest.devholmVersion);
      if (!compatible) {
        errors.push(
          `plugin ${manifest.id} expects DevHolm ${manifest.devholmVersion} but app is ${packageJson.version}`
        );
      }
    }
  }

  return errors;
}

export function validateBundledPluginRegistry(): string[] {
  return validatePluginManifestList(getBundledPluginManifests());
}

export function validateDependencyGraphForManifests(
  manifests: readonly DevholmPluginManifest[]
): string[] {
  const errors: string[] = [];
  const manifestById = new Map(manifests.map((manifest) => [manifest.id, manifest]));

  for (const manifest of manifests) {
    const requiredPlugins = manifest.dependencies?.plugins ?? {};

    for (const dependencyId of Object.keys(requiredPlugins)) {
      if (!manifestById.has(dependencyId)) {
        errors.push(`plugin ${manifest.id} requires missing plugin dependency ${dependencyId}`);
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  function dfs(pluginId: string, trail: string[]): void {
    if (visiting.has(pluginId)) {
      const startIndex = trail.indexOf(pluginId);
      const cycle = [...trail.slice(startIndex), pluginId].join(' -> ');
      errors.push(`plugin dependency cycle detected: ${cycle}`);
      return;
    }

    if (visited.has(pluginId)) {
      return;
    }

    visiting.add(pluginId);
    const manifest = manifestById.get(pluginId);
    const deps = Object.keys(manifest?.dependencies?.plugins ?? {});
    for (const dependency of deps) {
      dfs(dependency, [...trail, pluginId]);
    }
    visiting.delete(pluginId);
    visited.add(pluginId);
  }

  for (const manifest of manifests) {
    dfs(manifest.id, []);
  }

  return errors;
}

export function validateDependencyGraph(): string[] {
  return validateDependencyGraphForManifests(getBundledPluginManifests());
}

export function validatePackageDependenciesForManifests(
  manifests: readonly DevholmPluginManifest[],
  installedPackages: Record<string, string>
): string[] {
  const errors: string[] = [];

  for (const manifest of manifests) {
    const packageDeps = manifest.dependencies?.packages ?? {};
    for (const [pkg, expectedRange] of Object.entries(packageDeps)) {
      const installedVersion = installedPackages[pkg];
      if (!installedVersion) {
        errors.push(`plugin ${manifest.id} requires missing package dependency ${pkg}`);
        continue;
      }

      if (!isVersionCompatible(installedVersion, expectedRange)) {
        errors.push(
          `plugin ${manifest.id} requires ${pkg}@${expectedRange} but found ${installedVersion}`
        );
      }
    }
  }

  return errors;
}

export function validatePackageDependencies(): string[] {
  const installed = {
    ...(packageJson.dependencies ?? {}),
  } as Record<string, string>;

  return validatePackageDependenciesForManifests(getBundledPluginManifests(), installed);
}
