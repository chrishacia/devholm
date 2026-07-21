import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { getDb } from './index';

export type PluginCutoverReconciliationPhase =
  | 'not-started'
  | 'inspected'
  | 'safe-migration-planned'
  | 'migration-running'
  | 'canonical-record-established'
  | 'settings-data-preserved'
  | 'lifecycle-state-reconciled'
  | 'canonical-ownership-activated'
  | 'legacy-path-decommissioned'
  | 'cleanup-completed'
  | 'rollback-pending'
  | 'recovery-required'
  | 'manual-intervention-required';

export type PluginCutoverReconciliationEventResult = 'applied' | 'noop' | 'blocked' | 'failed';

export interface PluginCutoverReconciliationStateRecord {
  pluginId: string;
  phase: PluginCutoverReconciliationPhase;
  operationId: string | null;
  correlationId: string | null;
  classification: string | null;
  blocking: boolean;
  reason: string | null;
  evidence: Record<string, unknown> | null;
  snapshot: Record<string, unknown> | null;
  inspectedAt: string | null;
  phaseUpdatedAt: string;
  createdAt: string;
  updatedAt: string;
}

const CUTOVER_PHASE_ORDER: readonly PluginCutoverReconciliationPhase[] = [
  'not-started',
  'inspected',
  'safe-migration-planned',
  'migration-running',
  'canonical-record-established',
  'settings-data-preserved',
  'lifecycle-state-reconciled',
  'canonical-ownership-activated',
  'legacy-path-decommissioned',
  'cleanup-completed',
];

function parseJsonColumn<T>(value: unknown): T {
  if (value == null) {
    return value as T;
  }

  if (typeof value === 'string') {
    return JSON.parse(value) as T;
  }

  return value as T;
}

function phaseRank(phase: PluginCutoverReconciliationPhase): number {
  const index = CUTOVER_PHASE_ORDER.indexOf(phase);
  return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
}

function resolveNextPhase(
  previous: PluginCutoverReconciliationPhase | null,
  requested: PluginCutoverReconciliationPhase
): PluginCutoverReconciliationPhase {
  if (requested === 'rollback-pending') {
    return 'rollback-pending';
  }

  if (
    requested === 'recovery-required' ||
    requested === 'manual-intervention-required' ||
    previous === 'recovery-required' ||
    previous === 'manual-intervention-required'
  ) {
    return requested;
  }

  if (!previous) {
    return requested;
  }

  return phaseRank(requested) >= phaseRank(previous) ? requested : previous;
}

function mapRow(row: Record<string, unknown>): PluginCutoverReconciliationStateRecord {
  return {
    pluginId: String(row.plugin_id),
    phase: row.phase as PluginCutoverReconciliationPhase,
    operationId: row.operation_id ? String(row.operation_id) : null,
    correlationId: row.correlation_id ? String(row.correlation_id) : null,
    classification: row.classification ? String(row.classification) : null,
    blocking: Boolean(row.blocking),
    reason: row.reason ? String(row.reason) : null,
    evidence: row.evidence ? parseJsonColumn<Record<string, unknown>>(row.evidence) : null,
    snapshot: row.snapshot ? parseJsonColumn<Record<string, unknown>>(row.snapshot) : null,
    inspectedAt: row.inspected_at ? String(row.inspected_at) : null,
    phaseUpdatedAt: String(row.phase_updated_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function readPluginCutoverReconciliationState(
  pluginId: string,
  db: Knex = getDb()
): Promise<PluginCutoverReconciliationStateRecord | null> {
  const row = await db('devholm_plugin_cutover_reconciliation_states')
    .where({ plugin_id: pluginId })
    .first();

  if (!row) {
    return null;
  }

  return mapRow(row);
}

export async function listPluginCutoverReconciliationStates(
  pluginIds?: string[],
  db: Knex = getDb()
): Promise<PluginCutoverReconciliationStateRecord[]> {
  let query = db('devholm_plugin_cutover_reconciliation_states')
    .select('*')
    .orderBy('plugin_id', 'asc');
  if (pluginIds && pluginIds.length > 0) {
    query = query.whereIn('plugin_id', pluginIds);
  }

  const rows = await query;
  return rows.map((row) => mapRow(row));
}

export async function upsertPluginCutoverReconciliationState(
  input: {
    pluginId: string;
    phase: PluginCutoverReconciliationPhase;
    operationId?: string | null;
    correlationId?: string | null;
    classification?: string | null;
    blocking: boolean;
    reason?: string | null;
    evidence?: Record<string, unknown> | null;
    snapshot?: Record<string, unknown> | null;
    inspectedAt?: string | null;
  },
  db: Knex = getDb()
): Promise<PluginCutoverReconciliationStateRecord> {
  const now = new Date();
  const previous = await readPluginCutoverReconciliationState(input.pluginId, db);
  const nextPhase = resolveNextPhase(previous?.phase ?? null, input.phase);

  await db('devholm_plugin_cutover_reconciliation_states')
    .insert({
      plugin_id: input.pluginId,
      phase: nextPhase,
      operation_id: input.operationId ?? null,
      correlation_id: input.correlationId ?? null,
      classification: input.classification ?? null,
      blocking: input.blocking,
      reason: input.reason ?? null,
      evidence: input.evidence ? JSON.stringify(input.evidence) : null,
      snapshot: input.snapshot ? JSON.stringify(input.snapshot) : null,
      inspected_at: input.inspectedAt ? new Date(input.inspectedAt) : now,
      phase_updated_at: now,
      updated_at: now,
      created_at: now,
    })
    .onConflict('plugin_id')
    .merge({
      phase: nextPhase,
      operation_id: input.operationId ?? null,
      correlation_id: input.correlationId ?? null,
      classification: input.classification ?? null,
      blocking: input.blocking,
      reason: input.reason ?? null,
      evidence: input.evidence ? JSON.stringify(input.evidence) : null,
      snapshot: input.snapshot ? JSON.stringify(input.snapshot) : null,
      inspected_at: input.inspectedAt
        ? new Date(input.inspectedAt)
        : previous?.inspectedAt
          ? new Date(previous.inspectedAt)
          : now,
      phase_updated_at: now,
      updated_at: now,
    });

  const state = await readPluginCutoverReconciliationState(input.pluginId, db);
  if (!state) {
    throw new Error(`Failed to persist cutover reconciliation state for ${input.pluginId}`);
  }

  return state;
}

export async function appendPluginCutoverReconciliationEvent(
  input: {
    pluginId: string;
    phase: PluginCutoverReconciliationPhase;
    result: PluginCutoverReconciliationEventResult;
    operationId?: string | null;
    correlationId?: string | null;
    classification?: string | null;
    blocking: boolean;
    reason?: string | null;
    evidence?: Record<string, unknown> | null;
    snapshot?: Record<string, unknown> | null;
    timestamp?: string;
    eventId?: string;
  },
  db: Knex = getDb()
): Promise<void> {
  const timestamp = input.timestamp ? new Date(input.timestamp) : new Date();
  const eventId = input.eventId ?? randomUUID();

  await db('devholm_plugin_cutover_reconciliation_events').insert({
    event_id: eventId,
    plugin_id: input.pluginId,
    phase: input.phase,
    result: input.result,
    operation_id: input.operationId ?? null,
    correlation_id: input.correlationId ?? null,
    classification: input.classification ?? null,
    blocking: input.blocking,
    reason: input.reason ?? null,
    evidence: input.evidence ? JSON.stringify(input.evidence) : null,
    snapshot: input.snapshot ? JSON.stringify(input.snapshot) : null,
    timestamp,
    created_at: timestamp,
  });
}
