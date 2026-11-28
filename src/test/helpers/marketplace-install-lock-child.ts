import { once } from 'node:events';
import process from 'node:process';
import {
  acquireMarketplaceInstallLease,
  marketplaceInstallLockRoot,
} from '../../core/lib/plugin-marketplace-install-lock.server';

async function main(): Promise<void> {
  const [installRoot, operationId, leaseMs, releaseOnExit] = process.argv.slice(2);
  const lease = await acquireMarketplaceInstallLease({
    lockRoot: marketplaceInstallLockRoot(installRoot),
    pluginId: 'calendar',
    operationId,
    leaseMs: Number(leaseMs),
  });

  process.stdout.write(`${lease.metadata.leaseExpiresAt}\n`);

  if (releaseOnExit === '1') {
    const releasedByParent = once(process.stdin, 'end');
    process.stdin.resume();
    await releasedByParent;
    await lease.release();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
