import packageJson from '../../../package.json';
import fs from 'fs';
import path from 'path';
import { satisfies, valid, validRange } from 'semver';
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

  if (manifest.version && !valid(manifest.version)) {
    errors.push(`manifest.version must be valid semver for plugin ${manifest.id || '<unknown>'}`);
  }

  if (!manifest.enablementSettingKey.trim()) {
    errors.push(`enablementSettingKey is required for plugin ${manifest.id || '<unknown>'}`);
  }

  const expectedEnablementKey = `plugin:${manifest.id}:enabled`;
  if (manifest.enablementSettingKey && manifest.enablementSettingKey !== expectedEnablementKey) {
    errors.push(
      `enablementSettingKey ${manifest.enablementSettingKey} must exactly equal ${expectedEnablementKey}`
    );
  }

  if (manifest.migrations) {
    const ids = new Set<string>();
    const files = new Set<string>();
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

      if (files.has(migration.file)) {
        errors.push(`duplicate migration file ${migration.file} in plugin ${manifest.id}`);
      }
      files.add(migration.file);

      if (!migration.file.startsWith('db/migrations/')) {
        errors.push(
          `migration file ${migration.file} must be declared under db/migrations/ for plugin ${manifest.id}`
        );
      }
    }
  }

  if (manifest.settings) {
    const seenSettings = new Set<string>();
    for (const setting of manifest.settings) {
      if (seenSettings.has(setting.key)) {
        errors.push(`duplicate setting key ${setting.key} in plugin ${manifest.id}`);
      }
      seenSettings.add(setting.key);

      if (!setting.key.startsWith(`plugin:${manifest.id}:`)) {
        errors.push(`setting key ${setting.key} must be namespaced under plugin:${manifest.id}:`);
      }

      if (setting.defaultValue !== undefined && setting.defaultValue !== null) {
        if (setting.type === 'string' && typeof setting.defaultValue !== 'string') {
          errors.push(`setting ${setting.key} defaultValue must be string`);
        }
        if (setting.type === 'number' && typeof setting.defaultValue !== 'number') {
          errors.push(`setting ${setting.key} defaultValue must be number`);
        }
        if (setting.type === 'boolean' && typeof setting.defaultValue !== 'boolean') {
          errors.push(`setting ${setting.key} defaultValue must be boolean`);
        }
        if (
          setting.type === 'json' &&
          (typeof setting.defaultValue !== 'object' ||
            setting.defaultValue === null ||
            Array.isArray(setting.defaultValue))
        ) {
          errors.push(`setting ${setting.key} defaultValue must be JSON object`);
        }
      }
    }
  }

  if (manifest.publicRouteExtensionIds) {
    const seen = new Set<string>();
    for (const extensionId of manifest.publicRouteExtensionIds) {
      if (seen.has(extensionId)) {
        errors.push(`duplicate public route extension id ${extensionId} in plugin ${manifest.id}`);
      }
      seen.add(extensionId);
    }
  }

  if (manifest.adminPageHrefs) {
    const seen = new Set<string>();
    for (const href of manifest.adminPageHrefs) {
      if (seen.has(href)) {
        errors.push(`duplicate admin page href ${href} in plugin ${manifest.id}`);
      }
      seen.add(href);
    }
  }

  const lifecycle = manifest.lifecycle;
  if (lifecycle) {
    for (const [hookName, hookFn] of Object.entries(lifecycle)) {
      if (hookFn !== undefined && typeof hookFn !== 'function') {
        errors.push(`lifecycle.${hookName} must be a function for plugin ${manifest.id}`);
      }
    }
  }

  if (manifest.lifecyclePolicy) {
    const policy = manifest.lifecyclePolicy;
    const validRetention = policy.dataRetention === 'retain-all-calendar-data';
    if (!validRetention) {
      errors.push(
        `plugin ${manifest.id} lifecyclePolicy.dataRetention must be retain-all-calendar-data`
      );
    }

    if (policy.disablePolicy !== 'non-destructive') {
      errors.push(`plugin ${manifest.id} lifecyclePolicy.disablePolicy must be non-destructive`);
    }

    if (policy.uninstallPolicy !== 'non-destructive') {
      errors.push(`plugin ${manifest.id} lifecyclePolicy.uninstallPolicy must be non-destructive`);
    }

    if (!policy.purge.requiresConfirmPluginId) {
      errors.push(
        `plugin ${manifest.id} lifecyclePolicy.purge.requiresConfirmPluginId must be true`
      );
    }

    if (
      policy.purge.destructiveDataWipe !== 'blocked' &&
      policy.purge.destructiveDataWipe !== 'allowed-with-confirmation'
    ) {
      errors.push(`plugin ${manifest.id} lifecyclePolicy.purge.destructiveDataWipe is invalid`);
    }

    if (!policy.purge.warning.trim()) {
      errors.push(`plugin ${manifest.id} lifecyclePolicy.purge.warning is required`);
    }
  }

  for (const [dependencyId, range] of Object.entries(manifest.dependencies?.plugins ?? {})) {
    if (!validRange(range)) {
      errors.push(
        `plugin ${manifest.id} declares invalid plugin dependency range ${dependencyId}@${range}`
      );
    }
  }

  for (const [pkg, range] of Object.entries(manifest.dependencies?.packages ?? {})) {
    if (!validRange(range)) {
      errors.push(`plugin ${manifest.id} declares invalid runtime package range ${pkg}@${range}`);
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
      if (!validRange(manifest.devholmVersion)) {
        errors.push(
          `plugin ${manifest.id} declares invalid devholmVersion range ${manifest.devholmVersion}`
        );
        continue;
      }

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
  installedPackages: Record<string, string>,
  rootDependencies: Record<string, string> = (packageJson.dependencies ?? {}) as Record<
    string,
    string
  >,
  rootDevDependencies: Record<string, string> = (packageJson.devDependencies ?? {}) as Record<
    string,
    string
  >
): string[] {
  const errors: string[] = [];

  for (const manifest of manifests) {
    const packageDeps = manifest.dependencies?.packages ?? {};
    for (const [pkg, expectedRange] of Object.entries(packageDeps)) {
      if (!validRange(expectedRange)) {
        errors.push(
          `plugin ${manifest.id} declares invalid runtime package range ${pkg}@${expectedRange}`
        );
        continue;
      }

      const inDependencies = Object.prototype.hasOwnProperty.call(rootDependencies, pkg);
      const inDevDependencies = Object.prototype.hasOwnProperty.call(rootDevDependencies, pkg);
      if (!inDependencies && inDevDependencies) {
        errors.push(
          `plugin ${manifest.id} requires ${pkg} in production dependencies but it is only in devDependencies`
        );
        continue;
      }

      if (!inDependencies && !inDevDependencies) {
        errors.push(
          `plugin ${manifest.id} requires ${pkg} in production dependencies but it is transitive-only or missing`
        );
        continue;
      }

      const installedVersion = installedPackages[pkg];
      if (!installedVersion) {
        errors.push(`plugin ${manifest.id} requires installed package metadata for ${pkg}`);
        continue;
      }

      if (!valid(installedVersion)) {
        errors.push(
          `plugin ${manifest.id} resolved malformed installed package version ${pkg}@${installedVersion}`
        );
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
  const manifests = getBundledPluginManifests();
  const rootDependencies = (packageJson.dependencies ?? {}) as Record<string, string>;
  const rootDevDependencies = (packageJson.devDependencies ?? {}) as Record<string, string>;
  const requiredPackages = new Set<string>();
  for (const manifest of manifests) {
    for (const packageName of Object.keys(manifest.dependencies?.packages ?? {})) {
      requiredPackages.add(packageName);
    }
  }

  const installed: Record<string, string> = {};
  for (const packageName of requiredPackages) {
    const packageJsonPath = path.join(process.cwd(), 'node_modules', packageName, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      continue;
    }

    const packagePayload = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      version?: string;
    };
    if (typeof packagePayload.version === 'string' && packagePayload.version.trim()) {
      installed[packageName] = packagePayload.version;
    }
  }

  return validatePackageDependenciesForManifests(
    manifests,
    installed,
    rootDependencies,
    rootDevDependencies
  );
}
