import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type {
  MarketplaceArchiveEntrySummary,
  MarketplaceArchiveInspection,
  MarketplaceArtifactExtractionResult,
  MarketplaceArtifactStagingLimits,
  MarketplaceArtifactStagingOptions,
} from '@core/types/plugin-marketplace-staging';

const TAR_BLOCK_SIZE = 512;

const DEFAULT_LIMITS: MarketplaceArtifactStagingLimits = {
  maxEntries: 2048,
  maxUncompressedBytes: 100 * 1024 * 1024,
  maxSingleFileBytes: 25 * 1024 * 1024,
};

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
  };
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

  assertWithinLimits(entries, limits);

  const summaryEntries: MarketplaceArchiveEntrySummary[] = entries.map((entry) => ({
    path: entry.path,
    type: classifyEntry(entry.typeFlag),
    size: entry.size,
  }));

  const totalUncompressedBytes = entries.reduce((sum, entry) => sum + entry.size, 0);

  return {
    entries: summaryEntries,
    totalEntries: entries.length,
    totalUncompressedBytes,
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

  assertWithinLimits(entries, limits);

  const stagingBase = options?.baseTempDir ?? os.tmpdir();
  const stagingDirectory = await mkdtemp(path.join(stagingBase, 'devholm-plugin-staging-'));

  const extractedFiles: string[] = [];
  const extractedDirectories: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.resolve(stagingDirectory, entry.path);
    const stagingWithSeparator = `${stagingDirectory}${path.sep}`;

    if (!(absolutePath === stagingDirectory || absolutePath.startsWith(stagingWithSeparator))) {
      throw new Error(`path escapes staging directory: ${entry.path}`);
    }

    const entryType = classifyEntry(entry.typeFlag);

    if (entryType === 'unsupported') {
      throw new Error(`unsupported tar entry type for ${entry.path} (typeFlag=${entry.typeFlag})`);
    }

    if (entryType === 'directory') {
      await mkdir(absolutePath, { recursive: true });
      extractedDirectories.push(entry.path);
      continue;
    }

    await mkdir(path.dirname(absolutePath), { recursive: true });

    const content = tarBuffer.subarray(entry.contentStart, entry.contentStart + entry.size);
    await writeFile(absolutePath, content);
    extractedFiles.push(entry.path);
  }

  const totalUncompressedBytes = entries.reduce((sum, entry) => sum + entry.size, 0);

  return {
    stagingDirectory,
    extractedFiles,
    extractedDirectories,
    totalUncompressedBytes,
    totalEntries: entries.length,
  };
}
