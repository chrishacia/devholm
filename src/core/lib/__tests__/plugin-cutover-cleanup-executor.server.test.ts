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
      stateBinding: {
        pluginId: 'url-shortener',
        canonicalIdentity: {
          lifecycleState: 'installed',
          installedVersion: '0.1.0',
          bundledVersion: '0.1.0',
          enabled: true,
          manifestChecksum: null,
          updatedAtIso: null,
        },
        legacyIdentity: {
          hasLegacyEnabledSetting: true,
          hasLogicalDecommissionMarker: true,
          hasCleanupTombstoneMarker: false,
        },
        cutoverIdentity: {
          phase: 'legacy-path-decommissioned',
          classification: 'legacy-logically-decommissioned',
          blocking: false,
          updatedAtIso: null,
        },
        rollbackIdentity: {
          status: 'succeeded',
          rollbackEligible: true,
          irreversibleBoundary: false,
          attemptCount: 1,
        },
        operationIdentity: {
          hasActiveOperation: false,
          activeOperationId: null,
        },
      },
      stateFingerprint: 'fp-1',
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

  it('rejects non-dry-run cleanup execution when intent is missing or stale', async () => {
    const { executePluginCutoverCleanup } = await import(
      '@core/lib/plugin-cutover-cleanup-executor.server'
    );

    await expect(
      executePluginCutoverCleanup('url-shortener', {
        dryRun: false,
        db: { transaction: vi.fn() } as never,
      })
    ).rejects.toThrow(/cleanup execution intent is required/);

    await expect(
      executePluginCutoverCleanup('url-shortener', {
        dryRun: false,
        intent: {
          pluginId: 'url-shortener',
          schemaVersion: 2,
          planVersion: 'stale',
          stateFingerprint: 'fp-1',
          executionToken: 'token-stale',
        },
        db: { transaction: vi.fn() } as never,
      })
    ).rejects.toThrow(/stale-cleanup-plan-version/);

    await expect(
      executePluginCutoverCleanup('url-shortener', {
        dryRun: false,
        intent: {
          pluginId: 'url-shortener',
          schemaVersion: 1,
          planVersion: 'stale',
          stateFingerprint: 'fp-1',
          executionToken: 'token-schema-mismatch',
        },
        db: { transaction: vi.fn() } as never,
      })
    ).rejects.toThrow(/unsupported-cleanup-plan-schema-version/);

    await expect(
      executePluginCutoverCleanup('url-shortener', {
        dryRun: false,
        intent: {
          pluginId: 'url-shortener',
          schemaVersion: 2,
          planVersion: 'stale',
          stateFingerprint: 'fp-mismatch',
          executionToken: 'token-fp-mismatch',
        },
        db: { transaction: vi.fn() } as never,
      })
    ).rejects.toThrow(/cleanup-state-fingerprint-mismatch/);
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

    const { executePluginCutoverCleanup, resetCleanupExecutionTokenRegistryForTests } =
      await import('@core/lib/plugin-cutover-cleanup-executor.server');
    resetCleanupExecutionTokenRegistryForTests();

    const { computePluginCutoverCleanupPlanVersion } = await import(
      '@core/lib/plugin-cutover-cleanup-contract.server'
    );
    const plan = await buildPluginCutoverCleanupPlan();
    const planVersion = computePluginCutoverCleanupPlanVersion(plan);

    const result = await executePluginCutoverCleanup('url-shortener', {
      dryRun: false,
      intent: {
        pluginId: 'url-shortener',
        schemaVersion: 2,
        planVersion,
        stateFingerprint: 'fp-1',
        executionToken: 'token-execute-1',
      },
      db: db as never,
    });

    expect(result.executed).toBe(true);
    expect(result.affectedRows).toBe(1);
    expect(upsertPluginCutoverReconciliationState).toHaveBeenCalled();
    expect(appendPluginCutoverReconciliationEvent).toHaveBeenCalled();
  });

  it('rejects replayed cleanup execution token', async () => {
    const { executePluginCutoverCleanup, resetCleanupExecutionTokenRegistryForTests } =
      await import('@core/lib/plugin-cutover-cleanup-executor.server');
    const { computePluginCutoverCleanupPlanVersion } = await import(
      '@core/lib/plugin-cutover-cleanup-contract.server'
    );
    resetCleanupExecutionTokenRegistryForTests();

    const plan = await buildPluginCutoverCleanupPlan();
    const planVersion = computePluginCutoverCleanupPlanVersion(plan);

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

    await expect(
      executePluginCutoverCleanup('url-shortener', {
        dryRun: false,
        intent: {
          pluginId: 'url-shortener',
          schemaVersion: 2,
          planVersion,
          stateFingerprint: 'fp-1',
          executionToken: 'token-replay-1',
        },
        db: db as never,
      })
    ).resolves.toBeDefined();

    await expect(
      executePluginCutoverCleanup('url-shortener', {
        dryRun: false,
        intent: {
          pluginId: 'url-shortener',
          schemaVersion: 2,
          planVersion,
          stateFingerprint: 'fp-1',
          executionToken: 'token-replay-1',
        },
        db: db as never,
      })
    ).rejects.toThrow(/cleanup-execution-token-replayed/);
  });
});
