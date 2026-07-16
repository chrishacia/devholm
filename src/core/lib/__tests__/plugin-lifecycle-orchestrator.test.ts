import { describe, expect, it, vi } from 'vitest';

const getDb = vi.hoisted(() => vi.fn());
const getPluginState = vi.hoisted(() => vi.fn());
const installPlugin = vi.hoisted(() => vi.fn());
const enablePlugin = vi.hoisted(() => vi.fn());
const disablePlugin = vi.hoisted(() => vi.fn());

vi.mock('@/db', () => ({
  getDb,
}));

vi.mock('@core/db/plugins', () => ({
  getPluginState,
}));

vi.mock('@core/lib/plugin-lifecycle.server', () => ({
  installPlugin,
  enablePlugin,
  disablePlugin,
}));

import { orchestratePluginLifecycleMutation } from '@core/lib/plugin-lifecycle-orchestrator.server';

function createDbMock() {
  const merge = vi.fn(async () => undefined);
  const ignore = vi.fn(async () => undefined);
  const onConflict = vi.fn(() => ({ merge, ignore }));
  const insert = vi.fn(() => ({ onConflict }));
  const db = vi.fn(() => ({ insert, onConflict })) as unknown as ReturnType<typeof vi.fn>;
  return { db, insert, merge, onConflict };
}

describe('plugin lifecycle orchestration facade', () => {
  it('records durable operation state and an audit event on success', async () => {
    const dbMock = createDbMock();
    getDb.mockReturnValue(dbMock.db);
    getPluginState
      .mockResolvedValueOnce({
        installed: false,
        isEnabled: false,
        lifecycleState: 'bundled',
        operationStatus: 'idle',
        installedVersion: null,
        bundledVersion: '1.0.0',
        updatedAt: null,
      })
      .mockResolvedValueOnce({
        installed: true,
        isEnabled: false,
        lifecycleState: 'installed',
        operationStatus: 'idle',
        installedVersion: '1.0.0',
        bundledVersion: '1.0.0',
        updatedAt: new Date('2026-07-16T00:00:00.000Z'),
      });
    installPlugin.mockResolvedValue(undefined);

    await orchestratePluginLifecycleMutation({
      action: 'install',
      pluginId: 'url-shortener',
      initiatedBy: 'admin@example.com',
    });

    expect(installPlugin).toHaveBeenCalledWith('url-shortener', {
      initiatedBy: 'admin@example.com',
    });
    expect(dbMock.insert).toHaveBeenCalledTimes(3);

    const tableCalls = dbMock.db.mock.calls as unknown as Array<[string]>;
    expect(tableCalls[0][0]).toBe('devholm_plugin_lifecycle_operations');
    expect(tableCalls[1][0]).toBe('devholm_plugin_lifecycle_operations');
    expect(tableCalls[2][0]).toBe('devholm_plugin_lifecycle_events');

    const insertCalls = dbMock.insert.mock.calls as unknown as Array<[Record<string, unknown>]>;
    const firstWrite = insertCalls[0][0] as Record<string, unknown>;
    const secondWrite = insertCalls[1][0] as Record<string, unknown>;
    const thirdWrite = insertCalls[2][0] as Record<string, unknown>;

    expect(firstWrite).toMatchObject({
      schema_version: 1,
      plugin_id: 'url-shortener',
      action: 'install',
      status: 'running',
      actor: 'admin@example.com',
      current_phase: 'executing',
      attempt_count: 1,
    });
    expect(secondWrite).toMatchObject({
      schema_version: 1,
      plugin_id: 'url-shortener',
      action: 'install',
      status: 'succeeded',
      actor: 'admin@example.com',
      current_phase: 'completed',
      attempt_count: 1,
    });
    expect(thirdWrite).toMatchObject({
      schema_version: 1,
      plugin_id: 'url-shortener',
      transition: 'install',
      result: 'succeeded',
      actor: 'admin@example.com',
    });
  });

  it('records a failed operation and audit event when the underlying mutation fails', async () => {
    const dbMock = createDbMock();
    getDb.mockReturnValue(dbMock.db);
    getPluginState.mockResolvedValue({
      installed: true,
      isEnabled: true,
      lifecycleState: 'installed',
      operationStatus: 'idle',
      installedVersion: '1.0.0',
      bundledVersion: '1.0.0',
      updatedAt: new Date('2026-07-16T00:00:00.000Z'),
    });
    disablePlugin.mockRejectedValue(new Error('forced disable failure'));

    await expect(
      orchestratePluginLifecycleMutation({
        action: 'disable',
        pluginId: 'url-shortener',
        initiatedBy: 'admin@example.com',
      })
    ).rejects.toThrow('forced disable failure');

    expect(dbMock.insert).toHaveBeenCalledTimes(3);
    const tableCalls = dbMock.db.mock.calls as unknown as Array<[string]>;
    expect(tableCalls[0][0]).toBe('devholm_plugin_lifecycle_operations');
    expect(tableCalls[1][0]).toBe('devholm_plugin_lifecycle_operations');
    expect(tableCalls[2][0]).toBe('devholm_plugin_lifecycle_events');
    const insertCalls = dbMock.insert.mock.calls as unknown as Array<[Record<string, unknown>]>;
    const operationWrite = insertCalls[1][0] as Record<string, unknown>;
    const eventWrite = insertCalls[2][0] as Record<string, unknown>;

    expect(operationWrite).toMatchObject({
      plugin_id: 'url-shortener',
      action: 'disable',
      status: 'failed',
      public_message: 'forced disable failure',
    });
    expect(eventWrite).toMatchObject({
      plugin_id: 'url-shortener',
      transition: 'disable',
      result: 'failed',
      public_message: 'forced disable failure',
    });
  });
});
