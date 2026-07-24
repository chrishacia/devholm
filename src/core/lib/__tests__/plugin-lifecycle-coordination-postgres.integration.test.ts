/** @vitest-environment node */

import path from 'path';
import knex, { type Knex } from 'knex';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  LIFECYCLE_LOCK_NAMESPACE,
  withPluginLifecycleSessionLock,
} from '@core/lib/plugin-lifecycle-coordination.server';

const TEST_DB_SUFFIX = `_lifecycle_coord_it_${process.pid}`;
const configuredTestDbUrl = process.env.PHASE2_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const shouldRunPostgresIntegration = Boolean(configuredTestDbUrl);
const postgresDescribe = shouldRunPostgresIntegration ? describe.sequential : describe.skip;

let adminDb: Knex;
let integrationDb: Knex;
let integrationDbName = '';
let integrationDbUrl = '';

function requireBaseDatabaseUrl(): string {
  if (!configuredTestDbUrl) {
    throw new Error(
      'plugin-lifecycle-coordination-postgres.integration.test requires PHASE2_TEST_DATABASE_URL or DATABASE_URL'
    );
  }

  return configuredTestDbUrl;
}

function withDatabaseName(urlValue: string, dbName: string): string {
  const parsed = new URL(urlValue);
  parsed.pathname = `/${dbName}`;
  return parsed.toString();
}

