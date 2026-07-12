import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  acquireMarketplaceInstallLease,
  marketplaceInstallLockRoot,
} from '@core/lib/plugin-marketplace-install-lock.server';

type ChildRunResult = {
  code: number;
  stdout: string;
  stderr: string;
};

type ChildRunHandle = {
  acquired: Promise<void>;
  done: Promise<ChildRunResult>;
};

function startLockChild(args: {
  installRoot: string;
  pluginId: string;
  operationId: string;
  holdMs: number;
  leaseMs: number;
  waitTimeoutMs: number;
  releaseOnExit: boolean;
  expectAcquire?: boolean;
}): ChildRunHandle {
  const helperPath = path.resolve(
    process.cwd(),
    'src/test/helpers/marketplace-install-lock-child.ts'
  );
  const child = spawn(
    'pnpm',
    [
      'exec',
      'tsx',
      helperPath,
      args.installRoot,
      args.pluginId,
      args.operationId,
      String(args.holdMs),
      String(args.leaseMs),
      String(args.waitTimeoutMs),
      args.releaseOnExit ? '1' : '0',
    ],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  let stdout = '';
  let stderr = '';

  const shouldAcquire = args.expectAcquire ?? true;

  const acquired = new Promise<void>((resolve, reject) => {
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      if (stdout.includes('acquired\n')) {
        resolve();
      }
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });

    child.on('error', reject);
    child.on('exit', () => {
      if (!shouldAcquire) {
        resolve();
        return;
      }
      if (!stdout.includes('acquired\n')) {
        reject(new Error(`child exited before acquisition: ${stderr || stdout || 'no output'}`));
      }
    });
  });

  const done = new Promise<ChildRunResult>((resolve) => {
    child.on('close', (code) => {
      resolve({
        code: code ?? 1,
        stdout,
        stderr,
      });
    });
  });

  return { acquired, done };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
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
      pluginId: 'calendar',
      operationId: 'holder-op',
      holdMs: 1_500,
      leaseMs: 4_000,
      waitTimeoutMs: 2_000,
      releaseOnExit: true,
    });

    await holder.acquired;

    const contender = startLockChild({
      installRoot,
      pluginId: 'calendar',
      operationId: 'contender-op',
      holdMs: 0,
      leaseMs: 4_000,
      waitTimeoutMs: 250,
      releaseOnExit: true,
      expectAcquire: false,
    });

    const contenderResult = await contender.done;
    expect(contenderResult.code).toBe(1);
    expect(contenderResult.stderr).toMatch(/install lease timeout/i);

    const holderResult = await holder.done;
    expect(holderResult.code).toBe(0);

    await rm(installRoot, { recursive: true, force: true });
  });

  it('allows recovery after owner exits without release when lease expires', async () => {
    const installRoot = await mkdtemp(path.join(os.tmpdir(), 'devholm-marketplace-lease-recover-'));

    const crashedOwner = startLockChild({
      installRoot,
      pluginId: 'calendar',
      operationId: 'crashed-owner-op',
      holdMs: 0,
      leaseMs: 500,
      waitTimeoutMs: 1_000,
      releaseOnExit: false,
    });

    await crashedOwner.acquired;
    const crashedResult = await crashedOwner.done;
    expect(crashedResult.code).toBe(0);

    await expect(
      acquireMarketplaceInstallLease({
        lockRoot: marketplaceInstallLockRoot(installRoot),
        pluginId: 'calendar',
        operationId: 'before-expiry',
        leaseMs: 500,
        waitTimeoutMs: 100,
      })
    ).rejects.toThrow(/install lease timeout/i);

    await sleep(650);

    const recovered = await acquireMarketplaceInstallLease({
      lockRoot: marketplaceInstallLockRoot(installRoot),
      pluginId: 'calendar',
      operationId: 'after-expiry',
      leaseMs: 500,
      waitTimeoutMs: 1_500,
    });

    expect(recovered.metadata.operationId).toBe('after-expiry');

    await recovered.release();
    await rm(installRoot, { recursive: true, force: true });
  });
});
