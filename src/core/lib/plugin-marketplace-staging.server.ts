import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { chmod, mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { valid as isValidSemver } from 'semver';
import type {
  MarketplaceArchiveEntrySummary,
  MarketplaceArchiveInspection,
  MarketplaceArtifactExtractionResult,
  MarketplaceArtifactStagingLimits,
  MarketplaceArtifactStagingOptions,
  MarketplaceStagedPackageValidationSummary,
} from '@core/types/plugin-marketplace-staging';

const TAR_BLOCK_SIZE = 512;
const SUPPORTED_TAR_FILE_ENTRY_TYPES = new Set(['0', '\0']);
const SUPPORTED_TAR_DIRECTORY_ENTRY_TYPES = new Set(['5']);

const DEFAULT_LIMITS: MarketplaceArtifactStagingLimits = {
  maxEntries: 2048,
  maxUncompressedBytes: 100 * 1024 * 1024,
  maxSingleFileBytes: 25 * 1024 * 1024,
  maxPathLength: 255,
  maxCompressionRatio: 50,
};

const ALLOWED_PERMISSION_SCOPES = new Set([
  'admin',
  'public',
  'authenticated',
  'policy-scoped',
  'future',
]);
const MAX_DECLARATION_COUNT = 256;

type ParsedTarEntry = {
  path: string;
  typeFlag: string;
  size: number;
  contentStart: number;
};

function parseOctal(input: Buffer): number {
  const value = input.toString('utf8').replace(/\0/g, '').trim();

  if (!value) {
    return 0;
  }

  return Number.parseInt(value, 8);
}

function decodeTarPath(header: Buffer): string {
  const name = header.subarray(0, 100).toString('utf8').replace(/\0/g, '').trim();

  const prefix = header.subarray(345, 500).toString('utf8').replace(/\0/g, '').trim();

  const joined = prefix ? `${prefix}/${name}` : name;
  return joined.replace(/\\/g, '/');
}

function isZeroBlock(block: Buffer): boolean {
  for (let index = 0; index < block.length; index += 1) {
    if (block[index] !== 0) {
      return false;
    }
  }

  return true;
}

function normalizeArchiveRelativePath(rawPath: string): string {
  const trimmed = rawPath.trim();
  if (!trimmed) {
    throw new Error('archive path is empty');
  }

  if (trimmed.includes('\0')) {
    throw new Error(`archive path contains null byte: ${rawPath}`);
  }

  if (/^[A-Za-z]:/.test(trimmed)) {
    throw new Error(`windows drive path is not allowed: ${rawPath}`);
  }

  if (trimmed.startsWith('\\\\')) {
    throw new Error(`UNC path is not allowed: ${rawPath}`);
  }

  const normalized = path.posix.normalize(trimmed).replace(/^\.\//, '');

  if (!normalized || normalized === '.' || normalized.startsWith('/')) {
    throw new Error(`unsafe archive path: ${rawPath}`);
  }

  const segments = normalized.split('/');
  if (segments.some((segment) => segment === '..') || normalized.includes('\0')) {
    throw new Error(`path traversal is not allowed: ${rawPath}`);
  }

  return normalized;
}

function normalizeDirectoryPath(entryPath: string): string {
  return entryPath.endsWith('/') ? entryPath.slice(0, -1) : entryPath;
}

function validateUniqueNormalizedPaths(entries: ParsedTarEntry[]): void {
  const seenPaths = new Set<string>();
  const filePaths = new Set<string>();
  const directoryPaths = new Set<string>();

  for (const entry of entries) {
    const type = classifyEntry(entry.typeFlag);
    const normalized = type === 'directory' ? normalizeDirectoryPath(entry.path) : entry.path;

    if (seenPaths.has(normalized)) {
      throw new Error(`duplicate normalized archive path is not allowed: ${normalized}`);
    }
    seenPaths.add(normalized);

    if (type === 'file') {
      if (directoryPaths.has(normalized)) {
        throw new Error(`file/directory conflict is not allowed: ${normalized}`);
      }
      filePaths.add(normalized);
    }

    if (type === 'directory') {
      if (filePaths.has(normalized)) {
        throw new Error(`file/directory conflict is not allowed: ${normalized}`);
      }
      directoryPaths.add(normalized);
    }
  }
}

function parseTarEntries(buffer: Buffer): ParsedTarEntry[] {
  const entries: ParsedTarEntry[] = [];
  let offset = 0;

  while (offset + TAR_BLOCK_SIZE <= buffer.length) {
    const header = buffer.subarray(offset, offset + TAR_BLOCK_SIZE);

    if (isZeroBlock(header)) {
      break;
    }

    const entryPath = normalizeArchiveRelativePath(decodeTarPath(header));
    const size = parseOctal(header.subarray(124, 136));
    const typeFlag = String.fromCharCode(header[156] || 0);
    const contentStart = offset + TAR_BLOCK_SIZE;

    if (entryPath.length > DEFAULT_LIMITS.maxPathLength) {
      throw new Error(
        `archive entry path exceeds maximum allowed length: ${entryPath.length} > ${DEFAULT_LIMITS.maxPathLength}`
      );
    }

    entries.push({ path: entryPath, typeFlag, size, contentStart });

    const contentBlocks = Math.ceil(size / TAR_BLOCK_SIZE);
    offset = contentStart + contentBlocks * TAR_BLOCK_SIZE;
  }

  return entries;
}

function classifyEntry(typeFlag: string): MarketplaceArchiveEntrySummary['type'] {
  if (typeFlag === '5') {
    return 'directory';
  }

  if (typeFlag === '0' || typeFlag === '\0') {
    return 'file';
  }

  return 'unsupported';
}

function resolvedLimits(
  options?: MarketplaceArtifactStagingOptions
): MarketplaceArtifactStagingLimits {
  return {
    maxEntries: options?.limits?.maxEntries ?? DEFAULT_LIMITS.maxEntries,
    maxUncompressedBytes:
      options?.limits?.maxUncompressedBytes ?? DEFAULT_LIMITS.maxUncompressedBytes,
    maxSingleFileBytes: options?.limits?.maxSingleFileBytes ?? DEFAULT_LIMITS.maxSingleFileBytes,
    maxPathLength: options?.limits?.maxPathLength ?? DEFAULT_LIMITS.maxPathLength,
    maxCompressionRatio: options?.limits?.maxCompressionRatio ?? DEFAULT_LIMITS.maxCompressionRatio,
  };
}

function assertArchivePathLengths(
  entries: ParsedTarEntry[],
  limits: MarketplaceArtifactStagingLimits
): void {
  for (const entry of entries) {
    if (entry.path.length > limits.maxPathLength) {
      throw new Error(
        `archive entry path exceeds maxPathLength: ${entry.path.length} > ${limits.maxPathLength}`
      );
    }
  }
}

function assertWithinLimits(
  entries: ParsedTarEntry[],
  limits: MarketplaceArtifactStagingLimits
): void {
  if (entries.length > limits.maxEntries) {
    throw new Error(`archive has too many entries: ${entries.length} > ${limits.maxEntries}`);
  }

  let totalUncompressedBytes = 0;
  for (const entry of entries) {
    totalUncompressedBytes += entry.size;

    if (entry.size > limits.maxSingleFileBytes) {
      throw new Error(
        `archive entry exceeds maxSingleFileBytes: ${entry.path} (${entry.size} > ${limits.maxSingleFileBytes})`
      );
    }
  }

  if (totalUncompressedBytes > limits.maxUncompressedBytes) {
    throw new Error(
      `archive exceeds maxUncompressedBytes: ${totalUncompressedBytes} > ${limits.maxUncompressedBytes}`
    );
  }
}

function assertCompressionRatio(
  compressedBytes: number,
  totalUncompressedBytes: number,
  limits: MarketplaceArtifactStagingLimits
): number {
  if (compressedBytes <= 0) {
    throw new Error('compressed artifact size must be greater than zero');
  }

  const ratio = totalUncompressedBytes / compressedBytes;
  if (ratio > limits.maxCompressionRatio) {
    throw new Error(
      `archive compression ratio exceeds maxCompressionRatio: ${ratio.toFixed(2)} > ${limits.maxCompressionRatio}`
    );
  }

  return ratio;
}

function normalizeManifestPluginSubdirectory(pluginSubdirectory: string): string {
  const normalized = pluginSubdirectory.replace(/^\.\//, '').replace(/\/+$/, '');
  if (!normalized.startsWith('plugins/')) {
    throw new Error(`pluginSubdirectory must be under plugins/: ${pluginSubdirectory}`);
  }
  return normalized;
}

function uniqueSortedStringArray(values: unknown[]): string[] {
  return [
    ...new Set(
      values
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean)
    ),
  ].sort();
}

function assertNoDuplicates(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(`${label} contains duplicate value: ${value}`);
    }
    seen.add(value);
  }
}

