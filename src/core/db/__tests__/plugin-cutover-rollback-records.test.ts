import { beforeEach, describe, expect, it, vi } from 'vitest';

const getDb = vi.hoisted(() => vi.fn());

vi.mock('@/db', () => ({
  getDb,
}));

describe('core/db plugin cutover rollback records', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('derives deterministic rollback plans for required stages', async () => {
    const { deriveCutoverRollbackPlanFromPhase } = await import('@core/db/plugin-cutover-rollback');

    expect(deriveCutoverRollbackPlanFromPhase('not-started').stage).toBe(
      'before-canonical-lifecycle-creation'
    );
    expect(deriveCutoverRollbackPlanFromPhase('canonical-record-established').stage).toBe(
      'after-canonical-lifecycle-creation'
    );
    expect(deriveCutoverRollbackPlanFromPhase('settings-data-preserved').stage).toBe(
      'after-enabled-settings-reconciliation'
    );
    expect(deriveCutoverRollbackPlanFromPhase('canonical-ownership-activated').stage).toBe(
      'before-legacy-decommission'
    );
    expect(deriveCutoverRollbackPlanFromPhase('legacy-path-decommissioned').stage).toBe(
      'after-legacy-decommission-initiation'
    );

    const cleanup = deriveCutoverRollbackPlanFromPhase('cleanup-completed');
    expect(cleanup.rollbackEligible).toBe(false);
    expect(cleanup.irreversibleBoundary).toBe(true);
  });

  it('upserts rollback checkpoint idempotently per plugin/stage/attempt', async () => {
    let checkpointRow: Record<string, unknown> | null = null;

    const first = vi.fn(async () => checkpointRow);
    const where = vi.fn(() => ({ first }));
    const merge = vi.fn(async (payload: Record<string, unknown>) => {
      checkpointRow = {
        ...(checkpointRow ?? {}),
        ...payload,
        plugin_id: (checkpointRow?.plugin_id as string) || 'url-shortener',
        stage: (checkpointRow?.stage as string) || 'after-enabled-settings-reconciliation',
        attempt_count: (checkpointRow?.attempt_count as number) || 1,
      };
    });
    const onConflict = vi.fn(() => ({ merge }));
    const insert = vi.fn((payload: Record<string, unknown>) => {
      if (!checkpointRow) {
        checkpointRow = {
          ...payload,
          plugin_id: payload.plugin_id,
          stage: payload.stage,
          attempt_count: payload.attempt_count,
        };
      }
      return { onConflict };
    });

    const tableFactory = vi.fn((tableName: string) => {
      if (tableName !== 'devholm_plugin_cutover_rollback_checkpoints') {
        throw new Error(`unexpected table ${tableName}`);
      }
      return {
        insert,
        where,
      };
    });

    getDb.mockReturnValue(tableFactory);

    const { upsertPluginCutoverRollbackCheckpoint } = await import(
      '@core/db/plugin-cutover-rollback'
    );

    const firstWrite = await upsertPluginCutoverRollbackCheckpoint({
      pluginId: 'url-shortener',
      stage: 'after-enabled-settings-reconciliation',
      status: 'pending',
      rollbackEligible: true,
      irreversibleBoundary: false,
      operationId: 'op-1',
      correlationId: 'corr-1',
      reason: 'scheduled rollback',
      evidence: { source: 'reconcile' },
    });

    const secondWrite = await upsertPluginCutoverRollbackCheckpoint({
      pluginId: 'url-shortener',
      stage: 'after-enabled-settings-reconciliation',
      status: 'running',
      rollbackEligible: true,
      irreversibleBoundary: false,
      operationId: 'op-1',
      correlationId: 'corr-1',
      reason: 'rollback started',
      evidence: { source: 'reconcile' },
    });

    expect(firstWrite.pluginId).toBe('url-shortener');
    expect(secondWrite.status).toBe('running');
    expect(insert).toHaveBeenCalledTimes(2);
  });
});
