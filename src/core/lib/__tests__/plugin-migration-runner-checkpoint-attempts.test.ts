/** @vitest-environment node */

import { afterEach, describe, expect, it, vi } from 'vitest';

const sampleEntry = {
  id: 'url-shortener',
  version: '1.0.0',
  migrationDir: 'generated/plugins/url-shortener/migrations',
  migrations: [{ id: 'url-shortener:001', file: 'url-shortener/001.js', checksum: 'sha256:a' }],
};

const sampleManifest = {
  id: 'url-shortener',
  version: '1.0.0',
  migrations: [{ id: 'url-shortener:001', reversibility: 'reversible' }],
} as const;

const sampleDiscoveredMigration = {
  pluginId: 'url-shortener',
  pluginVersion: '1.0.0',
  migrationId: 'url-shortener:001',
  checksum: 'sha256:a',
  absolutePath: '/tmp/url-shortener/001.js',
};

type TrxLike = ((table: string) => unknown) & {
  raw: (sql: string, bindings?: unknown[]) => Promise<void>;
};

function buildTransaction(maxAttempt: number): TrxLike {
  const trx = ((table: string) => {
    if (table === 'devholm_plugin_lifecycle_operations') {
      return {
        select: () => ({
          where: () => ({
            first: async () => ({ operation_id: 'op-1' }),
          }),
        }),
      };
    }

    if (table === 'devholm_plugin_migration_checkpoints') {
      return {
        where: () => ({
          max: () => ({
            first: async () => ({ max_attempt: maxAttempt }),
          }),
        }),
      };
    }

    if (table === 'devholm_plugin_migrations') {
      return {
        select: () => ({
          where: () => ({
            orderBy: () => ({
              first: async () => ({ execution_id: 'up-exec-1' }),
            }),
          }),
        }),
      };
    }

    throw new Error(`Unexpected table in test transaction mock: ${table}`);
  }) as TrxLike;

  trx.raw = async () => undefined;
  return trx;
}

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('plugin migration runner checkpoint attempts', () => {
  it('increments attemptCount for up migrations based on max historical attempt in operation scope', async () => {
    const startPluginMigrationCheckpoint = vi.fn(async (input: Record<string, unknown>) => ({
      checkpointId: 'cp-up-1',
      ...input,
    }));

    vi.doMock('@/db', () => ({
      getDb: vi.fn(() => ({
        transaction: async (callback: (trx: TrxLike) => Promise<void>) =>
          callback(buildTransaction(1)),
      })),
    }));

    vi.doMock('@core/lib/plugin-migration-discovery.server', () => ({
      discoverPluginMigrations: vi.fn(() => [sampleDiscoveredMigration]),
      ensureChecksumsUnchanged: vi.fn(),
      ensureUniqueMigrationIds: vi.fn(),
      loadPluginMigrationRegistry: vi.fn(() => [sampleEntry]),
      resolvePluginRegistryPath: vi.fn(() => '/tmp/fake-registry.json'),
    }));

    vi.doMock('@core/lib/plugin-registry.server', () => ({
      getBundledPluginManifests: vi.fn(() => [sampleManifest]),
    }));

    vi.doMock('@core/db/plugin-lifecycle', () => ({
      getPluginMigrationLedgerWithDb: vi.fn(async () => []),
      insertPluginMigrationLedger: vi.fn(async () => undefined),
    }));

    vi.doMock('@core/db/plugin-migration-checkpoints', () => ({
      startPluginMigrationCheckpoint,
      markPluginMigrationCheckpointCompleted: vi.fn(async () => undefined),
      markPluginMigrationCheckpointFailed: vi.fn(async () => undefined),
    }));

    vi.doMock('@core/lib/plugin-isolation-runtime.server', () => ({
      runIsolatedMigrationPlan: vi.fn(async () => ({
        plan: {
          protocolVersion: 'migration-plan-v1',
          pluginId: 'url-shortener',
          migrationId: 'url-shortener:001',
          checksum: 'sha256:a',
          artifactIdentity: 'bundled:url-shortener@1.0.0:abc',
          sourceVersion: '0.0.0',
          targetVersion: '1.0.0',
          reversible: true,
          up: [],
          down: [],
        },
        meta: { executionId: 'exec-up', childPid: 123 },
      })),
    }));

    vi.doMock('@core/lib/plugin-migration-contract.server', () => ({
      executePluginMigrationWithGate: vi.fn(async (input: { execute: () => Promise<void> }) => {
        await input.execute();
        return { state: 'succeeded', executionId: 'exec-up' };
      }),
    }));

    vi.doMock('@core/lib/plugin-migration-broker.server', () => ({
      executeMigrationPlanWithBroker: vi.fn(async () => undefined),
    }));

    const { applyPendingPluginMigrations } = await import(
      '@core/lib/plugin-migration-runner.server'
    );

    await applyPendingPluginMigrations('url-shortener', {
      operationId: 'op-1',
      lockAlreadyHeld: true,
    });

    expect(startPluginMigrationCheckpoint).toHaveBeenCalledTimes(1);
    expect(startPluginMigrationCheckpoint.mock.calls[0]?.[0]).toMatchObject({
      operationId: 'op-1',
      migrationId: 'url-shortener:001',
      direction: 'up',
      attemptCount: 2,
    });
  });

  it('increments attemptCount for down migrations based on max historical attempt in operation scope', async () => {
    const startPluginMigrationCheckpoint = vi.fn(async (input: Record<string, unknown>) => ({
      checkpointId: 'cp-down-1',
      ...input,
    }));

    vi.doMock('@/db', () => ({
      getDb: vi.fn(() => ({
        transaction: async (callback: (trx: TrxLike) => Promise<void>) =>
          callback(buildTransaction(1)),
      })),
    }));

    vi.doMock('@core/lib/plugin-migration-discovery.server', () => ({
      discoverPluginMigrations: vi.fn(() => [sampleDiscoveredMigration]),
      ensureChecksumsUnchanged: vi.fn(),
      ensureUniqueMigrationIds: vi.fn(),
      loadPluginMigrationRegistry: vi.fn(() => [sampleEntry]),
      resolvePluginRegistryPath: vi.fn(() => '/tmp/fake-registry.json'),
    }));

    vi.doMock('@core/lib/plugin-registry.server', () => ({
      getBundledPluginManifests: vi.fn(() => [sampleManifest]),
    }));

    vi.doMock('@core/db/plugin-lifecycle', () => ({
      getPluginMigrationLedgerWithDb: vi.fn(async () => []),
      insertPluginMigrationLedger: vi.fn(async () => undefined),
    }));

    vi.doMock('@core/db/plugin-migration-checkpoints', () => ({
      startPluginMigrationCheckpoint,
      markPluginMigrationCheckpointCompleted: vi.fn(async () => undefined),
      markPluginMigrationCheckpointFailed: vi.fn(async () => undefined),
    }));

    vi.doMock('@core/lib/plugin-isolation-runtime.server', () => ({
      runIsolatedMigrationPlan: vi.fn(async () => ({
        plan: {
          protocolVersion: 'migration-plan-v1',
          pluginId: 'url-shortener',
          migrationId: 'url-shortener:001',
          checksum: 'sha256:a',
          artifactIdentity: 'bundled:url-shortener@1.0.0:abc',
          sourceVersion: '1.0.0',
          targetVersion: '0.0.0',
          reversible: true,
          up: [],
          down: [],
        },
        meta: { executionId: 'exec-down', childPid: 123 },
      })),
    }));

    vi.doMock('@core/lib/plugin-migration-contract.server', () => ({
      executePluginMigrationWithGate: vi.fn(async (input: { execute: () => Promise<void> }) => {
        await input.execute();
        return { state: 'succeeded', executionId: 'exec-down' };
      }),
    }));

    vi.doMock('@core/lib/plugin-migration-broker.server', () => ({
      executeMigrationPlanWithBroker: vi.fn(async () => undefined),
    }));

    const { applyPluginMigrationDowns } = await import('@core/lib/plugin-migration-runner.server');

    await applyPluginMigrationDowns('url-shortener', {
      operationId: 'op-1',
      lockAlreadyHeld: true,
    });

    expect(startPluginMigrationCheckpoint).toHaveBeenCalledTimes(1);
    expect(startPluginMigrationCheckpoint.mock.calls[0]?.[0]).toMatchObject({
      operationId: 'op-1',
      migrationId: 'url-shortener:001',
      direction: 'down',
      attemptCount: 2,
    });
  });
});
