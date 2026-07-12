import { createHash, randomUUID } from 'node:crypto';
import { lookup as dnsLookup } from 'node:dns/promises';
import { createWriteStream } from 'node:fs';
import { access, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import type {
  MarketplaceArtifactAcquisitionInput,
  MarketplaceArtifactAcquisitionPolicy,
  MarketplaceArtifactAcquisitionResult,
} from '@core/types/plugin-marketplace-acquisition';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const DEFAULT_POLICY: MarketplaceArtifactAcquisitionPolicy = {
  allowedHosts: ['github.com', 'objects.githubusercontent.com'],
  allowPrivateAddressHosts: [],
  allowedPorts: [443],
  maxCompressedBytes: 100 * 1024 * 1024,
  requestTimeoutMs: 30_000,
  connectTimeoutMs: 10_000,
  maxRedirects: 5,
  maxArtifactAgeMs: 30 * 24 * 60 * 60 * 1000,
  maxCacheBytes: 2 * 1024 * 1024 * 1024,
};

const DEFAULT_CACHE_ROOT = path.resolve(process.cwd(), 'generated/plugins/marketplace-cache');
const METADATA_SERVICE_V4 = new Set(['169.254.169.254']);
const METADATA_SERVICE_V6 = new Set(['fd00:ec2::254', 'fe80::a9fe:a9fe']);

function normalizeHostname(value: string): string {
  return value.trim().toLowerCase().replace(/\.+$/, '');
}

function normalizeSha256(value: string | undefined, label: string): string {
  const normalized = (value ?? '').trim().toLowerCase();
  if (!SHA256_PATTERN.test(normalized)) {
    throw new Error(`${label} must be a lowercase 64-character SHA-256 digest`);
  }
  return normalized;
}

function normalizePolicy(
  overrides?: Partial<MarketplaceArtifactAcquisitionPolicy>
): MarketplaceArtifactAcquisitionPolicy {
  return {
    ...DEFAULT_POLICY,
    ...overrides,
    allowedHosts: (overrides?.allowedHosts ?? DEFAULT_POLICY.allowedHosts).map((value) =>
      normalizeHostname(value)
    ),
    allowPrivateAddressHosts: (
      overrides?.allowPrivateAddressHosts ?? DEFAULT_POLICY.allowPrivateAddressHosts
    ).map((value) => normalizeHostname(value)),
    allowedPorts: [...(overrides?.allowedPorts ?? DEFAULT_POLICY.allowedPorts)],
  };
}

function parseAndValidateUrl(
  rawUrl: string,
  policy: MarketplaceArtifactAcquisitionPolicy
): { url: URL; normalizedHost: string } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('artifact URL must be a valid absolute URL');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('artifact URL must use HTTPS');
  }

  if (parsed.username || parsed.password) {
    throw new Error('artifact URL must not include embedded credentials');
  }

  if (parsed.hash) {
    throw new Error('artifact URL must not include fragments');
  }

  const hostname = normalizeHostname(parsed.hostname);
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.local')) {
    throw new Error(`artifact host is not approved by policy: ${hostname || '<empty-host>'}`);
  }

  if (!policy.allowedHosts.includes(hostname)) {
    throw new Error(`artifact host is not approved by policy: ${hostname}`);
  }

  const port = parsed.port ? Number(parsed.port) : 443;
  if (!Number.isInteger(port) || !policy.allowedPorts.includes(port)) {
    throw new Error(`artifact port is not approved by policy: ${port}`);
  }

  return { url: parsed, normalizedHost: hostname };
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map((value) => Number(value));
  if (
    parts.length !== 4 ||
    parts.some((value) => Number.isNaN(value) || value < 0 || value > 255)
  ) {
    return true;
  }

  if (parts[0] === 10) return true;
  if (parts[0] === 127) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
  if (parts[0] === 0) return true;
  if (parts[0] >= 224) return true;
  if (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)) return true;
  if (parts[0] === 192 && parts[1] === 0 && parts[2] === 0) return true;
  if (parts[0] === 192 && parts[1] === 0 && parts[2] === 2) return true;
  if (parts[0] === 198 && parts[1] === 51 && parts[2] === 100) return true;
  if (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) return true;
  if (parts[0] === 192 && parts[1] === 88 && parts[2] === 99) return true;
  if (parts[0] === 255 && parts[1] === 255 && parts[2] === 255 && parts[3] === 255) return true;
  return false;
}

