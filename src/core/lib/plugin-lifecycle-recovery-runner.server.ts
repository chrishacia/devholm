import { listPluginStates } from '@/db/plugins';
import {
  reconcilePluginLifecycleState,
  type LifecycleReconciliationResult,
} from '@core/lib/plugin-lifecycle-reconciler.server';

export interface PluginLifecycleRecoveryScanResult {
  scannedAt: string;
  pluginCount: number;
  results: Array<
    LifecycleReconciliationResult & {
      pluginId: string;
    }
  >;
}

export async function reconcileSinglePluginLifecycle(
  pluginId: string
): Promise<LifecycleReconciliationResult> {
  return reconcilePluginLifecycleState(pluginId);
}

export async function runPluginLifecycleRecoveryScan(options?: {
  limit?: number;
}): Promise<PluginLifecycleRecoveryScanResult> {
  const pluginStates = await listPluginStates();
  const limit = Math.max(1, Math.min(options?.limit ?? pluginStates.length, 200));
  const selected = pluginStates.slice(0, limit);

  const results = await Promise.all(
    selected.map(async (plugin) => ({
      pluginId: plugin.id,
      ...(await reconcilePluginLifecycleState(plugin.id)),
    }))
  );

  return {
    scannedAt: new Date().toISOString(),
    pluginCount: selected.length,
    results,
  };
}
