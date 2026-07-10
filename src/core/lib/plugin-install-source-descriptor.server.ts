import { valid as isValidSemver } from 'semver';
import type {
  MarketplaceInstallSourceDescriptorInput,
  MarketplaceInstallSourceDescriptorParseResult,
} from '@core/types/plugin-marketplace-contract';

const SAFE_REF_PATTERN = /^[A-Za-z0-9._/-]+$/;
const SAFE_RELATIVE_PATH_PATTERN = /^[A-Za-z0-9._/-]+$/;
const SAFE_PLUGIN_SUBDIR_PATTERN = /^plugins\/[a-z0-9-]+(?:\/[A-Za-z0-9._-]+)*$/;
const SAFE_PLUGIN_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,119}$/;
const SAFE_OWNER_REPO_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/;

function normalizedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

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

export function normalizeGitHubRepoUrl(repoUrl: string): string | null {
  const trimmed = normalizedString(repoUrl);

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== 'github.com') {
    return null;
  }

  if (parsed.search || parsed.hash) {
    return null;
  }

  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length !== 2) {
    return null;
  }

  const owner = segments[0];
  const repo = segments[1].endsWith('.git') ? segments[1].slice(0, -4) : segments[1];
  if (!owner || !repo) {
    return null;
  }

  if (!SAFE_OWNER_REPO_SEGMENT_PATTERN.test(owner) || !SAFE_OWNER_REPO_SEGMENT_PATTERN.test(repo)) {
    return null;
  }

  return `https://github.com/${owner}/${repo}`;
}

export function normalizeMarketplaceInstallSourceDescriptor(
  input: MarketplaceInstallSourceDescriptorInput
): MarketplaceInstallSourceDescriptorInput {
  return {
    sourceType: input.sourceType,
    repoUrl: normalizedString(input.repoUrl),
    ref: normalizedString(input.ref),
    pluginSubdirectory: normalizedString(input.pluginSubdirectory),
    manifestPath: normalizedString(input.manifestPath),
    expectedPluginId: normalizedString(input.expectedPluginId),
    expectedVersion: normalizedString(input.expectedVersion),
    integrity: input.integrity,
    trustPolicy: input.trustPolicy
      ? {
          ...input.trustPolicy,
          notes: normalizedString(input.trustPolicy.notes),
          requiredApprovers: input.trustPolicy.requiredApprovers?.map((value) => value.trim()),
        }
      : undefined,
  };
}

export function validateMarketplaceInstallSourceDescriptor(
  input: MarketplaceInstallSourceDescriptorInput
): string[] {
  const descriptor = normalizeMarketplaceInstallSourceDescriptor(input);
  const errors: string[] = [];

  if (descriptor.sourceType !== 'marketplace') {
    errors.push('sourceType must be marketplace');
  }

  const normalizedRepoUrl = normalizeGitHubRepoUrl(descriptor.repoUrl ?? '');
  if (!normalizedRepoUrl) {
    errors.push('repoUrl must be a canonical https GitHub repository URL');
  }

  const ref = descriptor.ref ?? '';
  if (!ref) {
    errors.push('ref is required; no implicit default is allowed');
  } else if (
    !SAFE_REF_PATTERN.test(ref) ||
    ref.includes('..') ||
    ref.startsWith('/') ||
    ref.includes('\\')
  ) {
    errors.push('ref contains unsafe characters or traversal patterns');
  }

  const pluginSubdirectory = descriptor.pluginSubdirectory ?? '';
  if (!pluginSubdirectory) {
    errors.push('pluginSubdirectory is required');
  } else if (
    !SAFE_PLUGIN_SUBDIR_PATTERN.test(pluginSubdirectory) ||
    !isSafeRelativePath(pluginSubdirectory)
  ) {
    errors.push('pluginSubdirectory must be a safe plugins/<plugin-id> relative path');
  }

  const manifestPath = descriptor.manifestPath ?? '';
  if (!manifestPath) {
    errors.push('manifestPath is required');
  } else if (!isSafeRelativePath(manifestPath) || !manifestPath.endsWith('manifest.json')) {
    errors.push('manifestPath must be a safe relative path ending in manifest.json');
  }

  const expectedPluginId = descriptor.expectedPluginId ?? '';
  if (!expectedPluginId) {
    errors.push('expectedPluginId is required');
  } else if (!SAFE_PLUGIN_ID_PATTERN.test(expectedPluginId)) {
    errors.push('expectedPluginId must be a kebab-case plugin identifier');
  }

  const expectedVersion = descriptor.expectedVersion ?? '';
  if (!expectedVersion) {
    errors.push('expectedVersion is required');
  } else if (!isValidSemver(expectedVersion)) {
    errors.push('expectedVersion must be valid semver');
  }

  if (descriptor.integrity) {
    if (
      descriptor.integrity.packageChecksum !== undefined &&
      typeof descriptor.integrity.packageChecksum !== 'string'
    ) {
      errors.push('integrity.packageChecksum must be a string');
    }

    if (
      descriptor.integrity.manifestChecksum !== undefined &&
      typeof descriptor.integrity.manifestChecksum !== 'string'
    ) {
      errors.push('integrity.manifestChecksum must be a string');
    }

    if (
      descriptor.integrity.publisherSignature !== undefined &&
      typeof descriptor.integrity.publisherSignature !== 'string'
    ) {
      errors.push('integrity.publisherSignature must be a string');
    }

    if (
      descriptor.integrity.migrationChecksums !== undefined &&
      (typeof descriptor.integrity.migrationChecksums !== 'object' ||
        descriptor.integrity.migrationChecksums === null ||
        Array.isArray(descriptor.integrity.migrationChecksums))
    ) {
      errors.push('integrity.migrationChecksums must be an object');
    }
  }

  if (descriptor.trustPolicy?.requiredApprovers) {
    if (!Array.isArray(descriptor.trustPolicy.requiredApprovers)) {
      errors.push('trustPolicy.requiredApprovers must be an array of strings');
    } else if (descriptor.trustPolicy.requiredApprovers.some((value) => !value || !value.trim())) {
      errors.push('trustPolicy.requiredApprovers must not contain empty values');
    }
  }

  return errors;
}

export function parseMarketplaceInstallSourceDescriptor(
  input: MarketplaceInstallSourceDescriptorInput
): MarketplaceInstallSourceDescriptorParseResult {
  const normalized = normalizeMarketplaceInstallSourceDescriptor(input);
  const errors = validateMarketplaceInstallSourceDescriptor(normalized);

  if (errors.length > 0) {
    return { descriptor: null, errors };
  }

  return {
    descriptor: {
      sourceType: 'marketplace',
      repoUrl: normalizeGitHubRepoUrl(normalized.repoUrl ?? '') as string,
      ref: normalized.ref as string,
      pluginSubdirectory: normalized.pluginSubdirectory as string,
      manifestPath: normalized.manifestPath as string,
      expectedPluginId: normalized.expectedPluginId as string,
      expectedVersion: normalized.expectedVersion as string,
      integrity: normalized.integrity,
      trustPolicy: normalized.trustPolicy,
    },
    errors: [],
  };
}