async function validateExtractedPackage(
  stagingDirectory: string,
  extractedFiles: string[]
): Promise<MarketplaceStagedPackageValidationSummary> {
  const candidateManifestPaths = extractedFiles.filter((relativePath) =>
    relativePath.endsWith('/manifest.json')
  );

  if (candidateManifestPaths.length !== 1) {
    throw new Error(
      `expected exactly one manifest.json in staged package, found ${candidateManifestPaths.length}`
    );
  }

  const manifestRelativePath = candidateManifestPaths[0] as string;
  const manifestAbsolutePath = path.resolve(stagingDirectory, manifestRelativePath);
  const manifestRaw = await readFile(manifestAbsolutePath, 'utf8');

  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(manifestRaw) as Record<string, unknown>;
  } catch {
    throw new Error('manifest.json must be valid JSON');
  }

  const pluginId = typeof manifest.id === 'string' ? manifest.id.trim() : '';
  const version = typeof manifest.version === 'string' ? manifest.version.trim() : '';
  const pluginSubdirectory =
    typeof manifest.pluginSubdirectory === 'string' ? manifest.pluginSubdirectory.trim() : '';

  if (!pluginId || !/^[a-z0-9][a-z0-9-]{0,119}$/.test(pluginId)) {
    throw new Error('manifest.id must be a valid kebab-case plugin identifier');
  }

  if (!version || !isValidSemver(version)) {
    throw new Error('manifest.version must be valid semver');
  }

  const normalizedSubdirectory = normalizeManifestPluginSubdirectory(pluginSubdirectory);
  const expectedManifestRelativePath = `${normalizedSubdirectory}/manifest.json`;
  if (manifestRelativePath !== expectedManifestRelativePath) {
    throw new Error(
      `manifest path does not match manifest.pluginSubdirectory: expected ${expectedManifestRelativePath}, found ${manifestRelativePath}`
    );
  }

  const lifecycle =
    typeof manifest.lifecycle === 'object' && manifest.lifecycle !== null
      ? (manifest.lifecycle as Record<string, unknown>)
      : undefined;
  const lifecycleDeclarationKeys = lifecycle
    ? Object.keys(lifecycle).filter((key) => {
        const value = lifecycle[key];
        return typeof value === 'string' || typeof value === 'boolean';
      })
    : [];

  const migrations = Array.isArray(manifest.migrations) ? (manifest.migrations as unknown[]) : [];
  const permissions = Array.isArray(manifest.permissions)
    ? (manifest.permissions as Record<string, unknown>[])
    : [];
  const settings = Array.isArray(manifest.settings)
    ? (manifest.settings as Record<string, unknown>[])
    : [];

  if (permissions.length > MAX_DECLARATION_COUNT) {
    throw new Error(
      `manifest.permissions exceeds maximum declaration count: ${permissions.length} > ${MAX_DECLARATION_COUNT}`
    );
  }
  if (settings.length > MAX_DECLARATION_COUNT) {
    throw new Error(
      `manifest.settings exceeds maximum declaration count: ${settings.length} > ${MAX_DECLARATION_COUNT}`
    );
  }

  const permissionKeys = uniqueSortedStringArray(
    permissions
      .map((permission) => permission.key)
      .filter((value): value is string => typeof value === 'string')
  );
  const capabilities = uniqueSortedStringArray(
    permissions
      .map((permission) => permission.capability)
      .filter((value): value is string => typeof value === 'string')
  );
  const scopes = uniqueSortedStringArray(
    permissions
      .map((permission) => permission.scope)
      .filter((value): value is string => typeof value === 'string')
  );
  const publicRouteExtensionIds = uniqueSortedStringArray(
    Array.isArray(manifest.publicRouteExtensionIds)
      ? (manifest.publicRouteExtensionIds as unknown[])
      : []
  );
  const adminPageHrefs = uniqueSortedStringArray(
    Array.isArray(manifest.adminPageHrefs) ? (manifest.adminPageHrefs as unknown[]) : []
  );
  const apiPaths = uniqueSortedStringArray(
    Array.isArray(manifest.apiPaths) ? (manifest.apiPaths as unknown[]) : []
  );
  const settingKeys = uniqueSortedStringArray(
    settings
      .map((setting) => setting.key)
      .filter((value): value is string => typeof value === 'string')
  );

  assertNoDuplicates(
    permissions
      .map((permission) => permission.key)
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter(Boolean),
    'manifest.permissions keys'
  );
  assertNoDuplicates(
    settings
      .map((setting) => setting.key)
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter(Boolean),
    'manifest.settings keys'
  );
  assertNoDuplicates(publicRouteExtensionIds, 'manifest.publicRouteExtensionIds');
  assertNoDuplicates(adminPageHrefs, 'manifest.adminPageHrefs');
  assertNoDuplicates(apiPaths, 'manifest.apiPaths');

  for (const scope of scopes) {
    if (!ALLOWED_PERMISSION_SCOPES.has(scope)) {
      throw new Error(`manifest.permissions contains unknown scope: ${scope}`);
    }
  }

  return {
    packageRoot: normalizedSubdirectory,
    manifestRelativePath,
    pluginId,
    version,
    capabilitySnapshot: {
      permissionKeys,
      capabilities,
      scopes,
      publicRouteExtensionIds,
      adminPageHrefs,
      apiPaths,
      settingKeys,
    },
    hasLifecycleDeclarations: lifecycleDeclarationKeys.length > 0,
    hasMigrationDeclarations: migrations.length > 0,
    lifecycleDeclarationKeys,
    migrationCount: migrations.length,
  };
}

