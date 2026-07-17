import { createHash } from 'crypto';
import type { Knex } from 'knex';
import { getDb } from './index';
import type {
  DevholmPluginManifest,
  PluginLifecycleState,
  PluginOperationStatus,
} from '@core/types/plugins';

export type PluginLifecycleMutationAction =
  | 'install'
  | 'enable'
  | 'disable'
  | 'update'
  | 'rollback'
  | 'recover';

export type PluginLifecycleMutationStatus =
  | 'requested'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'interrupted';

export type PluginLifecycleMutationPhase = 'requested' | 'executing' | 'completed';

export interface PluginLifecycleStateSnapshot {
  installed: boolean;
  enabled: boolean;
  lifecycleState: string;
  operationStatus: string;
  installedVersion: string | null;
  bundledVersion: string | null;
  updatedAt: string | null;
}

export interface PluginLifecycleOperationRecord {
  schemaVersion: 1;
  operationId: string;
  pluginId: string;
  action: PluginLifecycleMutationAction;
  idempotencyKey?: string;
  status: PluginLifecycleMutationStatus;
  actor?: string;
  leaseOwner?: string;
  leaseExpiresAt?: string;
  expectedLifecycleState?: string;
  authorizationContext?: Record<string, unknown>;
  mutationAuthorityVersion?: string;
  correlationId: string;
  currentPhase: PluginLifecycleMutationPhase;
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
  attemptCount: number;
  priorStateSnapshot: PluginLifecycleStateSnapshot | null;
  nextStateSnapshot?: PluginLifecycleStateSnapshot | null;
  error?: {
    code?: string;
    message: string;
    retryable?: boolean;
    recoveryClassification?: string;
  };
}

export interface PluginLifecycleTransitionEventRecord {
  schemaVersion: 1;
  eventId: string;
  operationId: string;
  pluginId: string;
  transition: PluginLifecycleMutationAction;
  result: 'succeeded' | 'failed';
  actor?: string;
  correlationId: string;
  timestamp: string;
  previousState: PluginLifecycleStateSnapshot | null;
  nextState: PluginLifecycleStateSnapshot | null;
  desiredState?: string | null;
  buildReference?: Record<string, unknown> | null;
  deploymentReference?: Record<string, unknown> | null;
  pluginVersion?: string | null;
  artifactDigest?: string | null;
  error?: {
    code?: string;
    message: string;
    retryable?: boolean;
    recoveryClassification?: string;
  };
}

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

function lifecycleOperationsTable(db: Knex) {
  return db('devholm_plugin_lifecycle_operations');
}

function lifecycleEventsTable(db: Knex) {
  return db('devholm_plugin_lifecycle_events');
}

export async function writePluginLifecycleOperationRecord(
  record: PluginLifecycleOperationRecord,
  db: Knex = getDb()
): Promise<void> {
  const payload = {
    schema_version: record.schemaVersion,
    operation_id: record.operationId,
    plugin_id: record.pluginId,
    action: record.action,
    idempotency_key: record.idempotencyKey ?? null,
    status: record.status,
    actor: record.actor ?? null,
    lease_owner: record.leaseOwner ?? null,
    lease_expires_at: record.leaseExpiresAt ?? null,
    expected_lifecycle_state: record.expectedLifecycleState ?? null,
    authorization_context: record.authorizationContext
      ? JSON.stringify(record.authorizationContext)
      : null,
    mutation_authority_version: record.mutationAuthorityVersion ?? 'v1',
    correlation_id: record.correlationId,
    current_phase: record.currentPhase,
    started_at: record.startedAt,
    updated_at: record.updatedAt,
    finished_at: record.finishedAt ?? null,
    attempt_count: record.attemptCount,
    prior_state_snapshot: record.priorStateSnapshot
      ? JSON.stringify(record.priorStateSnapshot)
      : null,
    next_state_snapshot: record.nextStateSnapshot ? JSON.stringify(record.nextStateSnapshot) : null,
    error_code: record.error?.code ?? null,
    public_message: record.error?.message ?? null,
    internal_diagnostic: record.error?.message ?? null,
    retryable: record.error?.retryable ?? false,
    recovery_classification: record.error?.recoveryClassification ?? null,
  };

  await lifecycleOperationsTable(db)
    .insert({
      ...payload,
      created_at: new Date(),
    })
    .onConflict('operation_id')
    .merge(payload);
}

