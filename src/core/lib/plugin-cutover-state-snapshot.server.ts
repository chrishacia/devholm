import { getDb } from '@/db';
import { getPluginDefinitions } from '@core/lib/plugins';

export interface PluginCutoverStateSnapshot {
  pluginId: string;
  hasEnabledSetting: boolean;
  enabledSettingValue: string | null;
  hasLifecycleRecord: boolean;
  lifecycleState: string | null;
  operationStatus: string | null;
  installedVersion: string | null;
  activeLifecycleOperationCount: number;
  runningMigrationCheckpointCount: number;
  succeededMigrationCount: number;
  contradictoryState: boolean;
  contradictionReasons: string[];
}

function pluginEnabledSettingKey(pluginId: string): string {
  return `plugin:${pluginId}:enabled`;
}

export async function readPluginCutoverStateSnapshots(): Promise<PluginCutoverStateSnapshot[]> {
  const db = getDb();
  const pluginIds = getPluginDefinitions().map((definition) => definition.id);

  const [
    settingsRows,
    lifecycleRows,
    activeOperationRows,
    runningCheckpointRows,
    migrationCountRows,
  ] = await Promise.all([
    db('site_settings')
      .select('key', 'value')
      .where('category', 'plugins')
      .andWhere('key', 'like', 'plugin:%:enabled'),
    db('devholm_plugins').select(
      'plugin_id',
      'lifecycle_state',
      'operation_status',
      'installed_version',
      'enabled'
    ),
    db('devholm_plugin_lifecycle_operations')
      .select('plugin_id')
      .whereIn('status', ['requested', 'running']),
    db('devholm_plugin_migration_checkpoints').select('plugin_id').where({ status: 'running' }),
    db('devholm_plugin_migrations')
      .select('plugin_id')
      .count('* as count')
      .where({ direction: 'up', state: 'succeeded' })
      .groupBy('plugin_id'),
  ]);

  const enabledSettingsByPlugin = new Map<string, string>();
  for (const row of settingsRows) {
    const match = /^plugin:([^:]+):enabled$/.exec(String(row.key));
    if (!match) {
      continue;
    }
    enabledSettingsByPlugin.set(match[1], String(row.value));
  }

  const lifecycleByPlugin = new Map<string, Record<string, unknown>>();
  for (const row of lifecycleRows) {
    lifecycleByPlugin.set(String(row.plugin_id), row);
  }

  const activeOpsByPlugin = new Map<string, number>();
  for (const row of activeOperationRows) {
    const pluginId = String(row.plugin_id);
    activeOpsByPlugin.set(pluginId, (activeOpsByPlugin.get(pluginId) ?? 0) + 1);
  }

  const runningCheckpointsByPlugin = new Map<string, number>();
  for (const row of runningCheckpointRows) {
    const pluginId = String(row.plugin_id);
    runningCheckpointsByPlugin.set(pluginId, (runningCheckpointsByPlugin.get(pluginId) ?? 0) + 1);
  }

  const succeededMigrationsByPlugin = new Map<string, number>();
  for (const row of migrationCountRows as Array<Record<string, unknown>>) {
    succeededMigrationsByPlugin.set(String(row.plugin_id), Number(row.count));
  }

  return pluginIds.map((pluginId) => {
    const settingValue = enabledSettingsByPlugin.get(pluginId) ?? null;
    const lifecycle = lifecycleByPlugin.get(pluginId) ?? null;
    const lifecycleState = lifecycle ? String(lifecycle.lifecycle_state ?? null) : null;
    const operationStatus = lifecycle ? String(lifecycle.operation_status ?? null) : null;
    const installedVersion = lifecycle ? String(lifecycle.installed_version ?? null) : null;
    const hasLifecycleRecord = lifecycle !== null;
    const hasEnabledSetting = enabledSettingsByPlugin.has(pluginId);

    const contradictionReasons: string[] = [];

    if (
      hasLifecycleRecord &&
      lifecycleState === 'bundled' &&
      installedVersion &&
      installedVersion !== 'null'
    ) {
      contradictionReasons.push('bundled-state-has-installed-version');
    }

    if (!hasLifecycleRecord && !hasEnabledSetting) {
      contradictionReasons.push('missing-ledger-and-enabled-setting');
    }

    if ((activeOpsByPlugin.get(pluginId) ?? 0) > 1) {
      contradictionReasons.push('multiple-active-lifecycle-operations');
    }

    if (
      (runningCheckpointsByPlugin.get(pluginId) ?? 0) > 0 &&
      (activeOpsByPlugin.get(pluginId) ?? 0) === 0
    ) {
      contradictionReasons.push('running-checkpoint-without-active-operation');
    }

    return {
      pluginId,
      hasEnabledSetting,
      enabledSettingValue: settingValue,
      hasLifecycleRecord,
      lifecycleState,
      operationStatus,
      installedVersion: installedVersion === 'null' ? null : installedVersion,
      activeLifecycleOperationCount: activeOpsByPlugin.get(pluginId) ?? 0,
      runningMigrationCheckpointCount: runningCheckpointsByPlugin.get(pluginId) ?? 0,
      succeededMigrationCount: succeededMigrationsByPlugin.get(pluginId) ?? 0,
      contradictoryState: contradictionReasons.length > 0,
      contradictionReasons,
    };
  });
}
