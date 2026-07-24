import type { Knex } from 'knex';
import { getDb } from '@/db';

export const LIFECYCLE_LOCK_NAMESPACE = 'devholm.plugin.lifecycle';

type PluginSessionLockMetadata = {
  ownerPid: number;
};

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function attachSecondaryErrors(primary: Error, secondary: Error[]): Error {
  if (secondary.length === 0) {
    return primary;
  }

  const existing =
    (primary as Error & { secondaryErrors?: Error[] }).secondaryErrors?.slice() ?? [];

  (primary as Error & { secondaryErrors?: Error[] }).secondaryErrors = [...existing, ...secondary];

  if (!(primary as Error & { cause?: unknown }).cause) {
    (primary as Error & { cause?: unknown }).cause = secondary[0];
  }

  return primary;
}

export async function withPluginLifecycleSessionLock<T>(
  pluginId: string,
  work: (metadata: PluginSessionLockMetadata) => Promise<T>,
  db: Knex = getDb()
): Promise<T> {
  if (!db.client || typeof db.client.acquireConnection !== 'function') {
    throw new Error('plugin lifecycle session lock requires a database client connection pool');
  }

  const connection = await db.client.acquireConnection();
  let lockAcquired = false;
  let workResult: T | undefined;
  let primaryError: Error | null = null;
  const secondaryErrors: Error[] = [];

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
    lockAcquired = true;

    const backendPidResult = await db
      .raw<{ rows?: Array<{ pid: number }> }>('select pg_backend_pid() as pid')
      .connection(connection);
    const ownerPid = backendPidResult?.rows?.[0]?.pid;
    if (typeof ownerPid !== 'number' || !Number.isInteger(ownerPid) || ownerPid <= 0) {
      throw new Error('failed to resolve lifecycle lock backend pid');
    }

    workResult = await work({ ownerPid });
  } catch (error) {
    primaryError = normalizeError(error);
  }

  if (lockAcquired) {
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
    } catch (error) {
      const unlockError = normalizeError(error);
      if (primaryError) {
        secondaryErrors.push(unlockError);
      } else {
        primaryError = unlockError;
      }
    }
  }

  try {
    await db.client.releaseConnection(connection);
  } catch (error) {
    const releaseError = normalizeError(error);
    if (primaryError) {
      secondaryErrors.push(releaseError);
    } else {
      primaryError = releaseError;
    }
  }

  if (primaryError) {
    throw attachSecondaryErrors(primaryError, secondaryErrors);
  }

  return workResult as T;
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