export async function writePluginLifecycleTransitionEvent(
  event: PluginLifecycleTransitionEventRecord,
  db: Knex = getDb()
): Promise<void> {
  const payload = {
    schema_version: event.schemaVersion,
    event_id: event.eventId,
    operation_id: event.operationId,
    plugin_id: event.pluginId,
    transition: event.transition,
    result: event.result,
    actor: event.actor ?? null,
    correlation_id: event.correlationId,
    timestamp: event.timestamp,
    previous_state: event.previousState ? JSON.stringify(event.previousState) : null,
    next_state: event.nextState ? JSON.stringify(event.nextState) : null,
    desired_state: event.desiredState ?? null,
    build_reference: event.buildReference ? JSON.stringify(event.buildReference) : null,
    deployment_reference: event.deploymentReference
      ? JSON.stringify(event.deploymentReference)
      : null,
    plugin_version: event.pluginVersion ?? null,
    artifact_digest: event.artifactDigest ?? null,
    error_code: event.error?.code ?? null,
    public_message: event.error?.message ?? null,
    internal_diagnostic: event.error?.message ?? null,
    retryable: event.error?.retryable ?? false,
    recovery_classification: event.error?.recoveryClassification ?? null,
    created_at: new Date(),
  };

  await lifecycleEventsTable(db).insert(payload).onConflict('event_id').ignore();
}

export async function readLatestPluginLifecycleOperationRecord(
  pluginId: string,
  db: Knex = getDb()
): Promise<PluginLifecycleOperationRecord | null> {
  const row = await lifecycleOperationsTable(db)
    .where({ plugin_id: pluginId })
    .orderBy('updated_at', 'desc')
    .first();

  if (!row) {
    return null;
  }

  return {
    schemaVersion: Number(row.schema_version ?? 1) as 1,
    operationId: String(row.operation_id),
    pluginId: String(row.plugin_id),
    action: row.action as PluginLifecycleMutationAction,
    idempotencyKey: row.idempotency_key ? String(row.idempotency_key) : undefined,
    status: row.status as PluginLifecycleMutationStatus,
    actor: row.actor ?? undefined,
    leaseOwner: row.lease_owner ? String(row.lease_owner) : undefined,
    leaseExpiresAt: row.lease_expires_at ? String(row.lease_expires_at) : undefined,
    expectedLifecycleState: row.expected_lifecycle_state
      ? String(row.expected_lifecycle_state)
      : undefined,
    authorizationContext: row.authorization_context
      ? (JSON.parse(String(row.authorization_context)) as Record<string, unknown>)
      : undefined,
    mutationAuthorityVersion: row.mutation_authority_version
      ? String(row.mutation_authority_version)
      : 'v1',
    correlationId: String(row.correlation_id),
    currentPhase: row.current_phase as PluginLifecycleMutationPhase,
    startedAt: String(row.started_at),
    updatedAt: String(row.updated_at),
    finishedAt: row.finished_at ? String(row.finished_at) : undefined,
    attemptCount: Number(row.attempt_count ?? 1),
    priorStateSnapshot: row.prior_state_snapshot
      ? JSON.parse(String(row.prior_state_snapshot))
      : null,
    nextStateSnapshot: row.next_state_snapshot
      ? JSON.parse(String(row.next_state_snapshot))
      : undefined,
    error:
      row.error_code || row.public_message || row.recovery_classification
        ? {
            code: row.error_code ?? undefined,
            message: String(
              row.public_message ?? row.internal_diagnostic ?? 'Unknown lifecycle error'
            ),
            retryable: Boolean(row.retryable),
            recoveryClassification: row.recovery_classification ?? undefined,
          }
        : undefined,
  };
}

