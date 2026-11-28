import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import {
  acquireMarketplaceInstallLease,
  marketplaceInstallLockRoot,
} from '@core/lib/plugin-marketplace-install-lock.server';

function startLockChild(args: {
  installRoot: string;
  operationId: string;
  leaseMs: number;
  releaseOnExit: boolean;
}) {
  const helperPath = path.resolve(
    process.cwd(),
    'src/test/helpers/marketplace-install-lock-child.ts'
  );
  const child = spawn(
    process.execPath,
    [
      '--import',
      'tsx',
      helperPath,
      args.installRoot,
      args.operationId,
      String(args.leaseMs),
      args.releaseOnExit ? '1' : '0',
    ],
    { stdio: ['pipe', 'pipe', 'pipe'] }
  );

  let stdout = '';
  let stderr = '';
  const expiresAt = new Promise<number>((resolve, reject) => {
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk;
      if (stdout.includes('\n')) {
        resolve(Date.parse(stdout.split('\n')[0]));
      }
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', () => {
      reject(new Error(`child exited before acquisition: ${stderr || 'no output'}`));
    });
  });
  const done = new Promise<number | null>((resolve) => child.once('close', resolve));

  return { expiresAt, done, release: () => child.stdin.end() };
}

describe('plugin-marketplace-install-lock', () => {
  it('acquires, renews, and releases a lease with metadata', async () => {
    const installRoot = await mkdtemp(path.join(os.tmpdir(), 'devholm-marketplace-lease-basic-'));

    const lease = await acquireMarketplaceInstallLease({
      lockRoot: marketplaceInstallLockRoot(installRoot),
      pluginId: 'calendar',
      operationId: 'operation-basic',
      leaseMs: 1_000,
    });

    const metadataRaw = await readFile(lease.metadataPath, 'utf8');
    const metadata = JSON.parse(metadataRaw) as { operationId: string; ownerToken: string };
    expect(metadata.operationId).toBe('operation-basic');
    expect(typeof metadata.ownerToken).toBe('string');

    await lease.renew();
    await lease.release();

    await expect(readFile(lease.metadataPath, 'utf8')).rejects.toThrow();
    await rm(installRoot, { recursive: true, force: true });
  });

  it('enforces owner-only release', async () => {
    const installRoot = await mkdtemp(path.join(os.tmpdir(), 'devholm-marketplace-lease-owner-'));

    const lease = await acquireMarketplaceInstallLease({
      lockRoot: marketplaceInstallLockRoot(installRoot),
      pluginId: 'calendar',
      operationId: 'operation-owner',
      leaseMs: 1_000,
    });

    const metadataRaw = await readFile(lease.metadataPath, 'utf8');
    const metadata = JSON.parse(metadataRaw) as Record<string, unknown>;
    await writeFile(
      lease.metadataPath,
      JSON.stringify({ ...metadata, ownerToken: 'other-owner-token' }, null, 2),
      'utf8'
    );

    await expect(lease.release()).rejects.toThrow(/ownership mismatch/i);

    await rm(lease.lockDirectory, { recursive: true, force: true });
    await rm(installRoot, { recursive: true, force: true });
  });

  it('recovers stale lease metadata and acquires lock', async () => {
    const installRoot = await mkdtemp(path.join(os.tmpdir(), 'devholm-marketplace-lease-stale-'));
    const lockRoot = marketplaceInstallLockRoot(installRoot);
    const lockDirectory = path.join(lockRoot, 'calendar.lock');

    await mkdir(lockDirectory, { recursive: true, mode: 0o700 });

    const expired = new Date(Date.now() - 1_000).toISOString();
    await writeFile(
      path.join(lockRoot, 'calendar.lock', 'lease.json'),
      JSON.stringify(
        {
          schemaVersion: 1,
          pluginId: 'calendar',
          operationId: 'stale-op',
          ownerToken: 'stale-owner',
          pid: 123,
          hostIdentity: 'host',
          createdAt: expired,
          heartbeatAt: expired,
          leaseExpiresAt: expired,
        },
        null,
        2
      ),
      { mode: 0o600 }
    );

    const lease = await acquireMarketplaceInstallLease({
      lockRoot,
      pluginId: 'calendar',
      operationId: 'fresh-op',
      leaseMs: 1_000,
    });

    expect(lease.metadata.operationId).toBe('fresh-op');

    await lease.release();
    await rm(installRoot, { recursive: true, force: true });
  });

  it('times out a second process while another owner holds the lease', async () => {
    const installRoot = await mkdtemp(path.join(os.tmpdir(), 'devholm-marketplace-lease-collide-'));
    const holder = startLockChild({
      installRoot,
      operationId: 'holder-op',
      leaseMs: 4_000,
      releaseOnExit: true,
    });

    // Freeze only this worker's clock. The child holds the lease until stdin closes.
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime((await holder.expiresAt) - 1);
      await expect(
        acquireMarketplaceInstallLease({
          lockRoot: marketplaceInstallLockRoot(installRoot),
          pluginId: 'calendar',
          operationId: 'contender-op',
          waitTimeoutMs: 0,
        })
      ).rejects.toThrow(/install lease timeout/i);
    } finally {
      vi.useRealTimers();
      holder.release();
      await holder.done;
      await rm(installRoot, { recursive: true, force: true });
    }
    expect(await holder.done).toBe(0);
  });

  it('allows recovery after owner exits without release when lease expires', async () => {
    const installRoot = await mkdtemp(path.join(os.tmpdir(), 'devholm-marketplace-lease-recover-'));
    const crashedOwner = startLockChild({
      installRoot,
      operationId: 'crashed-owner-op',
      leaseMs: 500,
      releaseOnExit: false,
    });
    const options = {
      lockRoot: marketplaceInstallLockRoot(installRoot),
      pluginId: 'calendar',
      waitTimeoutMs: 0,
    };

    // Step the isolated worker's clock across the persisted expiry boundary.
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const expiresAt = await crashedOwner.expiresAt;
      expect(await crashedOwner.done).toBe(0);

      vi.setSystemTime(expiresAt - 1);
      await expect(
        acquireMarketplaceInstallLease({ ...options, operationId: 'before-expiry' })
      ).rejects.toThrow(/install lease timeout/i);

      vi.setSystemTime(expiresAt);
      const recovered = await acquireMarketplaceInstallLease({
        ...options,
        operationId: 'after-expiry',
      });
      expect(recovered.metadata.operationId).toBe('after-expiry');
      await recovered.release();
    } finally {
      vi.useRealTimers();
      await crashedOwner.done;
      await rm(installRoot, { recursive: true, force: true });
    }
  });
});
