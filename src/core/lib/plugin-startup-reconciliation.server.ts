import path from 'node:path';
import { PluginLifecycleError } from '@core/lib/plugin-lifecycle-errors';
import { runPluginLifecycleRecoveryScan } from '@core/lib/plugin-lifecycle-recovery-runner.server';
import { ensureMarketplaceInstallStartupReconciliation } from '@core/lib/plugin-marketplace-install-operation.server';

const DEFAULT_FIRST_PARTY_INSTALL_ROOT = path.resolve(
  process.cwd(),
  'generated/plugins/marketplace-first-party'
);

const BLOCKING_RECONCILIATION_ACTIONS = new Set([
  'require-recovery',
  'manual-intervention-required',
  'schedule-rollback',
]);

const STARTUP_RECONCILIATION_MAX_AGE_MS = 30_000;

export interface PluginStartupReconciliationBlocker {
  pluginId: string;
  action: string;
  reason: string;
  operationId: string | null;
}

export interface PluginStartupReconciliationState {
  initializedAt: string;
  scannedAt: string;
  blockerCount: number;
  blockers: readonly PluginStartupReconciliationBlocker[];
}

let startupReconciliationState: PluginStartupReconciliationState | null = null;
let startupReconciliationInFlight: Promise<PluginStartupReconciliationState> | null = null;
let startupReconciliationDirty = true;

function nowIso(): string {
  return new Date().toISOString();
}

function stateIsFresh(state: PluginStartupReconciliationState | null): boolean {
  if (!state) {
    return false;
  }

  const scannedAt = Date.parse(state.scannedAt);
  if (!Number.isFinite(scannedAt)) {
    return false;
  }

  return Date.now() - scannedAt <= STARTUP_RECONCILIATION_MAX_AGE_MS;
}

function toBlockers(
  scan: Awaited<ReturnType<typeof runPluginLifecycleRecoveryScan>>
): PluginStartupReconciliationBlocker[] {
  return scan.results
    .filter((result) => BLOCKING_RECONCILIATION_ACTIONS.has(result.action))
    .map((result) => ({
      pluginId: result.pluginId,
      action: result.action,
      reason: result.reason,
      operationId: result.operationId,
    }));
}

async function collectStartupReconciliationState(): Promise<PluginStartupReconciliationState> {
  await ensureMarketplaceInstallStartupReconciliation(DEFAULT_FIRST_PARTY_INSTALL_ROOT);

  const lifecycleScan = await runPluginLifecycleRecoveryScan();
  const blockers = toBlockers(lifecycleScan);
  const initializedAt = startupReconciliationState?.initializedAt ?? nowIso();

  return {
    initializedAt,
    scannedAt: lifecycleScan.scannedAt,
    blockerCount: blockers.length,
    blockers,
  };
}

async function refreshStartupReconciliationState(
  force: boolean
): Promise<PluginStartupReconciliationState> {
  const shouldRefresh =
    force || startupReconciliationDirty || !stateIsFresh(startupReconciliationState);

  if (!shouldRefresh && startupReconciliationState) {
    return startupReconciliationState;
  }

  if (startupReconciliationInFlight) {
    return startupReconciliationInFlight;
  }

  startupReconciliationInFlight = collectStartupReconciliationState()
    .then((state) => {
      startupReconciliationState = state;
      startupReconciliationDirty = false;
      return state;
    })
    .finally(() => {
      startupReconciliationInFlight = null;
    });

  return startupReconciliationInFlight;
}

export async function initializePluginStartupReconciliation(): Promise<PluginStartupReconciliationState> {
  return refreshStartupReconciliationState(false);
}

export function getPluginStartupReconciliationState(): PluginStartupReconciliationState | null {
  return startupReconciliationState;
}

export async function ensurePluginStartupReadyForMutation(): Promise<void> {
  const state = await refreshStartupReconciliationState(false);
  if (state.blockerCount === 0) {
    return;
  }

  const blockerSummary = state.blockers
    .map((entry) => `${entry.pluginId}:${entry.action}`)
    .join(', ');
  throw new PluginLifecycleError({
    code: 'LIFECYCLE_RECOVERY_REQUIRED',
    internalDiagnostic: `startup reconciliation blocked by unresolved lifecycle recovery actions: ${blockerSummary}`,
  });
}

export function markPluginStartupReconciliationStateDirty(): void {
  startupReconciliationDirty = true;
}

export function resetCanonicalPluginStartupReconciliationForTests(): void {
  const runningUnderVitest =
    process.env.VITEST === 'true' ||
    process.env.VITEST_WORKER_ID !== undefined ||
    process.env.VITEST_POOL_ID !== undefined;

  if (!runningUnderVitest) {
    throw new Error('resetCanonicalPluginStartupReconciliationForTests is test-only');
  }

  startupReconciliationState = null;
  startupReconciliationInFlight = null;
  startupReconciliationDirty = true;
}