export async function findPluginLifecycleOperationByIdempotencyKey(
  pluginId: string,
  idempotencyKey: string,
  db: Knex = getDb()
): Promise<PluginLifecycleOperationRecord | null> {
  const row = await lifecycleOperationsTable(db)
    .where({ plugin_id: pluginId, idempotency_key: idempotencyKey })
    .orderBy('updated_at', 'desc')
    .first();

  if (!row) {
    return null;
  }

  return {
    schemaVersion: Number(row.schema_version ?? 1) as 1,
    operationId: String(row.operation_id),
    pluginId: String(row.plugin_id),
    action: row.action as PluginLifecycleMutationAction,
    idempotencyKey: row.idempotency_key ? String(row.idempotency_key) : undefined,
    status: row.status as PluginLifecycleMutationStatus,
    actor: row.actor ?? undefined,
    leaseOwner: row.lease_owner ? String(row.lease_owner) : undefined,
    leaseExpiresAt: row.lease_expires_at ? String(row.lease_expires_at) : undefined,
    expectedLifecycleState: row.expected_lifecycle_state
      ? String(row.expected_lifecycle_state)
      : undefined,
    authorizationContext: row.authorization_context
      ? (JSON.parse(String(row.authorization_context)) as Record<string, unknown>)
      : undefined,
    mutationAuthorityVersion: row.mutation_authority_version
      ? String(row.mutation_authority_version)
      : 'v1',
    correlationId: String(row.correlation_id),
    currentPhase: row.current_phase as PluginLifecycleMutationPhase,
    startedAt: String(row.started_at),
    updatedAt: String(row.updated_at),
    finishedAt: row.finished_at ? String(row.finished_at) : undefined,
    attemptCount: Number(row.attempt_count ?? 1),
    priorStateSnapshot: row.prior_state_snapshot
      ? JSON.parse(String(row.prior_state_snapshot))
      : null,
    nextStateSnapshot: row.next_state_snapshot
      ? JSON.parse(String(row.next_state_snapshot))
      : undefined,
    error:
      row.error_code || row.public_message || row.recovery_classification
        ? {
            code: row.error_code ?? undefined,
            message: String(
              row.public_message ?? row.internal_diagnostic ?? 'Unknown lifecycle error'
            ),
            retryable: Boolean(row.retryable),
            recoveryClassification: row.recovery_classification ?? undefined,
          }
        : undefined,
  };
}

export async function findActivePluginLifecycleOperation(
  pluginId: string,
  db: Knex = getDb()
): Promise<PluginLifecycleOperationRecord | null> {
  const row = await lifecycleOperationsTable(db)
    .where({ plugin_id: pluginId })
    .whereIn('status', ['requested', 'running'])
    .orderBy('updated_at', 'desc')
    .first();

  if (!row) {
    return null;
  }

  return {
    schemaVersion: Number(row.schema_version ?? 1) as 1,
    operationId: String(row.operation_id),
    pluginId: String(row.plugin_id),
    action: row.action as PluginLifecycleMutationAction,
    idempotencyKey: row.idempotency_key ? String(row.idempotency_key) : undefined,
    status: row.status as PluginLifecycleMutationStatus,
    actor: row.actor ?? undefined,
    leaseOwner: row.lease_owner ? String(row.lease_owner) : undefined,
    leaseExpiresAt: row.lease_expires_at ? String(row.lease_expires_at) : undefined,
    expectedLifecycleState: row.expected_lifecycle_state
      ? String(row.expected_lifecycle_state)
      : undefined,
    authorizationContext: row.authorization_context
      ? (JSON.parse(String(row.authorization_context)) as Record<string, unknown>)
      : undefined,
    mutationAuthorityVersion: row.mutation_authority_version
      ? String(row.mutation_authority_version)
      : 'v1',
    correlationId: String(row.correlation_id),
    currentPhase: row.current_phase as PluginLifecycleMutationPhase,
    startedAt: String(row.started_at),
    updatedAt: String(row.updated_at),
    finishedAt: row.finished_at ? String(row.finished_at) : undefined,
    attemptCount: Number(row.attempt_count ?? 1),
    priorStateSnapshot: row.prior_state_snapshot
      ? JSON.parse(String(row.prior_state_snapshot))
      : null,
    nextStateSnapshot: row.next_state_snapshot
      ? JSON.parse(String(row.next_state_snapshot))
      : undefined,
    error:
      row.error_code || row.public_message || row.recovery_classification
        ? {
            code: row.error_code ?? undefined,
            message: String(
              row.public_message ?? row.internal_diagnostic ?? 'Unknown lifecycle error'
            ),
            retryable: Boolean(row.retryable),
            recoveryClassification: row.recovery_classification ?? undefined,
          }
        : undefined,
  };
}

