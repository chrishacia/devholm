import { beforeEach, describe, expect, it, vi } from 'vitest';

const getInstalledPlugin = vi.hoisted(() => vi.fn());
const upsertPluginCutoverReconciliationState = vi.hoisted(() => vi.fn());
const appendPluginCutoverReconciliationEvent = vi.hoisted(() => vi.fn());

vi.mock('@core/db/plugin-lifecycle', () => ({
  getInstalledPlugin,
}));

vi.mock('@core/db/plugin-cutover-reconciliation', () => ({
  upsertPluginCutoverReconciliationState,
  appendPluginCutoverReconciliationEvent,
}));

describe('plugin cutover legacy decommission', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getInstalledPlugin.mockResolvedValue({
      pluginId: 'url-shortener',
      bundledVersion: '0.1.0',
      installedVersion: '0.1.0',
      enabled: true,
      lifecycleState: 'installed',
      operationStatus: 'idle',
      installedAt: null,
      upgradedAt: null,
      disabledAt: null,
      updatedAt: null,
      lastError: null,
      manifestChecksum: null,
    });

    upsertPluginCutoverReconciliationState.mockResolvedValue({
      pluginId: 'url-shortener',
      phase: 'legacy-path-decommissioned',
      operationId: null,
      correlationId: null,
      classification: 'legacy-logically-decommissioned',
      blocking: false,
      reason: 'Legacy runtime authority logically decommissioned.',
      evidence: {},
      snapshot: null,
      inspectedAt: new Date().toISOString(),
      phaseUpdatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    appendPluginCutoverReconciliationEvent.mockResolvedValue(undefined);
  });

  it('marks canonical-active plugin as logically legacy-decommissioned', async () => {
    const insert = vi.fn(() => ({
      onConflict: vi.fn(() => ({
        merge: vi.fn(async () => undefined),
      })),
    }));

    const trx = ((tableName: string) => {
      if (tableName === 'site_settings') {
        return { insert };
      }
      throw new Error(`unexpected table ${tableName}`);
    }) as unknown as ReturnType<typeof vi.fn>;

    Object.assign(trx, {
      raw: vi.fn(async () => undefined),
    });

    const db = {
      transaction: async (callback: (trxDb: typeof trx) => Promise<unknown>) => callback(trx),
    };

    const { logicallyDecommissionLegacyPluginState } = await import(
      '@core/lib/plugin-cutover-legacy-decommission.server'
    );

    const result = await logicallyDecommissionLegacyPluginState('url-shortener', {
      db: db as never,
    });

    expect(result.applied).toBe(true);
    expect(upsertPluginCutoverReconciliationState).toHaveBeenCalled();
    expect(appendPluginCutoverReconciliationEvent).toHaveBeenCalled();
    expect(insert).toHaveBeenCalled();
  });

  it('returns no-op when canonical authority is not active', async () => {
    getInstalledPlugin.mockResolvedValueOnce({
      pluginId: 'url-shortener',
      bundledVersion: '0.1.0',
      installedVersion: null,
      enabled: false,
      lifecycleState: 'bundled',
      operationStatus: 'idle',
      installedAt: null,
      upgradedAt: null,
      disabledAt: null,
      updatedAt: null,
      lastError: null,
      manifestChecksum: null,
    });

    const { logicallyDecommissionLegacyPluginState } = await import(
      '@core/lib/plugin-cutover-legacy-decommission.server'
    );

    const result = await logicallyDecommissionLegacyPluginState('url-shortener', {
      db: {
        transaction: async (callback: (trxDb: { raw: () => Promise<void> }) => Promise<unknown>) =>
          callback({ raw: async () => undefined }),
      } as never,
    });

    expect(result.applied).toBe(false);
    expect(upsertPluginCutoverReconciliationState).not.toHaveBeenCalled();
  });
});
