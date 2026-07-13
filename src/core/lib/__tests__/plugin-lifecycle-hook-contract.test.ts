import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DevholmPluginManifest } from '@core/types/plugins';

const runIsolatedLifecycleHook = vi.hoisted(() => vi.fn());
const evaluatePluginSandboxAccess = vi.hoisted(() => vi.fn());
const getDb = vi.hoisted(() => vi.fn());

vi.mock('@core/lib/plugin-isolation-runtime.server', () => ({
  runIsolatedLifecycleHook,
}));

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

  const onConflict = vi.fn(() => ({
    merge,
  }));

  const insert = vi.fn((payload: { key: string; value: string }) => {
    store.set(payload.key, payload.value);
    return {
      onConflict,
    };
  });

  return vi.fn(() => ({
    where,
    insert,
  }));
}

function manifest(overrides: Partial<DevholmPluginManifest> = {}): DevholmPluginManifest {
  return {
    id: 'plugin-a',
    name: 'Plugin A',
    version: '1.0.0',
    enablementSettingKey: 'plugin:plugin-a:enabled',
    permissions: [
      {
        key: 'plugin-a.admin.manage',
        capability: 'calendar.admin-management',
        scope: 'admin',
        description: 'Admin lifecycle operations',
        runtimeOwner: 'plugin-extension',
      },
    ],
    lifecycleAuthorization: {
      capability: 'calendar.admin-management',
      permissionKeys: ['plugin-a.admin.manage'],
    },
    lifecycle: {
      afterInstall: async () => undefined,
    },
    ...overrides,
  };
}

describe('plugin lifecycle hook contract', () => {
  beforeEach(() => {
    runIsolatedLifecycleHook.mockReset();
    evaluatePluginSandboxAccess.mockReset();
    getDb.mockReset();
  });

  it('records and executes approved hooks through isolation runtime', async () => {
    vi.resetModules();

    getDb.mockReturnValue(createDbMock());
    evaluatePluginSandboxAccess.mockResolvedValue({
      allowed: true,
      executionId: 'dec-1',
      pluginId: 'plugin-a',
      surface: 'lifecycle-hook',
      reason: 'approved',
      capability: 'calendar.admin-management',
      permissionKeys: ['plugin-a.admin.manage'],
      deniedPermissionKeys: [],
      requiresExplicitApproval: false,
    });
    runIsolatedLifecycleHook.mockResolvedValue({
      status: 'succeeded',
      meta: {
        executionId: 'exec-1',
        childPid: 12345,
      },
    });

    const { executeLifecycleHookWithIsolation } = await import(
      '@core/lib/plugin-lifecycle-hook-contract.server'
    );

    const result = await executeLifecycleHookWithIsolation({
      manifest: manifest(),
      hookName: 'afterInstall',
      context: {
        pluginId: 'plugin-a',
      },
      operationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });

    expect(result.state).toBe('succeeded');
    expect(runIsolatedLifecycleHook).toHaveBeenCalledTimes(1);
  });

  it('blocks hook execution when sandbox denies approval', async () => {
    vi.resetModules();

    getDb.mockReturnValue(createDbMock());
    evaluatePluginSandboxAccess.mockResolvedValue({
      allowed: false,
      executionId: 'dec-2',
      pluginId: 'plugin-a',
      surface: 'lifecycle-hook',
      reason: 'explicit approval missing for capability calendar.admin-management',
      capability: 'calendar.admin-management',
      permissionKeys: ['plugin-a.admin.manage'],
      deniedPermissionKeys: ['plugin-a.admin.manage'],
      requiresExplicitApproval: true,
    });

    const { executeLifecycleHookWithIsolation } = await import(
      '@core/lib/plugin-lifecycle-hook-contract.server'
    );

    const result = await executeLifecycleHookWithIsolation({
      manifest: manifest(),
      hookName: 'afterInstall',
      context: {
        pluginId: 'plugin-a',
      },
      operationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    });

    expect(result.state).toBe('blocked');
    expect(runIsolatedLifecycleHook).not.toHaveBeenCalled();
  });

  it('fails closed when lifecycleAuthorization is missing even if admin permissions exist', async () => {
    vi.resetModules();

    getDb.mockReturnValue(createDbMock());

    const { executeLifecycleHookWithIsolation } = await import(
      '@core/lib/plugin-lifecycle-hook-contract.server'
    );

    const manifestWithoutLifecycleAuthorization = {
      ...manifest(),
      lifecycleAuthorization: undefined,
    };

    const result = await executeLifecycleHookWithIsolation({
      manifest: manifestWithoutLifecycleAuthorization,
      hookName: 'afterInstall',
      context: {
        pluginId: 'plugin-a',
      },
      operationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    });

    expect(result.state).toBe('blocked');
    expect(result.detail).toContain('missing explicit lifecycleAuthorization');
    expect(evaluatePluginSandboxAccess).not.toHaveBeenCalled();
    expect(runIsolatedLifecycleHook).not.toHaveBeenCalled();
  });
});
