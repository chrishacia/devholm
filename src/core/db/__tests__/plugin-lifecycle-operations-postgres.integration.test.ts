/** @vitest-environment node */

import path from 'path';
import knex, { type Knex } from 'knex';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  writePluginLifecycleOperationRecord,
  writePluginLifecycleTransitionEvent,
} from '@core/db/plugin-lifecycle';

const TEST_DB_SUFFIX = `_lifecycle_ops_it_${process.pid}`;

const configuredTestDbUrl = process.env.PHASE2_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const shouldRunPostgresIntegration = Boolean(configuredTestDbUrl);

const postgresDescribe = shouldRunPostgresIntegration ? describe.sequential : describe.skip;

let adminDb: Knex;
let integrationDb: Knex;
let integrationDbName = '';

function requireBaseDatabaseUrl(): string {
  if (!configuredTestDbUrl) {
    throw new Error(
      'plugin-lifecycle-operations-postgres.integration.test requires PHASE2_TEST_DATABASE_URL or DATABASE_URL'
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

async function migrateCoreSchemas(db: Knex): Promise<void> {
  await db.migrate.latest({
    directory: [path.join(process.cwd(), 'src/core/db/migrations')],
    tableName: 'knex_migrations',
    loadExtensions: ['.ts'],
  });
}

async function resetLifecycleTables(db: Knex): Promise<void> {
  await db('devholm_plugin_lifecycle_events').del();
  await db('devholm_plugin_lifecycle_operations').del();
  await db('devholm_plugins').where({ plugin_id: 'url-shortener' }).del();
}

async function seedPluginLedgerRow(db: Knex): Promise<void> {
  await db('devholm_plugins').insert({
    plugin_id: 'url-shortener',
    bundled_version: '1.0.0',
    installed_version: '1.0.0',
    enabled: false,
    lifecycle_state: 'installed',
    operation_status: 'idle',
    installed_at: new Date(),
    upgraded_at: null,
    disabled_at: null,
    last_error: null,
    manifest_checksum: null,
    updated_at: new Date(),
  });
}

function sampleState(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    installed: false,
    enabled: false,
    lifecycleState: 'bundled',
    operationStatus: 'idle',
    installedVersion: null,
    bundledVersion: '1.0.0',
    updatedAt: null,
    ...overrides,
  } as const;
}

function sampleOperation(
  operationId: string,
  overrides: Partial<Parameters<typeof writePluginLifecycleOperationRecord>[0]> = {}
): Parameters<typeof writePluginLifecycleOperationRecord>[0] {
  const now = new Date().toISOString();

  return {
    schemaVersion: 1,
    operationId,
    pluginId: 'url-shortener',
    action: 'enable',
    idempotencyKey: undefined,
    status: 'running',
    actor: 'integration@example.com',
    leaseOwner: 'integration-worker',
    leaseExpiresAt: new Date(Date.now() + 60000).toISOString(),
    expectedLifecycleState: 'disabled',
    authorizationContext: { isAdmin: true, principal: 'integration@example.com' },
    mutationAuthorityVersion: 'v2',
    correlationId: `corr-${operationId}`,
    currentPhase: 'executing',
    startedAt: now,
    updatedAt: now,
    attemptCount: 1,
    priorStateSnapshot: sampleState(),
    ...overrides,
  };
}

postgresDescribe('plugin lifecycle operations PostgreSQL integration', () => {
  beforeAll(async () => {
    const baseDatabaseUrl = requireBaseDatabaseUrl();
    integrationDbName = `${getDatabaseName(baseDatabaseUrl)}${TEST_DB_SUFFIX}`;
    const integrationDbUrl = withDatabaseName(baseDatabaseUrl, integrationDbName);

    const adminUrl = withDatabaseName(baseDatabaseUrl, 'postgres');
    adminDb = knex({
      client: 'pg',
      connection: adminUrl,
      pool: { min: 0, max: 2 },
    });

    await adminDb.raw(
      `SELECT pg_terminate_backend(pid)
       FROM pg_stat_activity
       WHERE datname = ? AND pid <> pg_backend_pid()`,
      [integrationDbName]
    );
    await adminDb.raw(`DROP DATABASE IF EXISTS "${integrationDbName}"`);
    await adminDb.raw(`CREATE DATABASE "${integrationDbName}"`);

    integrationDb = knex({
      client: 'pg',
      connection: integrationDbUrl,
      pool: { min: 0, max: 4 },
    });

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

  beforeEach(async () => {
    await resetLifecycleTables(integrationDb);
    await seedPluginLedgerRow(integrationDb);
  });

  it('enforces unique idempotency key per plugin', async () => {
    await writePluginLifecycleOperationRecord(
      sampleOperation('op-idem-1', {
        idempotencyKey: 'idem-1',
        status: 'succeeded',
        currentPhase: 'completed',
      }),
      integrationDb
    );

    await expect(
      writePluginLifecycleOperationRecord(
        sampleOperation('op-idem-2', {
          idempotencyKey: 'idem-1',
          status: 'running',
        }),
        integrationDb
      )
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('enforces a single active operation per plugin', async () => {
    await writePluginLifecycleOperationRecord(sampleOperation('op-active-1'), integrationDb);

    await expect(
      writePluginLifecycleOperationRecord(sampleOperation('op-active-2'), integrationDb)
    ).rejects.toMatchObject({ code: '23505' });

    await writePluginLifecycleOperationRecord(
      sampleOperation('op-active-1', {
        status: 'succeeded',
        currentPhase: 'completed',
        finishedAt: new Date().toISOString(),
      }),
      integrationDb
    );

    await expect(
      writePluginLifecycleOperationRecord(sampleOperation('op-active-3'), integrationDb)
    ).resolves.toBeUndefined();
  });

  it('prevents duplicate lifecycle transition events by event id', async () => {
    const now = new Date().toISOString();

    await writePluginLifecycleOperationRecord(
      sampleOperation('op-evt-1', {
        status: 'succeeded',
        currentPhase: 'completed',
        finishedAt: now,
      }),
      integrationDb
    );

    await writePluginLifecycleTransitionEvent(
      {
        schemaVersion: 1,
        eventId: 'evt-1',
        operationId: 'op-evt-1',
        pluginId: 'url-shortener',
        transition: 'enable',
        result: 'succeeded',
        actor: 'integration@example.com',
        correlationId: 'corr-op-evt-1',
        timestamp: now,
        previousState: sampleState({ installed: true, lifecycleState: 'installed' }),
        nextState: sampleState({ installed: true, enabled: true, lifecycleState: 'active' }),
      },
      integrationDb
    );

    await writePluginLifecycleTransitionEvent(
      {
        schemaVersion: 1,
        eventId: 'evt-1',
        operationId: 'op-evt-1',
        pluginId: 'url-shortener',
        transition: 'enable',
        result: 'succeeded',
        actor: 'integration@example.com',
        correlationId: 'corr-op-evt-1',
        timestamp: now,
        previousState: sampleState({ installed: true, lifecycleState: 'installed' }),
        nextState: sampleState({ installed: true, enabled: true, lifecycleState: 'active' }),
      },
      integrationDb
    );

    const rows = await integrationDb('devholm_plugin_lifecycle_events')
      .where({ event_id: 'evt-1' })
      .count<{ count: string }[]>('* as count');

    expect(Number(rows[0]?.count ?? '0')).toBe(1);
  });
});