export async function computeArtifactSha256(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  return createHash('sha256').update(content).digest('hex');
}

export async function inspectTarGzArtifact(
  artifactPath: string,
  options?: MarketplaceArtifactStagingOptions
): Promise<MarketplaceArchiveInspection> {
  const compressed = await readFile(artifactPath);
  const tarBuffer = gunzipSync(compressed);
  const entries = parseTarEntries(tarBuffer);
  const limits = resolvedLimits(options);

  assertArchivePathLengths(entries, limits);
  validateUniqueNormalizedPaths(entries);
  assertWithinLimits(entries, limits);

  const summaryEntries: MarketplaceArchiveEntrySummary[] = entries.map((entry) => ({
    path: entry.path,
    type: classifyEntry(entry.typeFlag),
    size: entry.size,
  }));

  const totalUncompressedBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
  const compressionRatio = assertCompressionRatio(
    compressed.length,
    totalUncompressedBytes,
    limits
  );

  return {
    entries: summaryEntries,
    totalEntries: entries.length,
    totalUncompressedBytes,
    compressedBytes: compressed.length,
    compressionRatio,
  };
}

export async function extractTarGzToStaging(
  artifactPath: string,
  options?: MarketplaceArtifactStagingOptions
): Promise<MarketplaceArtifactExtractionResult> {
  const compressed = await readFile(artifactPath);
  const tarBuffer = gunzipSync(compressed);
  const entries = parseTarEntries(tarBuffer);
  const limits = resolvedLimits(options);

  assertArchivePathLengths(entries, limits);
  validateUniqueNormalizedPaths(entries);
  assertWithinLimits(entries, limits);
  const totalUncompressedBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
  const compressionRatio = assertCompressionRatio(
    compressed.length,
    totalUncompressedBytes,
    limits
  );

  const stagingBase = options?.baseTempDir ?? os.tmpdir();
  const stagingDirectory = await mkdtemp(path.join(stagingBase, 'devholm-plugin-staging-'));
  await chmod(stagingDirectory, 0o700);

  const extractedFiles: string[] = [];
  const extractedDirectories: string[] = [];

  try {
    // Create all directories first so file writes cannot partially establish structure.
    for (const entry of entries) {
      if (!SUPPORTED_TAR_DIRECTORY_ENTRY_TYPES.has(entry.typeFlag)) {
        continue;
      }

      const absolutePath = path.resolve(stagingDirectory, entry.path);
      const stagingWithSeparator = `${stagingDirectory}${path.sep}`;
      if (!(absolutePath === stagingDirectory || absolutePath.startsWith(stagingWithSeparator))) {
        throw new Error(`path escapes staging directory: ${entry.path}`);
      }

      await mkdir(absolutePath, { recursive: true, mode: 0o700 });
      extractedDirectories.push(entry.path);
    }

    for (const entry of entries) {
      const absolutePath = path.resolve(stagingDirectory, entry.path);
      const stagingWithSeparator = `${stagingDirectory}${path.sep}`;

      if (!(absolutePath === stagingDirectory || absolutePath.startsWith(stagingWithSeparator))) {
        throw new Error(`path escapes staging directory: ${entry.path}`);
      }

      const entryType = classifyEntry(entry.typeFlag);

      if (entryType === 'unsupported') {
        throw new Error(
          `unsupported tar entry type for ${entry.path} (typeFlag=${entry.typeFlag})`
        );
      }

      if (entryType === 'directory') {
        continue;
      }

      if (!SUPPORTED_TAR_FILE_ENTRY_TYPES.has(entry.typeFlag)) {
        throw new Error(
          `unsupported non-file tar entry for ${entry.path} (typeFlag=${entry.typeFlag})`
        );
      }

      await mkdir(path.dirname(absolutePath), { recursive: true, mode: 0o700 });

      const content = tarBuffer.subarray(entry.contentStart, entry.contentStart + entry.size);
      await writeFile(absolutePath, content, { mode: 0o600 });
      extractedFiles.push(entry.path);
    }

    // Enforce staged root contents and package identity after extraction but before returning ready status.
    const rootEntries = await readdir(stagingDirectory);
    if (!rootEntries.includes('plugins')) {
      throw new Error('staged package must contain plugins/ root directory');
    }

    const pluginsStat = await stat(path.join(stagingDirectory, 'plugins'));
    if (!pluginsStat.isDirectory()) {
      throw new Error('staged plugins path must be a directory');
    }

    const validation = await validateExtractedPackage(stagingDirectory, extractedFiles);

    return {
      stagingDirectory,
      extractedFiles,
      extractedDirectories,
      totalUncompressedBytes,
      totalEntries: entries.length,
      compressedBytes: compressed.length,
      compressionRatio,
      validation,
    };
  } catch (error) {
    // Best-effort cleanup ensures no partial extraction state is left behind.
    await rm(stagingDirectory, { recursive: true, force: true });
    throw error;
  }
}
