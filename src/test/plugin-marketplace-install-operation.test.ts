import * as os from 'node:os';
import * as path from 'node:path';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  cancelMarketplaceInstallOperation,
  completeMarketplaceInstallOperation,
  ensureMarketplaceInstallStartupReconciliation,
  readMarketplaceInstallOperationState,
  startMarketplaceInstallOperation,
} from '@core/lib/plugin-marketplace-install-operation.server';

describe('plugin-marketplace-install-operation', () => {
  it('records and completes an operation', async () => {
    const installRoot = await mkdtemp(path.join(os.tmpdir(), 'devholm-marketplace-op-'));

    const started = await startMarketplaceInstallOperation({
      installRoot,
      pluginId: 'calendar',
      targetVersion: '0.1.0',
      targetSha256: 'a'.repeat(64),
      acquisitionMode: 'remote-first-party',
      offlineOnly: true,
      initiatedBy: 'admin@example.com',
    });

    expect(started.status).toBe('in_progress');

    const completed = await completeMarketplaceInstallOperation({
      installRoot,
      pluginId: 'calendar',
      note: 'done',
    });

    expect(completed?.status).toBe('succeeded');

    const persisted = await readMarketplaceInstallOperationState(installRoot, 'calendar');
    expect(persisted?.status).toBe('succeeded');

    await rm(installRoot, { recursive: true, force: true });
  });

  it('marks stale in-progress operations as interrupted during reconciliation', async () => {
    const installRoot = await mkdtemp(path.join(os.tmpdir(), 'devholm-marketplace-op-reconcile-'));

    const operation = await startMarketplaceInstallOperation({
      installRoot,
      pluginId: 'calendar',
      targetVersion: '0.1.0',
      targetSha256: 'a'.repeat(64),
      acquisitionMode: 'remote-first-party',
      offlineOnly: false,
    });

    const operationPath = path.join(installRoot, 'calendar', '.install-operation.json');
    const staleOperation = {
      ...operation,
      updatedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    };
    await writeFile(operationPath, JSON.stringify(staleOperation, null, 2), 'utf8');

    await ensureMarketplaceInstallStartupReconciliation(installRoot);

    const reconciled = await readMarketplaceInstallOperationState(installRoot, 'calendar');
    expect(reconciled?.status).toBe('interrupted');
    expect(reconciled?.error).toContain('startup reconciliation');

    await rm(installRoot, { recursive: true, force: true });
  });

  it('does not interrupt fresh in-progress operations during reconciliation', async () => {
    const installRoot = await mkdtemp(path.join(os.tmpdir(), 'devholm-marketplace-op-fresh-'));

    await startMarketplaceInstallOperation({
      installRoot,
      pluginId: 'calendar',
      targetVersion: '0.1.0',
      targetSha256: 'a'.repeat(64),
      acquisitionMode: 'remote-first-party',
      offlineOnly: false,
    });

    await ensureMarketplaceInstallStartupReconciliation(installRoot);

    const persistedRaw = await readFile(
      path.join(installRoot, 'calendar', '.install-operation.json'),
      'utf8'
    );
    const persisted = JSON.parse(persistedRaw) as { status: string };
    expect(persisted.status).toBe('in_progress');

    await rm(installRoot, { recursive: true, force: true });
  });

  it('records cancellation requests on running operations', async () => {
    const installRoot = await mkdtemp(path.join(os.tmpdir(), 'devholm-marketplace-op-cancel-'));

    await startMarketplaceInstallOperation({
      installRoot,
      pluginId: 'calendar',
      targetVersion: '0.1.0',
      targetSha256: 'a'.repeat(64),
      acquisitionMode: 'local-path',
      offlineOnly: false,
    });

    const cancelled = await cancelMarketplaceInstallOperation({
      installRoot,
      pluginId: 'calendar',
      requestedBy: 'admin@example.com',
    });

    expect(cancelled?.cancellation.requested).toBe(true);
    expect(cancelled?.cancellation.requestedBy).toBe('admin@example.com');
    expect(cancelled?.status).toBe('in_progress');

    await rm(installRoot, { recursive: true, force: true });
  });
});
