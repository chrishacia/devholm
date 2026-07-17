import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { getDb } from './index';

export type PluginMigrationCheckpointDirection = 'up' | 'down';

export type PluginMigrationCheckpointStatus =
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'interrupted'
  | 'blocked';

export interface PluginMigrationCheckpointRecord {
  checkpointId: string;
  operationId: string;
  pluginId: string;
  pluginVersion: string;
  migrationId: string;
  direction: PluginMigrationCheckpointDirection;
  status: PluginMigrationCheckpointStatus;
  attemptCount: number;
  irreversible: boolean;
  checksum?: string;
  startedAt: string;
  completedAt?: string;
  errorCode?: string;
  publicMessage?: string;
  internalDiagnostic?: string;
  createdAt: string;
  updatedAt: string;
}

export async function startPluginMigrationCheckpoint(
  input: {
    operationId: string;
    pluginId: string;
    pluginVersion: string;
    migrationId: string;
    direction: PluginMigrationCheckpointDirection;
    attemptCount: number;
    irreversible: boolean;
    checksum?: string;
  },
  db: Knex = getDb()
): Promise<PluginMigrationCheckpointRecord> {
  const now = new Date().toISOString();
  const checkpointId = randomUUID();

  await db('devholm_plugin_migration_checkpoints').insert({
    checkpoint_id: checkpointId,
    operation_id: input.operationId,
    plugin_id: input.pluginId,
    plugin_version: input.pluginVersion,
    migration_id: input.migrationId,
    direction: input.direction,
    status: 'running',
    attempt_count: input.attemptCount,
    irreversible: input.irreversible,
    checksum: input.checksum ?? null,
    started_at: now,
    completed_at: null,
    error_code: null,
    public_message: null,
    internal_diagnostic: null,
    created_at: now,
    updated_at: now,
  });

  return {
    checkpointId,
    operationId: input.operationId,
    pluginId: input.pluginId,
    pluginVersion: input.pluginVersion,
    migrationId: input.migrationId,
    direction: input.direction,
    status: 'running',
    attemptCount: input.attemptCount,
    irreversible: input.irreversible,
    checksum: input.checksum,
    startedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

export async function markPluginMigrationCheckpointCompleted(
  checkpointId: string,
  db: Knex = getDb()
): Promise<void> {
  const now = new Date().toISOString();
  await db('devholm_plugin_migration_checkpoints').where({ checkpoint_id: checkpointId }).update({
    status: 'succeeded',
    completed_at: now,
    updated_at: now,
  });
}

export async function markPluginMigrationCheckpointFailed(
  input: {
    checkpointId: string;
    status?: Extract<PluginMigrationCheckpointStatus, 'failed' | 'blocked' | 'interrupted'>;
    errorCode?: string;
    publicMessage?: string;
    internalDiagnostic?: string;
  },
  db: Knex = getDb()
): Promise<void> {
  const now = new Date().toISOString();
  await db('devholm_plugin_migration_checkpoints')
    .where({ checkpoint_id: input.checkpointId })
    .update({
      status: input.status ?? 'failed',
      completed_at: now,
      error_code: input.errorCode ?? null,
      public_message: input.publicMessage ?? null,
      internal_diagnostic: input.internalDiagnostic ?? null,
      updated_at: now,
    });
}

export async function readCompletedPluginMigrationCheckpoints(
  pluginId: string,
  db: Knex = getDb()
): Promise<PluginMigrationCheckpointRecord[]> {
  const rows = await db('devholm_plugin_migration_checkpoints')
    .where({ plugin_id: pluginId, status: 'succeeded' })
    .orderBy('started_at', 'asc');

  return rows.map(mapCheckpointRow);
}

export async function readInterruptedPluginMigrationCheckpoint(
  pluginId: string,
  db: Knex = getDb()
): Promise<PluginMigrationCheckpointRecord | null> {
  const row = await db('devholm_plugin_migration_checkpoints')
    .where({ plugin_id: pluginId, status: 'running' })
    .orderBy('started_at', 'asc')
    .first();

  if (!row) {
    return null;
  }

  return mapCheckpointRow(row);
}

export async function determinePluginRollbackCompatibility(
  pluginId: string,
  db: Knex = getDb()
): Promise<{
  rollbackCompatible: boolean;
  reason: 'compatible' | 'irreversible-migrations-present';
}> {
  const irreversible = await db('devholm_plugin_migration_checkpoints')
    .where({ plugin_id: pluginId, status: 'succeeded', direction: 'up', irreversible: true })
    .first();

  if (irreversible) {
    return {
      rollbackCompatible: false,
      reason: 'irreversible-migrations-present',
    };
  }

  return {
    rollbackCompatible: true,
    reason: 'compatible',
  };
}

function mapCheckpointRow(row: Record<string, unknown>): PluginMigrationCheckpointRecord {
  return {
    checkpointId: String(row.checkpoint_id),
    operationId: String(row.operation_id),
    pluginId: String(row.plugin_id),
    pluginVersion: String(row.plugin_version),
    migrationId: String(row.migration_id),
    direction: row.direction as PluginMigrationCheckpointDirection,
    status: row.status as PluginMigrationCheckpointStatus,
    attemptCount: Number(row.attempt_count),
    irreversible: Boolean(row.irreversible),
    checksum: row.checksum ? String(row.checksum) : undefined,
    startedAt: String(row.started_at),
    completedAt: row.completed_at ? String(row.completed_at) : undefined,
    errorCode: row.error_code ? String(row.error_code) : undefined,
    publicMessage: row.public_message ? String(row.public_message) : undefined,
    internalDiagnostic: row.internal_diagnostic ? String(row.internal_diagnostic) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
