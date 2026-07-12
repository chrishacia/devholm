import { randomUUID } from 'node:crypto';
import { access, mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import type {
  MarketplaceInstallOperationStage,
  MarketplaceInstallOperationState,
  MarketplaceInstallOperationStatus,
} from '@core/types/plugin-marketplace-install-operation';
import type { MarketplaceArtifactTrustVerification } from '@core/types/plugin-marketplace-contract';

const reconciledRoots = new Set<string>();
const DEFAULT_STARTUP_STALE_IN_PROGRESS_MS = 5 * 60 * 1000;

function operationStatePath(installRoot: string, pluginId: string): string {
  return path.join(installRoot, pluginId, '.install-operation.json');
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function writeOperationState(
  installRoot: string,
  operation: MarketplaceInstallOperationState
): Promise<void> {
  const pluginRoot = path.join(installRoot, operation.pluginId);
  await mkdir(pluginRoot, { recursive: true, mode: 0o700 });
  const destinationPath = operationStatePath(installRoot, operation.pluginId);
  const temporaryPath = `${destinationPath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(operation, null, 2), { mode: 0o600 });
  await rename(temporaryPath, destinationPath);
}

function isStaleInProgressOperation(operation: MarketplaceInstallOperationState): boolean {
  const lastUpdatedAt = Date.parse(operation.updatedAt);
  if (!Number.isFinite(lastUpdatedAt)) {
    return true;
  }

  return Date.now() - lastUpdatedAt > DEFAULT_STARTUP_STALE_IN_PROGRESS_MS;
}

export async function readMarketplaceInstallOperationState(
  installRoot: string,
  pluginId: string
): Promise<MarketplaceInstallOperationState | null> {
  const filePath = operationStatePath(installRoot, pluginId);
  if (!(await pathExists(filePath))) {
    return null;
  }

  const raw = await readFile(filePath, 'utf8');
  try {
    return JSON.parse(raw) as MarketplaceInstallOperationState;
  } catch {
    throw new Error(`operation state file is corrupted for plugin ${pluginId}`);
  }
}

export async function ensureMarketplaceInstallStartupReconciliation(
  installRoot: string
): Promise<void> {
  if (reconciledRoots.has(installRoot)) {
    return;
  }

  reconciledRoots.add(installRoot);

  if (!(await pathExists(installRoot))) {
    return;
  }

  const pluginEntries = await readdir(installRoot, { withFileTypes: true });
  for (const entry of pluginEntries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const operation = await readMarketplaceInstallOperationState(installRoot, entry.name);
    if (
      !operation ||
      operation.status !== 'in_progress' ||
      !isStaleInProgressOperation(operation)
    ) {
      continue;
    }

    const now = new Date().toISOString();
    await writeOperationState(installRoot, {
      ...operation,
      status: 'interrupted',
      stage: 'complete',
      updatedAt: now,
      finishedAt: now,
      error: 'operation marked interrupted during startup reconciliation',
      notes: [
        ...operation.notes,
        'startup reconciliation marked a stale in-progress operation as interrupted',
      ],
    });
  }
}

export async function startMarketplaceInstallOperation(params: {
  installRoot: string;
  pluginId: string;
  targetVersion: string;
  targetSha256: string;
  initiatedBy?: string;
  acquisitionMode: 'local-path' | 'remote-first-party';
  offlineOnly: boolean;
}): Promise<MarketplaceInstallOperationState> {
  const existing = await readMarketplaceInstallOperationState(params.installRoot, params.pluginId);
  if (existing?.status === 'in_progress') {
    throw new Error('install operation already in progress for this plugin');
  }

  const now = new Date().toISOString();
  const operation: MarketplaceInstallOperationState = {
    operationId: randomUUID(),
    pluginId: params.pluginId,
    targetVersion: params.targetVersion,
    targetSha256: params.targetSha256,
    status: 'in_progress',
    stage: 'initialize',
    startedAt: now,
    updatedAt: now,
    initiatedBy: params.initiatedBy,
    acquisitionMode: params.acquisitionMode,
    offlineOnly: params.offlineOnly,
    cancellation: {
      requested: false,
      policy: 'best-effort-before-promotion',
    },
    notes: [],
  };

  await writeOperationState(params.installRoot, operation);
  return operation;
}

export async function updateMarketplaceInstallOperation(params: {
  installRoot: string;
  pluginId: string;
  stage: MarketplaceInstallOperationStage;
  note?: string;
  status?: MarketplaceInstallOperationStatus;
  error?: string;
  trust?: MarketplaceArtifactTrustVerification;
}): Promise<MarketplaceInstallOperationState | null> {
  const operation = await readMarketplaceInstallOperationState(params.installRoot, params.pluginId);
  if (!operation) {
    return null;
  }

  const now = new Date().toISOString();
  const nextStatus = params.status ?? operation.status;
  const next: MarketplaceInstallOperationState = {
    ...operation,
    stage: params.stage,
    status: nextStatus,
    updatedAt: now,
    error: params.error ?? operation.error,
    notes: params.note ? [...operation.notes, params.note] : operation.notes,
    trust: params.trust ?? operation.trust,
    finishedAt: nextStatus === 'in_progress' ? operation.finishedAt : operation.finishedAt ?? now,
  };

  await writeOperationState(params.installRoot, next);
  return next;
}

export async function completeMarketplaceInstallOperation(params: {
  installRoot: string;
  pluginId: string;
  note?: string;
}): Promise<MarketplaceInstallOperationState | null> {
  return updateMarketplaceInstallOperation({
    installRoot: params.installRoot,
    pluginId: params.pluginId,
    stage: 'complete',
    status: 'succeeded',
    note: params.note,
  });
}

export async function failMarketplaceInstallOperation(params: {
  installRoot: string;
  pluginId: string;
  error: string;
}): Promise<MarketplaceInstallOperationState | null> {
  return updateMarketplaceInstallOperation({
    installRoot: params.installRoot,
    pluginId: params.pluginId,
    stage: 'complete',
    status: 'failed',
    error: params.error,
    note: 'operation failed',
  });
}

export async function cancelMarketplaceInstallOperation(params: {
  installRoot: string;
  pluginId: string;
  requestedBy?: string;
}): Promise<MarketplaceInstallOperationState | null> {
  const operation = await readMarketplaceInstallOperationState(params.installRoot, params.pluginId);
  if (!operation || operation.status !== 'in_progress') {
    return operation;
  }

  const now = new Date().toISOString();
  const next: MarketplaceInstallOperationState = {
    ...operation,
    updatedAt: now,
    cancellation: {
      ...operation.cancellation,
      requested: true,
      requestedAt: operation.cancellation.requestedAt ?? now,
      requestedBy: params.requestedBy ?? operation.cancellation.requestedBy,
    },
    notes: [...operation.notes, 'cancellation requested'],
  };

  await writeOperationState(params.installRoot, next);
  return next;
}

export async function shouldCancelMarketplaceInstallOperation(params: {
  installRoot: string;
  pluginId: string;
}): Promise<boolean> {
  const operation = await readMarketplaceInstallOperationState(params.installRoot, params.pluginId);
  return Boolean(operation?.status === 'in_progress' && operation.cancellation.requested);
}
