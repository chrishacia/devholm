import { valid as isValidSemver } from 'semver';
import type {
  MarketplaceDirectoryContract,
  MarketplaceDirectorySnapshot,
  MarketplacePluginPackageMetadata,
} from '@core/types/plugin-marketplace-contract';

const SAFE_RELATIVE_PATH_PATTERN = /^[A-Za-z0-9._/-]+$/;
const SAFE_PLUGIN_SUBDIR_PATTERN = /^plugins\/[a-z0-9-]+$/;

export const DEFAULT_MARKETPLACE_DIRECTORY_CONTRACT: MarketplaceDirectoryContract = {
  rootFiles: ['marketplace.json', 'index.html'],
  pluginsRootDir: 'plugins',
  requiredPluginFiles: ['README.md', 'index.html', 'manifest.json'],
  optionalPluginDirectories: ['docs', 'assets', 'fixtures'],
};

function isSafeRelativePath(value: string): boolean {
  if (!value || !value.trim()) {
    return false;
  }

  if (!SAFE_RELATIVE_PATH_PATTERN.test(value)) {
    return false;
  }

  if (value.startsWith('/') || value.includes('..') || value.includes('\\')) {
    return false;
  }

  return true;
}

function isValidRepositoryUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function hasStringArray(values: unknown): values is string[] {
  return Array.isArray(values) && values.every((value) => typeof value === 'string');
}