function getDatabaseName(urlValue: string): string {
  const parsed = new URL(urlValue);
  return parsed.pathname.replace(/^\//u, '') || 'postgres';
}

function createClient(url = integrationDbUrl, max = 1): Knex {
  return knex({
    client: 'pg',
    connection: url,
    pool: { min: 0, max },
  });
}

function createTimeoutClient(timeoutMs: number): Knex {
  const parsed = new URL(integrationDbUrl);
  parsed.searchParams.set(
    'options',
    `-c lock_timeout=${timeoutMs}ms -c statement_timeout=${timeoutMs}ms`
  );
  return createClient(parsed.toString(), 1);
}

async function migrateCoreSchemas(db: Knex): Promise<void> {
  await db.migrate.latest({
    directory: [path.join(process.cwd(), 'src/core/db/migrations')],
    tableName: 'knex_migrations',
    loadExtensions: ['.ts'],
  });
}

postgresDescribe('plugin lifecycle coordination PostgreSQL integration', () => {
  beforeAll(async () => {
    const baseDatabaseUrl = requireBaseDatabaseUrl();
    integrationDbName = `${getDatabaseName(baseDatabaseUrl)}${TEST_DB_SUFFIX}`;
    integrationDbUrl = withDatabaseName(baseDatabaseUrl, integrationDbName);

    const adminUrl = withDatabaseName(baseDatabaseUrl, 'postgres');
    adminDb = knex({ client: 'pg', connection: adminUrl, pool: { min: 0, max: 2 } });

    await adminDb.raw(
      `SELECT pg_terminate_backend(pid)
       FROM pg_stat_activity
       WHERE datname = ? AND pid <> pg_backend_pid()`,
      [integrationDbName]
    );
    await adminDb.raw(`DROP DATABASE IF EXISTS "${integrationDbName}"`);
    await adminDb.raw(`CREATE DATABASE "${integrationDbName}"`);

    integrationDb = createClient(integrationDbUrl, 4);
    process.env.DATABASE_URL = integrationDbUrl;
    process.env.DATABASE_PASSWORD = 'test';

    await migrateCoreSchemas(integrationDb);
  });

  afterAll(async () => {
    if (integrationDb) {
      await integrationDb.destroy();
    }

    if (adminDb) {
      await adminDb.raw(
        `SELECT pg_terminate_backend(pid)
         FROM pg_stat_activity
         WHERE datname = ? AND pid <> pg_backend_pid()`,
        [integrationDbName]
      );
      await adminDb.raw(`DROP DATABASE IF EXISTS "${integrationDbName}"`);
      await adminDb.destroy();
    }
  });

  it('captures backend pid from the lock owner connection and blocks independent acquisition until release', async () => {
    const db = createClient(integrationDbUrl, 2);
    const probe = createClient(integrationDbUrl, 1);

    const result = await withPluginLifecycleSessionLock(
      'url-shortener',
      async ({ ownerPid }) => {
        const lockOwnerEvidence = await probe.raw<{ rows: Array<{ held: boolean }> }>(
          `
            select exists (
              select 1
              from pg_locks
              where locktype = 'advisory'
                and pid = ?
                and granted = true
                and classid = hashtext(?)
                and objid = hashtext(?)
            ) as held
          `,
          [ownerPid, LIFECYCLE_LOCK_NAMESPACE, 'url-shortener']
        );
        expect(lockOwnerEvidence.rows[0]?.held).toBe(true);

        const whileHeld = await probe.raw<{ rows: Array<{ got: boolean }> }>(
          'select pg_try_advisory_lock(hashtext(?), hashtext(?)) as got',
          [LIFECYCLE_LOCK_NAMESPACE, 'url-shortener']
        );
        expect(whileHeld.rows[0]?.got).toBe(false);

        return ownerPid;
      },
      db
    );

    expect(result).toBeGreaterThan(0);

    const afterRelease = await probe.raw<{ rows: Array<{ got: boolean }> }>(
      'select pg_try_advisory_lock(hashtext(?), hashtext(?)) as got',
      [LIFECYCLE_LOCK_NAMESPACE, 'url-shortener']
    );
    expect(afterRelease.rows[0]?.got).toBe(true);
    await probe.raw('select pg_advisory_unlock(hashtext(?), hashtext(?))', [
      LIFECYCLE_LOCK_NAMESPACE,
      'url-shortener',
    ]);

    await db.destroy();
    await probe.destroy();
  });

  it('releases real session lock when protected work throws', async () => {
    const db = createClient(integrationDbUrl, 2);
    const probe = createClient(integrationDbUrl, 1);

    await expect(
      withPluginLifecycleSessionLock(
        'calendar',
        async () => {
          throw new Error('forced work failure');
        },
        db
      )
    ).rejects.toThrow('forced work failure');

    const afterFailure = await probe.raw<{ rows: Array<{ got: boolean }> }>(
      'select pg_try_advisory_lock(hashtext(?), hashtext(?)) as got',
      [LIFECYCLE_LOCK_NAMESPACE, 'calendar']
    );
    expect(afterFailure.rows[0]?.got).toBe(true);
    await probe.raw('select pg_advisory_unlock(hashtext(?), hashtext(?))', [
      LIFECYCLE_LOCK_NAMESPACE,
      'calendar',
    ]);

    await db.destroy();
    await probe.destroy();
  });

  it('releases real session lock when backend pid resolution fails after acquisition', async () => {
    const db = createClient(integrationDbUrl, 2);
    const probe = createClient(integrationDbUrl, 1);
    const pidFailureDb = {
      client: db.client,
      raw: ((query: unknown, bindings?: unknown[]) => {
        const sql = String(query);
        if (sql.includes('pg_backend_pid')) {
          return {
            connection: async () => ({ rows: [{ pid: null }] }),
          } as unknown as ReturnType<Knex['raw']>;
        }

        return db.raw(query as never, bindings as never);
      }) as Knex['raw'],
    } as unknown as Knex;

    await expect(
      withPluginLifecycleSessionLock('gallery', async () => 'ok', pidFailureDb)
    ).rejects.toThrow(/failed to resolve lifecycle lock backend pid/);

    const afterFailure = await probe.raw<{ rows: Array<{ got: boolean }> }>(
      'select pg_try_advisory_lock(hashtext(?), hashtext(?)) as got',
      [LIFECYCLE_LOCK_NAMESPACE, 'gallery']
    );
    expect(afterFailure.rows[0]?.got).toBe(true);
    await probe.raw('select pg_advisory_unlock(hashtext(?), hashtext(?))', [
      LIFECYCLE_LOCK_NAMESPACE,
      'gallery',
    ]);

    await db.destroy();
    await probe.destroy();
  });

  it('uses bounded lock timeout for independent contender while lock is held', async () => {
    const db = createClient(integrationDbUrl, 2);
    const contender = createTimeoutClient(1200);

    let releaseLock: (() => void) | undefined;
    const holdLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    let lockHeldSignal: (() => void) | undefined;
    const lockHeld = new Promise<void>((resolve) => {
      lockHeldSignal = resolve;
    });

    const holder = withPluginLifecycleSessionLock(
      'url-shortener',
      async () => {
        lockHeldSignal?.();
        await holdLock;
        return 'held';
      },
      db
    );

    await lockHeld;

    const startedAt = Date.now();
    await expect(
      contender.raw('select pg_advisory_lock(hashtext(?), hashtext(?))', [
        LIFECYCLE_LOCK_NAMESPACE,
        'url-shortener',
      ])
    ).rejects.toThrow(/canceling statement due to lock timeout|statement timeout/i);
    const elapsed = Date.now() - startedAt;
    expect(elapsed).toBeLessThan(5000);

    releaseLock?.();
    await holder;

    await contender.destroy();
    await db.destroy();
  });

  it('does not deadlock with pool size one across repeated lock cycles', async () => {
    const singlePoolDb = createClient(integrationDbUrl, 1);

    const first = await withPluginLifecycleSessionLock(
      'calendar',
      async ({ ownerPid }) => ownerPid,
      singlePoolDb
    );
    const second = await withPluginLifecycleSessionLock(
      'calendar',
      async ({ ownerPid }) => ownerPid,
      singlePoolDb
    );

    expect(first).toBeGreaterThan(0);
    expect(second).toBeGreaterThan(0);

    const probe = await singlePoolDb.raw<{ rows: Array<{ ok: number }> }>('select 1 as ok');
    expect(probe.rows[0]?.ok).toBe(1);

    await singlePoolDb.destroy();
  });
});