export async function readLatestPluginLifecycleTransitionEventRecord(
  pluginId: string,
  db: Knex = getDb()
): Promise<PluginLifecycleTransitionEventRecord | null> {
  const row = await lifecycleEventsTable(db)
    .where({ plugin_id: pluginId })
    .orderBy('timestamp', 'desc')
    .first();

  if (!row) {
    return null;
  }

  return {
    schemaVersion: Number(row.schema_version ?? 1) as 1,
    eventId: String(row.event_id),
    operationId: String(row.operation_id),
    pluginId: String(row.plugin_id),
    transition: row.transition as PluginLifecycleMutationAction,
    result: row.result as 'succeeded' | 'failed',
    actor: row.actor ?? undefined,
    correlationId: String(row.correlation_id),
    timestamp: String(row.timestamp),
    previousState: row.previous_state ? JSON.parse(String(row.previous_state)) : null,
    nextState: row.next_state ? JSON.parse(String(row.next_state)) : null,
    desiredState: row.desired_state ? String(row.desired_state) : null,
    buildReference: row.build_reference ? JSON.parse(String(row.build_reference)) : null,
    deploymentReference: row.deployment_reference
      ? JSON.parse(String(row.deployment_reference))
      : null,
    pluginVersion: row.plugin_version ? String(row.plugin_version) : null,
    artifactDigest: row.artifact_digest ? String(row.artifact_digest) : null,
    error:
      row.error_code || row.public_message || row.recovery_classification
        ? {
            code: row.error_code ?? undefined,
            message: String(
              row.public_message ?? row.internal_diagnostic ?? 'Unknown lifecycle error'
            ),
            retryable: Boolean(row.retryable),
            recoveryClassification: row.recovery_classification ?? undefined,
          }
        : undefined,
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
  direction?: 'up' | 'down';
  operationId?: string;
  executionId?: string;
  sourceVersion?: string;
  targetVersion?: string;
  artifactIdentity?: string;
  assignedSchema?: string;
  state?: 'succeeded' | 'failed' | 'blocked';
  startedAt?: Date;
  completedAt?: Date;
  rollbackOfExecutionId?: string | null;
  errorCategory?: string | null;
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
      direction: input.direction ?? 'up',
      operation_id: input.operationId ?? null,
      execution_id: input.executionId ?? null,
      source_version: input.sourceVersion ?? null,
      target_version: input.targetVersion ?? null,
      artifact_identity: input.artifactIdentity ?? null,
      assigned_schema: input.assignedSchema ?? null,
      state: input.state ?? 'succeeded',
      started_at: input.startedAt ?? input.appliedAt,
      completed_at: input.completedAt ?? input.appliedAt,
      rollback_of_execution_id: input.rollbackOfExecutionId ?? null,
      error_category: input.errorCategory ?? null,
      created_at: new Date(),
    })
    .onConflict(['plugin_id', 'migration_id', 'direction'])
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
    .where({ plugin_id: pluginId, direction: 'up', state: 'succeeded' })
    .orderBy('migration_id', 'asc');

  return rows.map((row) => ({
    migrationId: row.migration_id,
    checksum: row.checksum,
    pluginVersion: row.plugin_version,
  }));
}
