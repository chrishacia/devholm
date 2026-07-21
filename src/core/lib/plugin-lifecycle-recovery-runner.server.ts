import { listPluginStates } from '@/db/plugins';
import {
  reconcilePluginLifecycleState,
  type LifecycleReconciliationResult,
} from '@core/lib/plugin-lifecycle-reconciler.server';
import { markPluginStartupReconciliationStateDirty } from '@core/lib/plugin-startup-reconciliation.server';
import {
  determinePluginRollbackCompatibility,
  readInterruptedPluginMigrationCheckpoint,
} from '@core/db/plugin-migration-checkpoints';
import {
  classifyPluginCutoverState,
  type PluginCutoverClassificationResult,
} from '@core/lib/plugin-cutover-reconciliation-classifier.server';
import {
  readPluginCutoverStateSnapshots,
  type PluginCutoverStateSnapshot,
} from '@core/lib/plugin-cutover-state-snapshot.server';

export interface PluginLifecycleRecoveryScanResult {
  scannedAt: string;
  pluginCount: number;
  results: Array<
    LifecycleReconciliationResult & {
      pluginId: string;
      cutover?: PluginCutoverClassificationResult;
      snapshot?: PluginCutoverStateSnapshot;
    }
  >;
}

export async function reconcileSinglePluginLifecycle(
  pluginId: string
): Promise<LifecycleReconciliationResult> {
  const result = await reconcilePluginLifecycleState(pluginId);
  markPluginStartupReconciliationStateDirty();
  return result;
}

export async function runPluginLifecycleRecoveryScan(options?: {
  limit?: number;
}): Promise<PluginLifecycleRecoveryScanResult> {
  const pluginStates = await listPluginStates();
  const cutoverSnapshots = await readPluginCutoverStateSnapshots();
  const snapshotByPluginId = new Map(
    cutoverSnapshots.map((snapshot) => [snapshot.pluginId, snapshot])
  );
  const limit = Math.max(1, Math.min(options?.limit ?? pluginStates.length, 200));
  const selected = pluginStates.slice(0, limit);

  const results = await Promise.all(
    selected.map(async (plugin) => {
      const reconciliation = await reconcilePluginLifecycleState(plugin.id);
      const [interruptedCheckpoint, rollbackCompatibility] = await Promise.all([
        readInterruptedPluginMigrationCheckpoint(plugin.id),
        determinePluginRollbackCompatibility(plugin.id),
      ]);

      return {
        pluginId: plugin.id,
        ...reconciliation,
        snapshot: snapshotByPluginId.get(plugin.id),
        cutover: classifyPluginCutoverState({
          plugin,
          reconciliation,
          hasInterruptedMigrationCheckpoint: interruptedCheckpoint !== null,
          rollbackCompatible: rollbackCompatibility.rollbackCompatible,
        }),
      };
    })
  );

  markPluginStartupReconciliationStateDirty();

  return {
    scannedAt: new Date().toISOString(),
    pluginCount: selected.length,
    results,
  };
}