function isBlockedIPv6(ip: string): boolean {
  const normalized = normalizeHostname(ip);
  if (normalized === '::1' || normalized === '::') return true;
  if (normalized.startsWith('ff')) return true;
  if (normalized.startsWith('fe80:')) return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (normalized.startsWith('2001:db8:')) return true;
  if (normalized.startsWith('64:ff9b:')) return true;
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.replace('::ffff:', '');
    return isPrivateIPv4(mapped);
  }
  return false;
}

async function assertResolvableToPublicAddress(
  hostname: string,
  policy: MarketplaceArtifactAcquisitionPolicy
): Promise<void> {
  if (policy.allowPrivateAddressHosts.includes(hostname)) {
    return;
  }

  const results = await dnsLookup(hostname, { all: true, verbatim: true }).catch(() => []);
  if (results.length === 0) {
    throw new Error(`artifact host failed DNS resolution: ${hostname}`);
  }

  for (const result of results) {
    const address = result.address.toLowerCase();
    if (result.family === 4) {
      if (METADATA_SERVICE_V4.has(address) || isPrivateIPv4(address)) {
        throw new Error(`artifact host resolved to blocked IPv4 address: ${address}`);
      }
      continue;
    }

    if (METADATA_SERVICE_V6.has(address) || isBlockedIPv6(address)) {
      throw new Error(`artifact host resolved to blocked IPv6 address: ${address}`);
    }
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function computeFileSha256(filePath: string): Promise<string> {
  const data = await readFile(filePath);
  return createHash('sha256').update(data).digest('hex');
}

async function computeCacheUsageBytes(cacheRoot: string): Promise<number> {
  const shaRoot = path.join(cacheRoot, 'sha256');
  if (!(await fileExists(shaRoot))) {
    return 0;
  }

  let total = 0;
  const directories = await readFileDirectorySafe(shaRoot);
  for (const dirName of directories) {
    const digestDir = path.join(shaRoot, dirName);
    const files = await readFileDirectorySafe(digestDir);
    for (const fileName of files) {
      if (!fileName.endsWith('.tar.gz')) {
        continue;
      }
      const fileStats = await stat(path.join(digestDir, fileName));
      total += fileStats.size;
    }
  }

  return total;
}

async function readFileDirectorySafe(dirPath: string): Promise<string[]> {
  const entries = await import('node:fs/promises')
    .then((mod) => mod.readdir(dirPath))
    .catch(() => []);
  return entries;
}

async function ensureCachePaths(cacheRoot: string): Promise<void> {
  await mkdir(path.join(cacheRoot, 'partials'), { recursive: true, mode: 0o700 });
  await mkdir(path.join(cacheRoot, 'sha256'), { recursive: true, mode: 0o700 });
}

function digestCachePath(cacheRoot: string, sha256: string): string {
  const prefix = sha256.slice(0, 2);
  return path.join(cacheRoot, 'sha256', prefix, `${sha256}.tar.gz`);
}

function digestMetadataPath(cacheRoot: string, sha256: string): string {
  const prefix = sha256.slice(0, 2);
  return path.join(cacheRoot, 'sha256', prefix, `${sha256}.json`);
}

async function writeCacheMetadata(
  cacheRoot: string,
  sha256: string,
  payload: Record<string, unknown>
): Promise<void> {
  const metadataPath = digestMetadataPath(cacheRoot, sha256);
  await mkdir(path.dirname(metadataPath), { recursive: true, mode: 0o700 });
  await writeFile(metadataPath, JSON.stringify(payload, null, 2), { mode: 0o600 });
}

async function tryServeValidCache(
  cacheRoot: string,
  expectedSha256: string,
  expectedVersion: string,
  artifactUrl: string,
  approvedHost: string,
  policy: MarketplaceArtifactAcquisitionPolicy,
  startedAt: number
): Promise<MarketplaceArtifactAcquisitionResult | null> {
  const cachePath = digestCachePath(cacheRoot, expectedSha256);
  if (!(await fileExists(cachePath))) {
    return null;
  }

  const digest = await computeFileSha256(cachePath);
  if (digest !== expectedSha256) {
    await rm(cachePath, { force: true });
    await rm(digestMetadataPath(cacheRoot, expectedSha256), { force: true });
    return null;
  }

  const fileStats = await stat(cachePath);
  const ageMs = Date.now() - fileStats.mtime.getTime();
  if (ageMs > policy.maxArtifactAgeMs) {
    await rm(cachePath, { force: true });
    await rm(digestMetadataPath(cacheRoot, expectedSha256), { force: true });
    return null;
  }

  await writeCacheMetadata(cacheRoot, expectedSha256, {
    artifactUrl,
    sha256: expectedSha256,
    bytes: fileStats.size,
    cachedAt: fileStats.birthtime.toISOString(),
    lastAccessedAt: new Date().toISOString(),
    source: 'cache',
  });

  return {
    artifactUrl,
    approvedHost,
    expectedSha256,
    verifiedSha256: expectedSha256,
    expectedVersion,
    downloadedBytes: fileStats.size,
    cacheKey: expectedSha256,
    cachePath,
    source: 'cache',
    redirectChain: [artifactUrl],
    durationMs: Date.now() - startedAt,
    warnings: [],
    blockers: [],
    readyForStaging: true,
  };
}

export async function acquireFirstPartyMarketplaceArtifact(
  input: MarketplaceArtifactAcquisitionInput
): Promise<MarketplaceArtifactAcquisitionResult> {
  const startedAt = Date.now();
  const policy = normalizePolicy(input.policyOverrides);
  const expectedSha256 = normalizeSha256(input.expectedSha256, 'expectedSha256');

  const firstUrl = parseAndValidateUrl(input.artifactUrl, policy);
  await assertResolvableToPublicAddress(firstUrl.normalizedHost, policy);

  const cacheRoot = path.resolve(input.cacheRootDir ?? DEFAULT_CACHE_ROOT);
  await ensureCachePaths(cacheRoot);

  const cached = await tryServeValidCache(
    cacheRoot,
    expectedSha256,
    input.expectedVersion,
    input.artifactUrl,
    firstUrl.normalizedHost,
    policy,
    startedAt
  );
  if (cached) {
    return cached;
  }

  if (input.offlineOnly) {
    return {
      artifactUrl: input.artifactUrl,
      approvedHost: firstUrl.normalizedHost,
      expectedSha256,
      verifiedSha256: '',
      expectedVersion: input.expectedVersion,
      downloadedBytes: 0,
      cacheKey: expectedSha256,
      cachePath: digestCachePath(cacheRoot, expectedSha256),
      source: 'network',
      redirectChain: [input.artifactUrl],
      durationMs: Date.now() - startedAt,
      warnings: [],
      blockers: ['offline mode enabled and no valid cached artifact is available'],
      readyForStaging: false,
    };
  }

  const partialPath = path.join(cacheRoot, 'partials', `${randomUUID()}.partial`);
  const redirectChain = [input.artifactUrl];
  const warnings: string[] = [];
  if (policy.connectTimeoutMs > 0) {
    warnings.push('connectTimeoutMs is advisory; requestTimeoutMs is enforced in current runtime');
  }
  warnings.push(
    'DNS rebinding risk is mitigated by pre-request DNS/IP validation but cannot be eliminated with current fetch connection binding semantics'
  );

  let currentUrl = firstUrl.url;
  let currentHost = firstUrl.normalizedHost;
  let response: Response | null = null;
  const requestController = new AbortController();
  const requestTimeout = setTimeout(() => requestController.abort(), policy.requestTimeoutMs);

  try {
    for (let redirectCount = 0; redirectCount <= policy.maxRedirects; redirectCount += 1) {
      await assertResolvableToPublicAddress(currentHost, policy);

      response = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: requestController.signal,
        headers: {
          'accept-encoding': 'identity',
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          throw new Error('redirect response is missing location header');
        }

        if (redirectCount === policy.maxRedirects) {
          throw new Error('artifact redirect chain exceeded policy maxRedirects');
        }

        const redirected = new URL(location, currentUrl);
        const parsedRedirect = parseAndValidateUrl(redirected.toString(), policy);
        currentUrl = parsedRedirect.url;
        currentHost = parsedRedirect.normalizedHost;
        redirectChain.push(currentUrl.toString());
        continue;
      }

      break;
    }

    if (!response || !response.ok) {
      throw new Error(`artifact request failed with status ${response?.status ?? 'unknown'}`);
    }

    const contentLengthHeader = response.headers.get('content-length');
    if (contentLengthHeader) {
      const contentLength = Number(contentLengthHeader);
      if (!Number.isFinite(contentLength) || contentLength < 0) {
        throw new Error('content-length header is invalid');
      }
      if (contentLength > policy.maxCompressedBytes) {
        throw new Error('artifact content-length exceeds configured maximum');
      }
    }

    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (
      contentType &&
      !contentType.includes('application/gzip') &&
      !contentType.includes('application/x-gzip') &&
      !contentType.includes('application/octet-stream')
    ) {
      throw new Error(`artifact content-type is not allowed: ${contentType}`);
    }

    if (!response.body) {
      throw new Error('artifact response body is empty');
    }

    const writer = createWriteStream(partialPath, { mode: 0o600 });
    const sha = createHash('sha256');
    let written = 0;
    const reader = response.body.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        const chunk = Buffer.from(value);
        written += chunk.length;
        if (written > policy.maxCompressedBytes) {
          requestController.abort();
          throw new Error('artifact streamed size exceeds configured maximum');
        }

        sha.update(chunk);
        await new Promise<void>((resolve, reject) => {
          writer.write(chunk, (error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        });
      }

      await new Promise<void>((resolve, reject) => {
        writer.end((error?: Error | null) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    } catch (error) {
      writer.destroy();
      throw error;
    }

    if (written > policy.maxCompressedBytes) {
      throw new Error('artifact streamed size exceeds configured maximum');
    }

    const verifiedSha256 = sha.digest('hex');
    if (verifiedSha256 !== expectedSha256) {
      throw new Error(
        `artifact checksum mismatch: expected ${expectedSha256}, got ${verifiedSha256}`
      );
    }

    const cachePath = digestCachePath(cacheRoot, expectedSha256);
    await mkdir(path.dirname(cachePath), { recursive: true, mode: 0o700 });

    if (!(await fileExists(cachePath))) {
      const promotedPath = `${cachePath}.${randomUUID()}.tmp`;
      await rename(partialPath, promotedPath);
      try {
        await rename(promotedPath, cachePath);
      } catch (error) {
        const hasCode = typeof error === 'object' && error !== null && 'code' in error;
        const code = hasCode ? (error as { code?: string }).code : undefined;
        if (code !== 'EEXIST') {
          throw error;
        }
        await rm(promotedPath, { force: true });
      }
    } else {
      await rm(partialPath, { force: true });
    }

    const usageBytes = await computeCacheUsageBytes(cacheRoot);
    if (usageBytes > policy.maxCacheBytes) {
      warnings.push('cache size exceeds policy maxCacheBytes; manual cleanup may be required');
    }

    const cacheStats = await stat(cachePath);
    await writeCacheMetadata(cacheRoot, expectedSha256, {
      artifactUrl: currentUrl.toString(),
      sha256: expectedSha256,
      bytes: cacheStats.size,
      cachedAt: cacheStats.birthtime.toISOString(),
      lastAccessedAt: new Date().toISOString(),
      source: 'network',
      redirectChain,
    });

    return {
      artifactUrl: input.artifactUrl,
      approvedHost: currentHost,
      expectedSha256,
      verifiedSha256: expectedSha256,
      expectedVersion: input.expectedVersion,
      downloadedBytes: cacheStats.size,
      cacheKey: expectedSha256,
      cachePath,
      source: 'network',
      redirectChain,
      durationMs: Date.now() - startedAt,
      warnings,
      blockers: [],
      readyForStaging: true,
    };
  } catch (error) {
    await rm(partialPath, { force: true });
    throw error;
  } finally {
    clearTimeout(requestTimeout);
  }
}
