import { beforeEach, describe, expect, it, vi } from 'vitest';

const buildPluginCutoverCleanupPlan = vi.hoisted(() => vi.fn());
const upsertPluginCutoverReconciliationState = vi.hoisted(() => vi.fn());
const appendPluginCutoverReconciliationEvent = vi.hoisted(() => vi.fn());

vi.mock('@core/lib/plugin-cutover-cleanup-planner.server', async () => {
  const actual = await vi.importActual<
    typeof import('@core/lib/plugin-cutover-cleanup-planner.server')
  >('@core/lib/plugin-cutover-cleanup-planner.server');

  return {
    ...actual,
    buildPluginCutoverCleanupPlan,
  };
});

vi.mock('@core/db/plugin-cutover-reconciliation', () => ({
  upsertPluginCutoverReconciliationState,
  appendPluginCutoverReconciliationEvent,
}));

describe('plugin cutover cleanup executor', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    buildPluginCutoverCleanupPlan.mockResolvedValue({
      pluginId: 'url-shortener',
      mode: 'tombstone',
      cleanupEligible: true,
      blockers: [],
      rollbackAvailable: true,
      irreversibleBoundary: false,
      hasLegacyEnabledSetting: true,
      hasLogicalDecommissionMarker: true,
      hasCleanupTombstoneMarker: false,
      proposedChanges: ['delete-legacy-enabled-setting', 'write-legacy-tombstone-marker'],
      excludedDomainDataTables: ['u_url_shortener_links'],
    });

    upsertPluginCutoverReconciliationState.mockResolvedValue({
      pluginId: 'url-shortener',
      phase: 'cleanup-completed',
      classification: 'legacy-cleanup-tombstoned',
      blocking: false,
      reason: 'cleanup complete',
      evidence: {},
      snapshot: null,
      operationId: null,
      correlationId: null,
      inspectedAt: new Date().toISOString(),
      phaseUpdatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    appendPluginCutoverReconciliationEvent.mockResolvedValue(undefined);
  });

  it('returns dry-run result without mutating state', async () => {
    const { executePluginCutoverCleanup } = await import(
      '@core/lib/plugin-cutover-cleanup-executor.server'
    );

    const result = await executePluginCutoverCleanup('url-shortener', {
      dryRun: true,
      db: { transaction: vi.fn() } as never,
    });

    expect(result.cleanupEligible).toBe(true);
    expect(result.executed).toBe(false);
    expect(upsertPluginCutoverReconciliationState).not.toHaveBeenCalled();
  });

  it('executes tombstone cleanup when eligible', async () => {
    const del = vi.fn(async () => 1);
    const insert = vi.fn(() => ({
      onConflict: vi.fn(() => ({ merge: vi.fn(async () => undefined) })),
    }));

    const trx = ((tableName: string) => {
      if (tableName !== 'site_settings') {
        throw new Error(`unexpected table ${tableName}`);
      }

      return {
        where: ({ key }: { key: string }) => ({ del: key.endsWith(':enabled') ? del : vi.fn() }),
        insert,
      };
    }) as unknown as ReturnType<typeof vi.fn>;

    const db = {
      transaction: async (callback: (trxDb: typeof trx) => Promise<void>) => callback(trx),
    };

    const { executePluginCutoverCleanup } = await import(
      '@core/lib/plugin-cutover-cleanup-executor.server'
    );

    const result = await executePluginCutoverCleanup('url-shortener', {
      dryRun: false,
      db: db as never,
    });

    expect(result.executed).toBe(true);
    expect(result.affectedRows).toBe(1);
    expect(upsertPluginCutoverReconciliationState).toHaveBeenCalled();
    expect(appendPluginCutoverReconciliationEvent).toHaveBeenCalled();
  });
});
