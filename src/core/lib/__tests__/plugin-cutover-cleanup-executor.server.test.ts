import { createHash } from 'node:crypto';
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
      cleanupSchemaVersion: 2,
      cleanupStateFingerprint: 'fp-1',
      cleanupPlanVersion: 'plan-1',
      cleanupExecutionTokenHash: 'hash-1',
      cleanupExecutedAt: new Date().toISOString(),
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

  it('reports ineligible dry-run blockers without mutation or claim attempts', async () => {
    buildPluginCutoverCleanupPlan.mockResolvedValueOnce({
      pluginId: 'url-shortener',
      mode: 'tombstone',
      cleanupEligible: false,
      blockers: ['legacy-not-logically-decommissioned'],
      rollbackAvailable: true,
      irreversibleBoundary: false,
      hasLegacyEnabledSetting: true,
      hasLogicalDecommissionMarker: false,
      hasCleanupTombstoneMarker: false,
      proposedChanges: [],
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
          hasLogicalDecommissionMarker: false,
          hasCleanupTombstoneMarker: false,
        },
        cutoverIdentity: {
          phase: 'canonical-ownership-activated',
          classification: 'legacy-still-authoritative',
          blocking: true,
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
      stateFingerprint: 'fp-ineligible',
    });

    const transactionSpy = vi.fn();
    const db = Object.assign(
      vi.fn(() => {
        throw new Error('dry-run should not query durable claim state');
      }),
      { transaction: transactionSpy }
    ) as never;

    const { executePluginCutoverCleanup } = await import(
      '@core/lib/plugin-cutover-cleanup-executor.server'
    );

    const result = await executePluginCutoverCleanup('url-shortener', {
      dryRun: true,
      db,
    });

    expect(result.cleanupEligible).toBe(false);
    expect(result.blockers).toEqual(['legacy-not-logically-decommissioned']);
    expect(result.executed).toBe(false);
    expect(transactionSpy).not.toHaveBeenCalled();
    expect(upsertPluginCutoverReconciliationState).not.toHaveBeenCalled();
    expect(appendPluginCutoverReconciliationEvent).not.toHaveBeenCalled();
  });

  it('keeps repeated dry-runs non-mutating and deterministic', async () => {
    const transactionSpy = vi.fn();
    const db = Object.assign(
      vi.fn(() => {
        throw new Error('dry-run should not query durable claim state');
      }),
      { transaction: transactionSpy }
    ) as never;

    const { executePluginCutoverCleanup } = await import(
      '@core/lib/plugin-cutover-cleanup-executor.server'
    );

    const first = await executePluginCutoverCleanup('url-shortener', {
      dryRun: true,
      db,
    });
    const second = await executePluginCutoverCleanup('url-shortener', {
      dryRun: true,
      db,
    });

    expect(first).toEqual(second);
    expect(transactionSpy).not.toHaveBeenCalled();
    expect(upsertPluginCutoverReconciliationState).not.toHaveBeenCalled();
    expect(appendPluginCutoverReconciliationEvent).not.toHaveBeenCalled();
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
    expect(appendPluginCutoverReconciliationEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginId: 'url-shortener',
        result: 'blocked',
        classification: 'cleanup-intent-rejected',
      }),
      expect.anything()
    );

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

    const cleanupState: Record<string, unknown> | null = null;

    const trx = ((tableName: string) => {
      if (tableName === 'site_settings') {
        return {
          where: ({ key }: { key: string }) => ({ del: key.endsWith(':enabled') ? del : vi.fn() }),
          insert,
        };
      }

      if (tableName === 'devholm_plugin_cutover_reconciliation_states') {
        return {
          insert: vi.fn(() => ({
            onConflict: vi.fn(() => ({ ignore: vi.fn(async () => undefined) })),
          })),
          where: vi.fn(() => ({
            whereNull: vi.fn(() => ({ update: vi.fn(async () => 1) })),
            update: vi.fn(async () => 1),
          })),
          select: vi.fn(() => ({
            where: vi.fn(() => ({ first: vi.fn(async () => cleanupState) })),
          })),
        };
      }

      throw new Error(`unexpected table ${tableName}`);
    }) as unknown as ReturnType<typeof vi.fn>;

    const db = Object.assign(
      ((tableName: string) => {
        if (tableName === 'devholm_plugin_cutover_reconciliation_states') {
          return {
            select: () => ({
              where: () => ({
                first: async () => cleanupState,
              }),
            }),
          };
        }

        throw new Error(`unexpected table ${tableName}`);
      }) as unknown as ReturnType<typeof vi.fn>,
      {
        transaction: async (callback: (trxDb: typeof trx) => Promise<void>) => callback(trx),
      }
    );

    const { executePluginCutoverCleanup } = await import(
      '@core/lib/plugin-cutover-cleanup-executor.server'
    );

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
    const { executePluginCutoverCleanup } = await import(
      '@core/lib/plugin-cutover-cleanup-executor.server'
    );
    const { computePluginCutoverCleanupPlanVersion } = await import(
      '@core/lib/plugin-cutover-cleanup-contract.server'
    );

    const plan = await buildPluginCutoverCleanupPlan();
    const planVersion = computePluginCutoverCleanupPlanVersion(plan);

    let cleanupState: Record<string, unknown> | null = null;

    const del = vi.fn(async () => 1);
    const insert = vi.fn(() => ({
      onConflict: vi.fn(() => ({ merge: vi.fn(async () => undefined) })),
    }));

    const trx = ((tableName: string) => {
      if (tableName === 'site_settings') {
        return {
          where: ({ key }: { key: string }) => ({ del: key.endsWith(':enabled') ? del : vi.fn() }),
          insert,
        };
      }

      if (tableName === 'devholm_plugin_cutover_reconciliation_states') {
        return {
          insert: vi.fn(() => ({
            onConflict: vi.fn(() => ({ ignore: vi.fn(async () => undefined) })),
          })),
          where: vi.fn(() => ({
            whereNull: vi.fn(() => ({
              update: vi.fn(async () => (cleanupState ? 0 : 1)),
            })),
            update: vi.fn(async () => 1),
          })),
          select: vi.fn(() => ({
            where: vi.fn(() => ({ first: vi.fn(async () => cleanupState) })),
          })),
        };
      }

      throw new Error(`unexpected table ${tableName}`);
    }) as unknown as ReturnType<typeof vi.fn>;

    const tableDb = ((tableName: string) => {
      if (tableName === 'devholm_plugin_cutover_reconciliation_states') {
        return {
          select: () => ({
            where: () => ({
              first: async () => cleanupState,
            }),
          }),
        };
      }

      throw new Error(`unexpected table ${tableName}`);
    }) as unknown as ReturnType<typeof vi.fn>;

    const db = Object.assign(tableDb, {
      transaction: async (callback: (trxDb: typeof trx) => Promise<void>) => callback(trx),
    });

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

    cleanupState = {
      cleanup_execution_token_hash: createHash('sha256').update('token-replay-1').digest('hex'),
      cleanup_executed_at: new Date().toISOString(),
      cleanup_state_fingerprint: 'fp-1',
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
    ).rejects.toThrow(/cleanup-execution-token-replayed/);
  });
});
