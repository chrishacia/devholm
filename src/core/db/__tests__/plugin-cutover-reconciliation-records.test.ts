import { beforeEach, describe, expect, it, vi } from 'vitest';

const getDb = vi.hoisted(() => vi.fn());

vi.mock('@/db', () => ({
  getDb,
}));

describe('core/db plugin cutover reconciliation records', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('upserts cutover reconciliation state and preserves monotonic phase progression', async () => {
    let stateRow: Record<string, unknown> | null = null;

    const first = vi.fn(async () => stateRow);
    const where = vi.fn(() => ({ first }));
    const merge = vi.fn(async (payload: Record<string, unknown>) => {
      stateRow = {
        ...(stateRow ?? {}),
        ...payload,
        plugin_id: payload.plugin_id ?? stateRow?.plugin_id,
      };
    });
    const onConflict = vi.fn(() => ({ merge }));
    const insert = vi.fn((payload: Record<string, unknown>) => {
      if (!stateRow) {
        stateRow = {
          ...payload,
          plugin_id: payload.plugin_id,
          created_at: payload.created_at,
          updated_at: payload.updated_at,
        };
      }
      return { onConflict };
    });

    const tableFactory = vi.fn((tableName: string) => {
      if (tableName !== 'devholm_plugin_cutover_reconciliation_states') {
        throw new Error(`unexpected table ${tableName}`);
      }
      return {
        where,
        insert,
      };
    });

    getDb.mockReturnValue(tableFactory);

    const { upsertPluginCutoverReconciliationState, readPluginCutoverReconciliationState } =
      await import('@core/db/plugin-cutover-reconciliation');

    const initial = await upsertPluginCutoverReconciliationState({
      pluginId: 'url-shortener',
      phase: 'inspected',
      blocking: false,
      classification: 'safe-automatic-migration',
      reason: 'Inspected and eligible for migration planning.',
      evidence: { installed: false },
    });

    expect(initial.phase).toBe('inspected');

    const regressed = await upsertPluginCutoverReconciliationState({
      pluginId: 'url-shortener',
      phase: 'safe-migration-planned',
      blocking: false,
      classification: 'safe-automatic-migration',
      reason: 'Planning complete.',
      evidence: { installed: false },
    });

    expect(regressed.phase).toBe('safe-migration-planned');

    const recovery = await upsertPluginCutoverReconciliationState({
      pluginId: 'url-shortener',
      phase: 'recovery-required',
      blocking: true,
      classification: 'recovery-required',
      reason: 'Interrupted checkpoint requires recovery.',
      evidence: { interrupted: true },
    });

    expect(recovery.phase).toBe('recovery-required');

    const attemptedRegressionFromRecovery = await upsertPluginCutoverReconciliationState({
      pluginId: 'url-shortener',
      phase: 'inspected',
      blocking: true,
      classification: 'recovery-required',
      reason: 'Still blocked.',
      evidence: { interrupted: true },
    });

    expect(attemptedRegressionFromRecovery.phase).toBe('inspected');

    const readBack = await readPluginCutoverReconciliationState('url-shortener');
    expect(readBack).not.toBeNull();
    expect(readBack?.pluginId).toBe('url-shortener');
    expect(readBack?.classification).toBe('recovery-required');
  });

  it('appends cutover reconciliation events as audit records', async () => {
    const insert = vi.fn(async () => undefined);
    const tableFactory = vi.fn((tableName: string) => {
      if (tableName !== 'devholm_plugin_cutover_reconciliation_events') {
        throw new Error(`unexpected table ${tableName}`);
      }
      return { insert };
    });

    getDb.mockReturnValue(tableFactory);

    const { appendPluginCutoverReconciliationEvent } = await import(
      '@core/db/plugin-cutover-reconciliation'
    );

    await appendPluginCutoverReconciliationEvent({
      pluginId: 'calendar',
      phase: 'inspected',
      result: 'applied',
      operationId: 'op-1',
      correlationId: 'corr-1',
      classification: 'already-canonical',
      blocking: false,
      reason: 'No action needed.',
      evidence: { installed: true },
    });

    expect(insert).toHaveBeenCalledTimes(1);
    const payload = ((insert.mock.calls as unknown as Array<Array<unknown>>).at(0)?.at(0) ??
      {}) as Record<string, unknown>;
    expect(payload.plugin_id).toBe('calendar');
    expect(payload.phase).toBe('inspected');
    expect(payload.result).toBe('applied');
  });
});
