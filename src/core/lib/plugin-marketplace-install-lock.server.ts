import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import type {
  MarketplaceInstallLeaseAcquireOptions,
  MarketplaceInstallLeaseHandle,
  MarketplaceInstallLeaseMetadata,
} from '@core/types/plugin-marketplace-install-lock';

const DEFAULT_LEASE_MS = 30_000;
const DEFAULT_WAIT_TIMEOUT_MS = 30_000;
const DEFAULT_POLL_INTERVAL_MS = 250;
const DEFAULT_HEARTBEAT_MS = 10_000;

function sanitizePluginId(pluginId: string): string {
  const normalized = pluginId.trim();
  if (!/^[a-z0-9][a-z0-9-]{0,119}$/.test(normalized)) {
    throw new Error(`invalid pluginId for install lock scope: ${pluginId}`);
  }
  return normalized;
}

function buildLockDirectory(lockRoot: string, pluginId: string): string {
  return path.resolve(lockRoot, `${pluginId}.lock`);
}

function metadataFilePath(lockDirectory: string): string {
  return path.join(lockDirectory, 'lease.json');
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseIsoTimestamp(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function readLeaseMetadata(
  metadataPath: string
): Promise<MarketplaceInstallLeaseMetadata | null> {
  try {
    const raw = await readFile(metadataPath, 'utf8');
    return JSON.parse(raw) as MarketplaceInstallLeaseMetadata;
  } catch {
    return null;
  }
}

function isExpired(metadata: MarketplaceInstallLeaseMetadata, nowMs: number): boolean {
  const leaseExpiresAt = parseIsoTimestamp(metadata.leaseExpiresAt);
  if (leaseExpiresAt === null) {
    return true;
  }
  return leaseExpiresAt <= nowMs;
}

async function removeLeaseDirectoryIfSafe(lockDirectory: string): Promise<void> {
  const stats = await lstat(lockDirectory).catch(() => null);
  if (!stats) {
    return;
  }

  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error('install lock path must be a real directory');
  }

  await rm(lockDirectory, { recursive: true, force: true });
}

async function ensureLockRootIsSafe(lockRoot: string): Promise<void> {
  const stats = await lstat(lockRoot).catch(() => null);
  if (!stats) {
    return;
  }

  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error('install lock root must be a real directory');
  }
}

function buildLeaseMetadata(options: {
  pluginId: string;
  operationId: string;
  ownerToken: string;
  hostIdentity: string;
  leaseMs: number;
}): MarketplaceInstallLeaseMetadata {
  const createdAt = nowIso();
  const heartbeatAt = createdAt;
  const leaseExpiresAt = new Date(Date.now() + options.leaseMs).toISOString();

  return {
    schemaVersion: 1,
    pluginId: options.pluginId,
    operationId: options.operationId,
    ownerToken: options.ownerToken,
    pid: process.pid,
    hostIdentity: options.hostIdentity,
    createdAt,
    heartbeatAt,
    leaseExpiresAt,
  };
}

async function writeLeaseMetadataAtomic(
  metadataPath: string,
  metadata: MarketplaceInstallLeaseMetadata
): Promise<void> {
  const tempPath = `${metadataPath}.${randomUUID()}.tmp`;
  await writeFile(tempPath, JSON.stringify(metadata, null, 2), { mode: 0o600 });
  await rename(tempPath, metadataPath);
}

export function marketplaceInstallLockRoot(installRoot: string): string {
  return path.resolve(installRoot, '.install-locks');
}

export async function acquireMarketplaceInstallLease(
  options: MarketplaceInstallLeaseAcquireOptions
): Promise<MarketplaceInstallLeaseHandle> {
  const pluginId = sanitizePluginId(options.pluginId);
  const lockRoot = path.resolve(options.lockRoot);
  const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;
  const waitTimeoutMs = options.waitTimeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const heartbeatMs = options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
  const ownerToken = options.ownerToken ?? randomUUID();
  const hostIdentity = options.hostIdentity ?? hostname();
  const startedAtMs = Date.now();

  await ensureLockRootIsSafe(lockRoot);
  await mkdir(lockRoot, { recursive: true, mode: 0o700 });

  const lockDirectory = buildLockDirectory(lockRoot, pluginId);
  const metadataPath = metadataFilePath(lockDirectory);

  while (true) {
    try {
      await mkdir(lockDirectory, { mode: 0o700 });

      const metadata = buildLeaseMetadata({
        pluginId,
        operationId: options.operationId,
        ownerToken,
        hostIdentity,
        leaseMs,
      });
      await writeFile(metadataPath, JSON.stringify(metadata, null, 2), { flag: 'wx', mode: 0o600 });

      let heartbeatTimer: NodeJS.Timeout | null = null;

      const renew = async () => {
        const current = await readLeaseMetadata(metadataPath);
        if (!current || current.ownerToken !== ownerToken) {
          throw new Error('cannot renew install lease: ownership mismatch');
        }

        const next: MarketplaceInstallLeaseMetadata = {
          ...current,
          heartbeatAt: nowIso(),
          leaseExpiresAt: new Date(Date.now() + leaseMs).toISOString(),
        };
        await writeLeaseMetadataAtomic(metadataPath, next);
        handle.metadata = next;
      };

      const release = async () => {
        const current = await readLeaseMetadata(metadataPath);
        if (!current || current.ownerToken !== ownerToken) {
          throw new Error('cannot release install lease: ownership mismatch');
        }
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
        await rm(lockDirectory, { recursive: true, force: true });
      };

      const startHeartbeat = () => {
        if (heartbeatTimer) {
          return;
        }
        heartbeatTimer = setInterval(() => {
          void renew().catch(() => {
            if (heartbeatTimer) {
              clearInterval(heartbeatTimer);
              heartbeatTimer = null;
            }
          });
        }, heartbeatMs);
      };

      const stopHeartbeat = () => {
        if (!heartbeatTimer) {
          return;
        }
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      };

      const handle: MarketplaceInstallLeaseHandle = {
        lockDirectory,
        metadataPath,
        metadata,
        renew,
        release,
        startHeartbeat,
        stopHeartbeat,
      };

      return handle;
    } catch (error) {
      const hasCode = typeof error === 'object' && error !== null && 'code' in error;
      const code = hasCode ? (error as { code?: string }).code : undefined;
      if (code !== 'EEXIST') {
        throw error;
      }

      const existing = await readLeaseMetadata(metadataPath);
      const nowMs = Date.now();
      if (!existing || isExpired(existing, nowMs)) {
        await removeLeaseDirectoryIfSafe(lockDirectory);
        continue;
      }

      if (Date.now() - startedAtMs >= waitTimeoutMs) {
        throw new Error(`install lease timeout for plugin ${pluginId}`);
      }

      await sleep(pollIntervalMs);
    }
  }
}

export async function withMarketplaceInstallLease<T>(
  options: MarketplaceInstallLeaseAcquireOptions,
  work: () => Promise<T>
): Promise<T> {
  const handle = await acquireMarketplaceInstallLease(options);
  handle.startHeartbeat();
  let workError: unknown;
  try {
    return await work();
  } catch (error) {
    workError = error;
    throw error;
  } finally {
    handle.stopHeartbeat();
    try {
      await handle.release();
    } catch (releaseError) {
      if (!workError) {
        throw releaseError;
      }
    }
  }
}
