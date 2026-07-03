import { createHash } from 'crypto';
import type { Knex } from 'knex';
import { getDb } from './index';
import type {
  DevholmPluginManifest,
  PluginLifecycleState,
  PluginOperationStatus,
} from '@core/types/plugins';

export interface InstalledPluginRecord {
  pluginId: string;
  bundledVersion: string;
  installedVersion: string | null;
  enabled: boolean;
  lifecycleState: PluginLifecycleState;
  operationStatus: PluginOperationStatus;
  installedAt: Date | null;
  upgradedAt: Date | null;
  disabledAt: Date | null;
  updatedAt: Date | null;
  lastError: string | null;
  manifestChecksum: string | null;
}

export function checksum(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function checksumManifest(manifest: DevholmPluginManifest): string {
  return checksum(JSON.stringify(manifest));
}

export async function upsertPluginLedgerRecord(input: {
  manifest: DevholmPluginManifest;
  state: PluginLifecycleState;
  operationStatus: PluginOperationStatus;
  enabled: boolean;
  installedVersion: string | null;
  installedAt?: Date | null;
  upgradedAt?: Date | null;
  disabledAt?: Date | null;
  lastError?: string | null;
}): Promise<void> {
  const db = getDb();
  const now = new Date();
  const installedAt = input.installedAt === undefined ? null : input.installedAt;
  const upgradedAt = input.upgradedAt === undefined ? null : input.upgradedAt;
  const disabledAt = input.disabledAt === undefined ? null : input.disabledAt;
  await db('devholm_plugins')
    .insert({
      plugin_id: input.manifest.id,
      bundled_version: input.manifest.version,
      installed_version: input.installedVersion,
      enabled: input.enabled,
      lifecycle_state: input.state,
      operation_status: input.operationStatus,
      installed_at: installedAt,
      upgraded_at: upgradedAt,
      disabled_at: disabledAt,
      last_error: input.lastError ?? null,
      manifest_checksum: checksumManifest(input.manifest),
      updated_at: now,
    })
    .onConflict('plugin_id')
    .merge({
      bundled_version: input.manifest.version,
      installed_version: input.installedVersion,
      enabled: input.enabled,
      lifecycle_state: input.state,
      operation_status: input.operationStatus,
      installed_at: installedAt,
      upgraded_at: upgradedAt,
      disabled_at: disabledAt,
      last_error: input.lastError ?? null,
      manifest_checksum: checksumManifest(input.manifest),
      updated_at: now,
    });
}

export async function getInstalledPlugin(pluginId: string): Promise<InstalledPluginRecord | null> {
  const db = getDb();
  const row = await db('devholm_plugins').where({ plugin_id: pluginId }).first();
  if (!row) {
    return null;
  }

  return {
    pluginId: row.plugin_id,
    bundledVersion: row.bundled_version,
    installedVersion: row.installed_version,
    enabled: Boolean(row.enabled),
    lifecycleState: row.lifecycle_state,
    operationStatus: row.operation_status,
    installedAt: row.installed_at,
    upgradedAt: row.upgraded_at,
    disabledAt: row.disabled_at,
    updatedAt: row.updated_at,
    lastError: row.last_error,
    manifestChecksum: row.manifest_checksum,
  };
}

export async function listInstalledPlugins(): Promise<InstalledPluginRecord[]> {
  const db = getDb();
  const rows = await db('devholm_plugins').select('*').orderBy('plugin_id', 'asc');

  return rows.map((row) => ({
    pluginId: row.plugin_id,
    bundledVersion: row.bundled_version,
    installedVersion: row.installed_version,
    enabled: Boolean(row.enabled),
    lifecycleState: row.lifecycle_state,
    operationStatus: row.operation_status,
    installedAt: row.installed_at,
    upgradedAt: row.upgraded_at,
    disabledAt: row.disabled_at,
    updatedAt: row.updated_at,
    lastError: row.last_error,
    manifestChecksum: row.manifest_checksum,
  }));
}

export async function insertPluginMigrationLedger(input: {
  pluginId: string;
  migrationId: string;
  pluginVersion: string;
  checksum: string;
  appliedAt: Date;
  durationMs: number;
  batchOrder: number;
  db?: Knex;
}): Promise<void> {
  const db = input.db ?? getDb();
  await db('devholm_plugin_migrations')
    .insert({
      plugin_id: input.pluginId,
      migration_id: input.migrationId,
      plugin_version: input.pluginVersion,
      checksum: input.checksum,
      applied_at: input.appliedAt,
      execution_duration_ms: input.durationMs,
      batch_order: input.batchOrder,
      created_at: new Date(),
    })
    .onConflict(['plugin_id', 'migration_id'])
    .ignore();
}

export async function getPluginMigrationLedger(pluginId: string): Promise<
  Array<{
    migrationId: string;
    checksum: string;
    pluginVersion: string;
  }>
> {
  const db = getDb();
  return getPluginMigrationLedgerWithDb(pluginId, db);
}

export async function getPluginMigrationLedgerWithDb(
  pluginId: string,
  db: Knex
): Promise<
  Array<{
    migrationId: string;
    checksum: string;
    pluginVersion: string;
  }>
> {
  const rows = await db('devholm_plugin_migrations')
    .select('migration_id', 'checksum', 'plugin_version')
    .where({ plugin_id: pluginId })
    .orderBy('migration_id', 'asc');

  return rows.map((row) => ({
    migrationId: row.migration_id,
    checksum: row.checksum,
    pluginVersion: row.plugin_version,
  }));
}