export function validateMarketplacePackageMetadata(
  metadata: MarketplacePluginPackageMetadata
): string[] {
  const errors: string[] = [];

  if (!metadata.pluginId.trim()) {
    errors.push('pluginId is required');
  }

  if (!metadata.displayName.trim()) {
    errors.push(`displayName is required for plugin ${metadata.pluginId || '<unknown>'}`);
  }

  if (!isValidSemver(metadata.version)) {
    errors.push(`version must be valid semver for plugin ${metadata.pluginId || '<unknown>'}`);
  }

  if (!isSafeRelativePath(metadata.manifestPath)) {
    errors.push(`manifestPath must be a safe relative path for plugin ${metadata.pluginId}`);
  }

  if (!metadata.manifestPath.endsWith('manifest.json')) {
    errors.push(`manifestPath must end with manifest.json for plugin ${metadata.pluginId}`);
  }

  if (!SAFE_PLUGIN_SUBDIR_PATTERN.test(metadata.pluginSubdirectory)) {
    errors.push(
      `pluginSubdirectory must match plugins/<plugin-id> for plugin ${metadata.pluginId}`
    );
  }

  if (!isValidRepositoryUrl(metadata.source.repositoryUrl)) {
    errors.push(`source.repositoryUrl must be a valid https URL for plugin ${metadata.pluginId}`);
  }

  if (!metadata.source.ref.trim()) {
    errors.push(`source.ref is required for plugin ${metadata.pluginId}`);
  }

  if (!hasStringArray(metadata.permissions.permissionKeys)) {
    errors.push(
      `permissions.permissionKeys must be a string array for plugin ${metadata.pluginId}`
    );
  }

  if (!hasStringArray(metadata.permissions.capabilities)) {
    errors.push(`permissions.capabilities must be a string array for plugin ${metadata.pluginId}`);
  }

  if (!hasStringArray(metadata.permissions.scopes)) {
    errors.push(`permissions.scopes must be a string array for plugin ${metadata.pluginId}`);
  }

  if (
    !Number.isInteger(metadata.migrationPolicy.migrationCount) ||
    metadata.migrationPolicy.migrationCount < 0
  ) {
    errors.push(
      `migrationPolicy.migrationCount must be a non-negative integer for plugin ${metadata.pluginId}`
    );
  }

  if (!hasStringArray(metadata.publicRoutes.extensionIds)) {
    errors.push(`publicRoutes.extensionIds must be a string array for plugin ${metadata.pluginId}`);
  }

  if (!hasStringArray(metadata.adminAndApi.adminPageHrefs)) {
    errors.push(
      `adminAndApi.adminPageHrefs must be a string array for plugin ${metadata.pluginId}`
    );
  }

  if (!hasStringArray(metadata.adminAndApi.apiPaths)) {
    errors.push(`adminAndApi.apiPaths must be a string array for plugin ${metadata.pluginId}`);
  }

  if (!Number.isInteger(metadata.settings.count) || metadata.settings.count < 0) {
    errors.push(`settings.count must be a non-negative integer for plugin ${metadata.pluginId}`);
  }

  if (!hasStringArray(metadata.settings.settingKeys)) {
    errors.push(`settings.settingKeys must be a string array for plugin ${metadata.pluginId}`);
  }

  if (!isSafeRelativePath(metadata.documentation.readmePath)) {
    errors.push(
      `documentation.readmePath must be a safe relative path for plugin ${metadata.pluginId}`
    );
  }

  if (!metadata.documentation.readmePath.endsWith('/README.md')) {
    errors.push(
      `documentation.readmePath must reference README.md for plugin ${metadata.pluginId}`
    );
  }

  if (!isSafeRelativePath(metadata.documentation.indexPagePath)) {
    errors.push(
      `documentation.indexPagePath must be a safe relative path for plugin ${metadata.pluginId}`
    );
  }

  if (!metadata.documentation.indexPagePath.endsWith('/index.html')) {
    errors.push(
      `documentation.indexPagePath must reference index.html for plugin ${metadata.pluginId}`
    );
  }

  if (!isSafeRelativePath(metadata.documentation.manifestJsonPath)) {
    errors.push(
      `documentation.manifestJsonPath must be a safe relative path for plugin ${metadata.pluginId}`
    );
  }

  if (!metadata.documentation.manifestJsonPath.endsWith('/manifest.json')) {
    errors.push(
      `documentation.manifestJsonPath must reference manifest.json for plugin ${metadata.pluginId}`
    );
  }

  for (const optionalPath of [
    metadata.documentation.docsPath,
    metadata.documentation.assetsPath,
    metadata.documentation.fixturesPath,
  ]) {
    if (optionalPath && !isSafeRelativePath(optionalPath)) {
      errors.push(
        `documentation optional paths must be safe relative paths for plugin ${metadata.pluginId}`
      );
      break;
    }
  }

  if (metadata.integrity) {
    if (
      metadata.integrity.packageChecksum !== undefined &&
      typeof metadata.integrity.packageChecksum !== 'string'
    ) {
      errors.push(`integrity.packageChecksum must be a string for plugin ${metadata.pluginId}`);
    }

    if (
      metadata.integrity.manifestChecksum !== undefined &&
      typeof metadata.integrity.manifestChecksum !== 'string'
    ) {
      errors.push(`integrity.manifestChecksum must be a string for plugin ${metadata.pluginId}`);
    }

    if (
      metadata.integrity.publisherSignature !== undefined &&
      typeof metadata.integrity.publisherSignature !== 'string'
    ) {
      errors.push(`integrity.publisherSignature must be a string for plugin ${metadata.pluginId}`);
    }

    if (
      metadata.integrity.migrationChecksums !== undefined &&
      (typeof metadata.integrity.migrationChecksums !== 'object' ||
        metadata.integrity.migrationChecksums === null ||
        Array.isArray(metadata.integrity.migrationChecksums))
    ) {
      errors.push(`integrity.migrationChecksums must be an object for plugin ${metadata.pluginId}`);
    }
  }

  return errors;
}

export function validateMarketplaceDirectorySnapshot(
  snapshot: MarketplaceDirectorySnapshot,
  contract: MarketplaceDirectoryContract = DEFAULT_MARKETPLACE_DIRECTORY_CONTRACT
): string[] {
  const errors: string[] = [];

  for (const requiredRootFile of contract.rootFiles) {
    if (!snapshot.rootEntries.includes(requiredRootFile)) {
      errors.push(`root entry ${requiredRootFile} is required`);
    }
  }

  if (!snapshot.rootEntries.includes(contract.pluginsRootDir)) {
    errors.push(`root entry ${contract.pluginsRootDir} is required`);
  }

  for (const [pluginId, entries] of Object.entries(snapshot.plugins)) {
    for (const required of contract.requiredPluginFiles) {
      if (!entries.includes(required)) {
        errors.push(`plugin ${pluginId} is missing required entry ${required}`);
      }
    }
  }

  return errors;
}
