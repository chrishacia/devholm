import { describe, expect, it, vi } from 'vitest';

const getDb = vi.hoisted(() => vi.fn());

vi.mock('@/db', () => ({
  getDb,
}));

describe('core/db plugin lifecycle records', () => {
  it('writes durable lifecycle operations and transition events', async () => {
    const operationMerge = vi.fn(async () => undefined);
    const eventIgnore = vi.fn(async () => undefined);
    const operationOnConflict = vi.fn(() => ({ merge: operationMerge }));
    const eventOnConflict = vi.fn(() => ({ ignore: eventIgnore }));
    const operationInsert = vi.fn(() => ({ onConflict: operationOnConflict }));
    const eventInsert = vi.fn(() => ({ onConflict: eventOnConflict }));
    const tableFactory = vi.fn((tableName: string) => {
      if (tableName === 'devholm_plugin_lifecycle_operations') {
        return { insert: operationInsert };
      }

      if (tableName === 'devholm_plugin_lifecycle_events') {
        return { insert: eventInsert };
      }

      throw new Error(`unexpected table ${tableName}`);
    });
    getDb.mockReturnValue(tableFactory);

    const { writePluginLifecycleOperationRecord, writePluginLifecycleTransitionEvent } =
      await import('@core/db/plugin-lifecycle');

    await writePluginLifecycleOperationRecord({
      schemaVersion: 1,
      operationId: 'op-1',
      pluginId: 'url-shortener',
      action: 'install',
      status: 'running',
      actor: 'admin@example.com',
      correlationId: 'corr-1',
      currentPhase: 'executing',
      startedAt: '2026-07-16T00:00:00.000Z',
      updatedAt: '2026-07-16T00:00:00.000Z',
      attemptCount: 1,
      priorStateSnapshot: {
        installed: false,
        enabled: false,
        lifecycleState: 'bundled',
        operationStatus: 'idle',
        installedVersion: null,
        bundledVersion: '1.0.0',
        updatedAt: null,
      },
    });

    await writePluginLifecycleTransitionEvent({
      schemaVersion: 1,
      eventId: 'evt-1',
      operationId: 'op-1',
      pluginId: 'url-shortener',
      transition: 'install',
      result: 'succeeded',
      actor: 'admin@example.com',
      correlationId: 'corr-1',
      timestamp: '2026-07-16T00:00:01.000Z',
      previousState: {
        installed: false,
        enabled: false,
        lifecycleState: 'bundled',
        operationStatus: 'idle',
        installedVersion: null,
        bundledVersion: '1.0.0',
        updatedAt: null,
      },
      nextState: {
        installed: true,
        enabled: true,
        lifecycleState: 'installed',
        operationStatus: 'idle',
        installedVersion: '1.0.0',
        bundledVersion: '1.0.0',
        updatedAt: '2026-07-16T00:00:01.000Z',
      },
    });

    expect(tableFactory).toHaveBeenCalledWith('devholm_plugin_lifecycle_operations');
    expect(tableFactory).toHaveBeenCalledWith('devholm_plugin_lifecycle_events');
    expect(operationInsert).toHaveBeenCalledTimes(1);
    expect(eventInsert).toHaveBeenCalledTimes(1);

    const operationInsertPayload = operationInsert.mock.calls[0] as unknown as [
      Record<string, unknown>,
    ];
    const eventInsertPayload = eventInsert.mock.calls[0] as unknown as [Record<string, unknown>];

    expect(operationInsertPayload[0]).toMatchObject({
      schema_version: 1,
      operation_id: 'op-1',
      plugin_id: 'url-shortener',
      action: 'install',
      status: 'running',
      actor: 'admin@example.com',
      correlation_id: 'corr-1',
      current_phase: 'executing',
      attempt_count: 1,
      prior_state_snapshot: JSON.stringify({
        installed: false,
        enabled: false,
        lifecycleState: 'bundled',
        operationStatus: 'idle',
        installedVersion: null,
        bundledVersion: '1.0.0',
        updatedAt: null,
      }),
    });

    expect(eventInsertPayload[0]).toMatchObject({
      schema_version: 1,
      event_id: 'evt-1',
      operation_id: 'op-1',
      plugin_id: 'url-shortener',
      transition: 'install',
      result: 'succeeded',
      actor: 'admin@example.com',
      correlation_id: 'corr-1',
      previous_state: JSON.stringify({
        installed: false,
        enabled: false,
        lifecycleState: 'bundled',
        operationStatus: 'idle',
        installedVersion: null,
        bundledVersion: '1.0.0',
        updatedAt: null,
      }),
      next_state: JSON.stringify({
        installed: true,
        enabled: true,
        lifecycleState: 'installed',
        operationStatus: 'idle',
        installedVersion: '1.0.0',
        bundledVersion: '1.0.0',
        updatedAt: '2026-07-16T00:00:01.000Z',
      }),
    });
  });

  it('reads the latest lifecycle operation record in descending update order', async () => {
    const first = vi.fn(async () => ({
      schema_version: 1,
      operation_id: 'op-2',
      plugin_id: 'url-shortener',
      action: 'disable',
      status: 'failed',
      actor: 'admin@example.com',
      correlation_id: 'corr-2',
      current_phase: 'completed',
      started_at: '2026-07-16T00:00:02.000Z',
      updated_at: '2026-07-16T00:00:03.000Z',
      finished_at: '2026-07-16T00:00:03.000Z',
      attempt_count: 1,
      prior_state_snapshot: JSON.stringify({
        installed: true,
        enabled: true,
        lifecycleState: 'installed',
        operationStatus: 'idle',
        installedVersion: '1.0.0',
        bundledVersion: '1.0.0',
        updatedAt: '2026-07-16T00:00:02.000Z',
      }),
      next_state_snapshot: null,
      error_code: 'operation-conflict',
      public_message: 'conflict',
      internal_diagnostic: 'conflict',
      retryable: true,
      recovery_classification: 'retryable',
    }));
    const orderBy = vi.fn(() => ({ first }));
    const where = vi.fn(() => ({ orderBy }));
    const tableFactory = vi.fn(() => ({ where }));
    getDb.mockReturnValue(tableFactory);

    const { readLatestPluginLifecycleOperationRecord } = await import('@core/db/plugin-lifecycle');

    const record = await readLatestPluginLifecycleOperationRecord('url-shortener');

    expect(where).toHaveBeenCalledWith({ plugin_id: 'url-shortener' });
    expect(orderBy).toHaveBeenCalledWith('updated_at', 'desc');
    expect(record).toMatchObject({
      schemaVersion: 1,
      operationId: 'op-2',
      pluginId: 'url-shortener',
      action: 'disable',
      status: 'failed',
      actor: 'admin@example.com',
      correlationId: 'corr-2',
      currentPhase: 'completed',
      attemptCount: 1,
      error: {
        code: 'operation-conflict',
        message: 'conflict',
        retryable: true,
        recoveryClassification: 'retryable',
      },
    });
  });
});
