import { beforeEach, describe, expect, it, vi } from 'vitest';

const getInstalledPlugin = vi.hoisted(() => vi.fn());
const findActivePluginLifecycleOperation = vi.hoisted(() => vi.fn());
const readPluginCutoverReconciliationState = vi.hoisted(() => vi.fn());
const readLatestPluginCutoverRollbackCheckpoint = vi.hoisted(() => vi.fn());

vi.mock('@core/db/plugin-lifecycle', () => ({
  getInstalledPlugin,
  findActivePluginLifecycleOperation,
}));

vi.mock('@core/db/plugin-cutover-reconciliation', () => ({
  readPluginCutoverReconciliationState,
}));

vi.mock('@core/db/plugin-cutover-rollback', () => ({
  readLatestPluginCutoverRollbackCheckpoint,
}));

function mockDb(settings: Record<string, boolean>) {
  return ((tableName: string) => {
    if (tableName !== 'site_settings') {
      throw new Error(`unexpected table ${tableName}`);
    }

    return {
      select: () => ({
        where: ({ key }: { key: string }) => ({
          first: async () => (settings[key] ? { key } : undefined),
        }),
      }),
    };
  }) as unknown;
}

describe('plugin cutover cleanup planner', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getInstalledPlugin.mockResolvedValue({
      pluginId: 'url-shortener',
      lifecycleState: 'installed',
      enabled: true,
      installedVersion: '0.1.0',
    });
    findActivePluginLifecycleOperation.mockResolvedValue(null);
    readPluginCutoverReconciliationState.mockResolvedValue({ phase: 'legacy-path-decommissioned' });
    readLatestPluginCutoverRollbackCheckpoint.mockResolvedValue({
      rollbackEligible: true,
      irreversibleBoundary: false,
      status: 'succeeded',
    });
  });

  it('returns cleanup-eligible tombstone plan when prerequisites are satisfied', async () => {
    const { buildPluginCutoverCleanupPlan } = await import(
      '@core/lib/plugin-cutover-cleanup-planner.server'
    );

    const plan = await buildPluginCutoverCleanupPlan(
      'url-shortener',
      mockDb({
        'plugin:url-shortener:enabled': true,
        'plugin:url-shortener:legacy-state-decommissioned-at': true,
      }) as never
    );

    expect(plan.cleanupEligible).toBe(true);
    expect(plan.blockers).toHaveLength(0);
    expect(plan.mode).toBe('tombstone');
  });

  it('blocks cleanup when active lifecycle operation exists', async () => {
    findActivePluginLifecycleOperation.mockResolvedValueOnce({ operationId: 'op-1' });

    const { buildPluginCutoverCleanupPlan } = await import(
      '@core/lib/plugin-cutover-cleanup-planner.server'
    );

    const plan = await buildPluginCutoverCleanupPlan(
      'url-shortener',
      mockDb({
        'plugin:url-shortener:enabled': true,
        'plugin:url-shortener:legacy-state-decommissioned-at': true,
      }) as never
    );

    expect(plan.cleanupEligible).toBe(false);
    expect(plan.blockers).toContain('active-lifecycle-operation-present');
  });
});
