import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DevholmPluginManifest } from '@core/types/plugins';

const evaluatePluginSandboxAccess = vi.hoisted(() => vi.fn());
const getDb = vi.hoisted(() => vi.fn());

vi.mock('@core/lib/plugin-capability-sandbox.server', () => ({
  evaluatePluginSandboxAccess,
}));

vi.mock('@/db', () => ({
  getDb,
}));

function createDbMock() {
  const store = new Map<string, string>();

  const where = vi.fn((query: { key: string }) => ({
    first: vi.fn(async () => {
      const value = store.get(query.key);
      return value === undefined
        ? null
        : {
            key: query.key,
            value,
          };
    }),
  }));

  const merge = vi.fn(async (payload: { value: string }) => {
    const lastInsert = insert.mock.calls.at(-1)?.[0] as { key: string } | undefined;
    if (!lastInsert) {
      return;
    }

    store.set(lastInsert.key, payload.value);
  });

  const onConflict = vi.fn(() => ({ merge }));

  const insert = vi.fn((payload: { key: string; value: string }) => {
    store.set(payload.key, payload.value);
    return { onConflict };
  });

  const table = vi.fn(() => ({ where, insert }));
  return table;
}

function manifest(overrides: Partial<DevholmPluginManifest> = {}): DevholmPluginManifest {
  return {
    id: 'plugin-a',
    name: 'Plugin A',
    version: '1.0.0',
    enablementSettingKey: 'plugin:plugin-a:enabled',
    permissions: [
      {
        key: 'plugin:plugin-a:admin.manage',
        capability: 'calendar.admin-management',
        scope: 'admin',
        description: 'Admin migration operations',
        runtimeOwner: 'plugin-extension',
      },
    ],
    migrationAuthorization: {
      capability: 'calendar.admin-management',
      permissionKeys: ['plugin:plugin-a:admin.manage'],
    },
    ...overrides,
  };
}

describe('plugin migration contract', () => {
  beforeEach(() => {
    evaluatePluginSandboxAccess.mockReset();
    getDb.mockReset();
  });

  it('executes approved migration and persists success', async () => {
    vi.resetModules();

    getDb.mockReturnValue(createDbMock());
    evaluatePluginSandboxAccess.mockResolvedValue({
      allowed: true,
      executionId: 'dec-1',
      pluginId: 'plugin-a',
      surface: 'migration',
      reason: 'approved',
      capability: 'calendar.admin-management',
      permissionKeys: ['plugin:plugin-a:admin.manage'],
      deniedPermissionKeys: [],
      requiresExplicitApproval: false,
    });

    const execute = vi.fn(async () => undefined);

    const { executePluginMigrationWithGate } = await import(
      '@core/lib/plugin-migration-contract.server'
    );

    const result = await executePluginMigrationWithGate({
      manifest: manifest(),
      migrationId: 'plugin-a:20260713000000_init',
      pluginVersion: '1.0.0',
      checksum: 'a'.repeat(64),
      direction: 'up',
      operationId: '11111111-1111-4111-8111-111111111111',
      execute,
    });

    expect(result.state).toBe('succeeded');
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('blocks migration when sandbox denies access', async () => {
    vi.resetModules();

    getDb.mockReturnValue(createDbMock());
    evaluatePluginSandboxAccess.mockResolvedValue({
      allowed: false,
      executionId: 'dec-2',
      pluginId: 'plugin-a',
      surface: 'migration',
      reason: 'explicit approval missing for capability calendar.admin-management',
      capability: 'calendar.admin-management',
      permissionKeys: ['plugin:plugin-a:admin.manage'],
      deniedPermissionKeys: ['plugin:plugin-a:admin.manage'],
      requiresExplicitApproval: true,
    });

    const execute = vi.fn(async () => undefined);

    const { executePluginMigrationWithGate } = await import(
      '@core/lib/plugin-migration-contract.server'
    );

    const result = await executePluginMigrationWithGate({
      manifest: manifest(),
      migrationId: 'plugin-a:20260713000000_init',
      pluginVersion: '1.0.0',
      checksum: 'b'.repeat(64),
      direction: 'up',
      operationId: '22222222-2222-4222-8222-222222222222',
      execute,
    });

    expect(result.state).toBe('blocked');
    expect(result.detail).toContain('explicit approval missing');
    expect(execute).not.toHaveBeenCalled();
  });

  it('fails closed when migrationAuthorization is missing', async () => {
    vi.resetModules();

    getDb.mockReturnValue(createDbMock());
    const execute = vi.fn(async () => undefined);

    const { executePluginMigrationWithGate } = await import(
      '@core/lib/plugin-migration-contract.server'
    );

    const result = await executePluginMigrationWithGate({
      manifest: manifest({ migrationAuthorization: undefined, lifecycleAuthorization: undefined }),
      migrationId: 'plugin-a:20260713000000_init',
      pluginVersion: '1.0.0',
      checksum: 'c'.repeat(64),
      direction: 'up',
      operationId: '33333333-3333-4333-8333-333333333333',
      execute,
    });

    expect(result.state).toBe('blocked');
    expect(result.detail).toContain('missing explicit migrationAuthorization');
    expect(evaluatePluginSandboxAccess).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });
});
