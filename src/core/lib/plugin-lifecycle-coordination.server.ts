import { AsyncLocalStorage } from 'node:async_hooks';
import type { Knex } from 'knex';
import { getDb } from '@/db';

export const LIFECYCLE_LOCK_NAMESPACE = 'devholm.plugin.lifecycle';

type SessionLockContext = {
  heldPluginIds: Set<string>;
};

type PluginSessionLockMetadata = {
  ownerPid: number;
};

const lifecycleLockScope = new AsyncLocalStorage<SessionLockContext>();

function isPluginLockAlreadyHeld(pluginId: string): boolean {
  return lifecycleLockScope.getStore()?.heldPluginIds.has(pluginId) ?? false;
}

function withHeldPluginInContext<T>(pluginId: string, work: () => Promise<T>): Promise<T> {
  const current = lifecycleLockScope.getStore();
  const heldPluginIds = new Set(current?.heldPluginIds ?? []);
  heldPluginIds.add(pluginId);
  return lifecycleLockScope.run({ heldPluginIds }, work);
}

export async function withPluginLifecycleSessionLock<T>(
  pluginId: string,
  work: (metadata: PluginSessionLockMetadata) => Promise<T>,
  db: Knex = getDb()
): Promise<T> {
  if (isPluginLockAlreadyHeld(pluginId)) {
    return work({ ownerPid: process.pid });
  }

  if (!db.client || typeof db.client.acquireConnection !== 'function') {
    return withHeldPluginInContext(pluginId, () => work({ ownerPid: process.pid }));
  }

  const connection = await db.client.acquireConnection();

  try {
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

    return await withHeldPluginInContext(pluginId, () => work({ ownerPid }));
  } finally {
    try {
      await db
        .raw('select pg_advisory_unlock(hashtext(?), hashtext(?))', [
          LIFECYCLE_LOCK_NAMESPACE,
          pluginId,
        ])
        .connection(connection);
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
    return;
  }

  await trx.raw('select pg_advisory_xact_lock(hashtext(?), hashtext(?))', [
    LIFECYCLE_LOCK_NAMESPACE,
    pluginId,
  ]);
}
