import process from 'node:process';
import {
  acquireMarketplaceInstallLease,
  marketplaceInstallLockRoot,
} from '../../core/lib/plugin-marketplace-install-lock.server';

interface ChildArgs {
  installRoot: string;
  pluginId: string;
  operationId: string;
  holdMs: number;
  leaseMs: number;
  waitTimeoutMs: number;
  releaseOnExit: boolean;
}

function parseArgs(argv: string[]): ChildArgs {
  const [installRoot, pluginId, operationId, holdMsRaw, leaseMsRaw, waitTimeoutMsRaw, releaseRaw] =
    argv;

  if (!installRoot || !pluginId || !operationId) {
    throw new Error('missing required args');
  }

  return {
    installRoot,
    pluginId,
    operationId,
    holdMs: Number(holdMsRaw ?? 0),
    leaseMs: Number(leaseMsRaw ?? 30_000),
    waitTimeoutMs: Number(waitTimeoutMsRaw ?? 30_000),
    releaseOnExit: releaseRaw !== '0',
  };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const lease = await acquireMarketplaceInstallLease({
    lockRoot: marketplaceInstallLockRoot(args.installRoot),
    pluginId: args.pluginId,
    operationId: args.operationId,
    leaseMs: args.leaseMs,
    waitTimeoutMs: args.waitTimeoutMs,
  });

  process.stdout.write('acquired\n');

  lease.startHeartbeat();

  if (args.holdMs > 0) {
    await sleep(args.holdMs);
  }

  lease.stopHeartbeat();
  if (args.releaseOnExit) {
    await lease.release();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
