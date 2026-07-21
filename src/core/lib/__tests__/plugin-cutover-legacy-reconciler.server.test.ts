import { beforeEach, describe, expect, it, vi } from 'vitest';

const getDb = vi.hoisted(() => vi.fn());
const getPluginDefinitions = vi.hoisted(() => vi.fn());
const getBundledPluginManifests = vi.hoisted(() => vi.fn());
const getInstalledPlugin = vi.hoisted(() => vi.fn());
const upsertPluginLedgerRecord = vi.hoisted(() => vi.fn());
const upsertPluginCutoverReconciliationState = vi.hoisted(() => vi.fn());
const appendPluginCutoverReconciliationEvent = vi.hoisted(() => vi.fn());

vi.mock('@/db', () => ({
  getDb,
}));

vi.mock('@core/lib/plugins', () => ({
  getPluginDefinitions,
}));

vi.mock('@core/lib/plugin-registry.server', () => ({
  getBundledPluginManifests,
}));

vi.mock('@core/db/plugin-lifecycle', () => ({
  getInstalledPlugin,
  upsertPluginLedgerRecord,
}));

vi.mock('@core/db/plugin-cutover-reconciliation', () => ({
  upsertPluginCutoverReconciliationState,
  appendPluginCutoverReconciliationEvent,
}));

import { reconcileLegacyAndCanonicalPluginState } from '@core/lib/plugin-cutover-legacy-reconciler.server';

function makeDb(legacyValue: string | null) {
  const first = vi.fn(async () => (legacyValue === null ? null : { value: legacyValue }));
  const where = vi.fn(() => ({ first }));
  const select = vi.fn(() => ({ where }));

  const tableFactory = vi.fn((tableName: string) => {
    if (tableName !== 'site_settings') {
      throw new Error(`unexpected table ${tableName}`);
    }

    return {
      select,
    };
  });

  (
    tableFactory as unknown as {
      transaction: (cb: (trx: unknown) => Promise<void>) => Promise<void>;
    }
  ).transaction = async (cb) => cb({});

  return tableFactory;
}

describe('plugin cutover legacy reconciler', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getPluginDefinitions.mockReturnValue([
      {
        id: 'url-shortener',
        name: 'URL Shortener',
        source: 'user',
        version: '0.1.0',
        enabledByDefault: false,
        capabilities: {
          admin: true,
          api: true,
          publicRoutes: true,
          navigation: true,
          sitemap: false,
          embeds: false,
        },
      },
    ]);
    getBundledPluginManifests.mockReturnValue([
      {
        id: 'url-shortener',
        name: 'URL Shortener',
        version: '0.1.0',
      },
    ]);

    upsertPluginLedgerRecord.mockResolvedValue(undefined);
    upsertPluginCutoverReconciliationState.mockImplementation(async (input) => ({
      pluginId: input.pluginId,
      phase: input.phase,
      operationId: input.operationId ?? null,
      correlationId: input.correlationId ?? null,
      classification: input.classification ?? null,
      blocking: input.blocking,
      reason: input.reason ?? null,
      evidence: input.evidence ?? null,
      snapshot: null,
      inspectedAt: new Date().toISOString(),
      phaseUpdatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    appendPluginCutoverReconciliationEvent.mockResolvedValue(undefined);
  });

  it('migrates legacy-only state into canonical record preserving enabled intent', async () => {
    getDb.mockReturnValue(makeDb('true'));
    getInstalledPlugin.mockResolvedValue(null);

    const result = await reconcileLegacyAndCanonicalPluginState('url-shortener', {
      correlationId: 'corr-legacy-only',
    });

    expect(result.topology).toBe('legacy-only');
    expect(result.blocking).toBe(false);
    expect(upsertPluginLedgerRecord).toHaveBeenCalledTimes(1);
    expect(upsertPluginCutoverReconciliationState).toHaveBeenCalledTimes(1);
    expect(appendPluginCutoverReconciliationEvent).toHaveBeenCalledTimes(1);
  });

  it('marks disagreement in dual state as manual intervention required', async () => {
    getDb.mockReturnValue(makeDb('false'));
    getInstalledPlugin.mockResolvedValue({ enabled: true });

    const result = await reconcileLegacyAndCanonicalPluginState('url-shortener', {
      correlationId: 'corr-dual-disagree',
    });

    expect(result.topology).toBe('legacy-and-canonical');
    expect(result.blocking).toBe(true);
    expect(result.phase).toBe('manual-intervention-required');
    expect(upsertPluginLedgerRecord).not.toHaveBeenCalled();
  });
});
