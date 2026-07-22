import type { Knex } from 'knex';
import { getDb } from '@/db';

export const LIFECYCLE_LOCK_NAMESPACE = 'devholm.plugin.lifecycle';

type PluginSessionLockMetadata = {
  ownerPid: number;
};

export async function withPluginLifecycleSessionLock<T>(
  pluginId: string,
  work: (metadata: PluginSessionLockMetadata) => Promise<T>,
  db: Knex = getDb()
): Promise<T> {
  if (!db.client || typeof db.client.acquireConnection !== 'function') {
    throw new Error('plugin lifecycle session lock requires a database client connection pool');
  }

  const connection = await db.client.acquireConnection();

  try {
    if (typeof db.raw !== 'function') {
      throw new Error('plugin lifecycle session lock requires knex raw SQL support');
    }

    await db
      .raw('select pg_advisory_lock(hashtext(?), hashtext(?))', [
        LIFECYCLE_LOCK_NAMESPACE,
        pluginId,
      ])
      .connection(connection);

    const backendPidResult = await db
      .raw<{ rows?: Array<{ pid: number }> }>('select pg_backend_pid() as pid')
      .connection(connection);
    const ownerPid = backendPidResult?.rows?.[0]?.pid ?? process.pid;
    if (!Number.isInteger(ownerPid) || ownerPid <= 0) {
      throw new Error('failed to resolve lifecycle lock backend pid');
    }

    return await work({ ownerPid });
  } finally {
    try {
      const unlockResult = await db
        .raw('select pg_advisory_unlock(hashtext(?), hashtext(?))', [
          LIFECYCLE_LOCK_NAMESPACE,
          pluginId,
        ])
        .connection(connection);

      const unlocked = Boolean(unlockResult?.rows?.[0]?.pg_advisory_unlock);
      if (!unlocked) {
        throw new Error(`failed to release lifecycle advisory lock for plugin ${pluginId}`);
      }
    } finally {
      await db.client.releaseConnection(connection);
    }
  }
}

export async function acquirePluginLifecycleTransactionLock(
  pluginId: string,
  trx: Knex.Transaction
): Promise<void> {
  if (typeof (trx as unknown as { raw?: unknown }).raw !== 'function') {
    throw new Error('plugin lifecycle transaction lock requires transaction raw SQL support');
  }

  await trx.raw('select pg_advisory_xact_lock(hashtext(?), hashtext(?))', [
    LIFECYCLE_LOCK_NAMESPACE,
    pluginId,
  ]);
}
