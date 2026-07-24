import { describe, expect, it, vi } from 'vitest';
import type { Knex } from 'knex';
import {
  acquirePluginLifecycleTransactionLock,
  withPluginLifecycleSessionLock,
} from '@core/lib/plugin-lifecycle-coordination.server';

type QueryHandlerResult = { rows?: Array<Record<string, unknown>> };

type DbMockOptions = {
  onAcquireLock?: () => Promise<QueryHandlerResult> | QueryHandlerResult;
  onBackendPid?: () => Promise<QueryHandlerResult> | QueryHandlerResult;
  onUnlock?: () => Promise<QueryHandlerResult> | QueryHandlerResult;
  releaseConnectionImpl?: () => Promise<void> | void;
  withRaw?: boolean;
};

function createDbMock(options: DbMockOptions = {}) {
  const lockConnection = { id: 'conn-1' };
  const acquireConnection = vi.fn(async () => lockConnection);
  const releaseConnection = vi.fn(async () => {
    await options.releaseConnectionImpl?.();
  });

  const onAcquireLock = options.onAcquireLock ?? (() => ({ rows: [] }));
  const onBackendPid = options.onBackendPid ?? (() => ({ rows: [{ pid: 41011 }] }));
  const onUnlock = options.onUnlock ?? (() => ({ rows: [{ pg_advisory_unlock: true }] }));

  const raw = vi.fn((query: unknown) => ({
    connection: vi.fn(async () => {
      const sql = String(query);
      if (sql.includes('pg_advisory_lock')) {
        return onAcquireLock();
      }
      if (sql.includes('pg_backend_pid')) {
        return onBackendPid();
      }
      if (sql.includes('pg_advisory_unlock')) {
        return onUnlock();
      }
      return { rows: [] };
    }),
  }));

  const db = {
    client: {
      acquireConnection,
      releaseConnection,
    },
  } as {
    raw?: unknown;
    client: {
      acquireConnection: typeof acquireConnection;
      releaseConnection: typeof releaseConnection;
    };
  };

  if (options.withRaw !== false) {
    db.raw = raw;
  }

  return { db: db as unknown as Knex, raw, acquireConnection, releaseConnection };
}

describe('plugin lifecycle coordination helper', () => {
  it('returns work result and lock owner pid', async () => {
    const { db } = createDbMock();

    const value = await withPluginLifecycleSessionLock(
      'plugin-a',
      async ({ ownerPid }) => `pid-${ownerPid}`,
      db
    );

    expect(value).toBe('pid-41011');
  });

  it('fails closed when knex raw support is unavailable', async () => {
    const { db, releaseConnection } = createDbMock({ withRaw: false });

    await expect(withPluginLifecycleSessionLock('plugin-a', async () => 'ok', db)).rejects.toThrow(
      /requires knex raw SQL support/
    );

    expect(releaseConnection).toHaveBeenCalledTimes(1);
  });

  it('fails closed when backend pid cannot be resolved', async () => {
    const { db, raw } = createDbMock({
      onBackendPid: () => ({ rows: [{ pid: null }] }),
    });

    await expect(withPluginLifecycleSessionLock('plugin-a', async () => 'ok', db)).rejects.toThrow(
      /failed to resolve lifecycle lock backend pid/
    );

    const sqlStatements = raw.mock.calls.map(([query]) => String(query));
    expect(sqlStatements.some((sql) => sql.includes('pg_advisory_unlock'))).toBe(true);
  });

  it('preserves primary work error when unlock succeeds', async () => {
    const { db } = createDbMock();

    const error = await withPluginLifecycleSessionLock(
      'plugin-a',
      async () => {
        throw new Error('work failed');
      },
      db
    ).catch((thrown: unknown) => thrown as Error);

    expect(error.message).toBe('work failed');
    expect((error as Error & { secondaryErrors?: Error[] }).secondaryErrors).toBeUndefined();
  });

  it('preserves primary work error and records unlock failure as secondary', async () => {
    const { db } = createDbMock({
      onUnlock: () => ({ rows: [{ pg_advisory_unlock: false }] }),
    });

    const error = await withPluginLifecycleSessionLock(
      'plugin-a',
      async () => {
        throw new Error('work failed');
      },
      db
    ).catch((thrown: unknown) => thrown as Error & { secondaryErrors?: Error[] });

    expect(error.message).toBe('work failed');
    expect(error.secondaryErrors?.[0]?.message).toMatch(
      /failed to release lifecycle advisory lock/
    );
  });

  it('throws unlock error when work succeeds but unlock reports false', async () => {
    const { db } = createDbMock({
      onUnlock: () => ({ rows: [{ pg_advisory_unlock: false }] }),
    });

    await expect(withPluginLifecycleSessionLock('plugin-a', async () => 'ok', db)).rejects.toThrow(
      /failed to release lifecycle advisory lock for plugin plugin-a/
    );
  });

  it('records unlock throw and release failure as secondary errors on primary work error', async () => {
    const { db } = createDbMock({
      onUnlock: () => {
        throw new Error('unlock exploded');
      },
      releaseConnectionImpl: () => {
        throw new Error('release exploded');
      },
    });

    const error = await withPluginLifecycleSessionLock(
      'plugin-a',
      async () => {
        throw new Error('work failed');
      },
      db
    ).catch((thrown: unknown) => thrown as Error & { secondaryErrors?: Error[] });

    expect(error.message).toBe('work failed');
    expect(error.secondaryErrors?.map((entry) => entry.message)).toEqual([
      'unlock exploded',
      'release exploded',
    ]);
  });

  it('does not attempt unlock when acquire lock fails', async () => {
    const { db, raw } = createDbMock({
      onAcquireLock: () => {
        throw new Error('acquire failed');
      },
    });

    await expect(withPluginLifecycleSessionLock('plugin-a', async () => 'ok', db)).rejects.toThrow(
      /acquire failed/
    );

    const sqlStatements = raw.mock.calls.map(([query]) => String(query));
    expect(sqlStatements.some((sql) => sql.includes('pg_advisory_unlock'))).toBe(false);
  });

  it('acquires transaction advisory lock via xact lock primitive', async () => {
    const raw = vi.fn(async () => undefined);
    const trx = { raw } as unknown as Knex.Transaction;

    await acquirePluginLifecycleTransactionLock('plugin-a', trx);

    expect(raw).toHaveBeenCalledWith('select pg_advisory_xact_lock(hashtext(?), hashtext(?))', [
      'devholm.plugin.lifecycle',
      'plugin-a',
    ]);
  });
});
