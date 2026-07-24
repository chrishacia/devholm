import { getDb } from '@/db';
import { getPluginDefinitions } from '@core/lib/plugins';
import type { Knex } from 'knex';

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

export async function readPluginCutoverStateSnapshot(
  pluginId: string,
  db: Knex = getDb()
): Promise<PluginCutoverStateSnapshot> {
  const [settingRow, lifecycleRow, activeOperationRows, runningCheckpointRows, migrationCountRows] =
    await Promise.all([
      db('site_settings')
        .select('key', 'value')
        .where({ key: pluginEnabledSettingKey(pluginId) })
        .first(),
      db('devholm_plugins')
        .select('plugin_id', 'lifecycle_state', 'operation_status', 'installed_version', 'enabled')
        .where({ plugin_id: pluginId })
        .first(),
      db('devholm_plugin_lifecycle_operations')
        .select('plugin_id')
        .where({ plugin_id: pluginId })
        .whereIn('status', ['requested', 'running']),
      db('devholm_plugin_migration_checkpoints')
        .select('plugin_id')
        .where({ plugin_id: pluginId, status: 'running' }),
      db('devholm_plugin_migrations')
        .select('plugin_id')
        .count('* as count')
        .where({ plugin_id: pluginId, direction: 'up', state: 'succeeded' })
        .groupBy('plugin_id'),
    ]);

  const hasEnabledSetting = Boolean(settingRow);
  const settingValue = settingRow ? String(settingRow.value) : null;
  const hasLifecycleRecord = Boolean(lifecycleRow);
  const lifecycleState = lifecycleRow ? String(lifecycleRow.lifecycle_state ?? null) : null;
  const operationStatus = lifecycleRow ? String(lifecycleRow.operation_status ?? null) : null;
  const installedVersion = lifecycleRow ? String(lifecycleRow.installed_version ?? null) : null;
  const activeLifecycleOperationCount = activeOperationRows.length;
  const runningMigrationCheckpointCount = runningCheckpointRows.length;
  const succeededMigrationCount = Number(
    (migrationCountRows?.[0] as { count?: unknown } | undefined)?.count ?? 0
  );

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

  if (activeLifecycleOperationCount > 1) {
    contradictionReasons.push('multiple-active-lifecycle-operations');
  }

  if (runningMigrationCheckpointCount > 0 && activeLifecycleOperationCount === 0) {
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
    activeLifecycleOperationCount,
    runningMigrationCheckpointCount,
    succeededMigrationCount,
    contradictoryState: contradictionReasons.length > 0,
    contradictionReasons,
  };
}

export async function readPluginCutoverStateSnapshots(): Promise<PluginCutoverStateSnapshot[]> {
  const pluginIds = getPluginDefinitions().map((definition) => definition.id);

  return Promise.all(pluginIds.map((pluginId) => readPluginCutoverStateSnapshot(pluginId)));
}
