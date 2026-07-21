/** @vitest-environment node */

import path from 'node:path';
import knex, { type Knex } from 'knex';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { reconcileLegacyAndCanonicalPluginState } from '@core/lib/plugin-cutover-legacy-reconciler.server';

const TEST_DB_SUFFIX = `_cutover_calendar_preserve_${process.pid}`;
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
      'plugin-cutover-calendar-preservation-postgres.integration.test requires PHASE2_TEST_DATABASE_URL or DATABASE_URL'
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

async function migrateSchemas(db: Knex): Promise<void> {
  await db.migrate.latest({
    directory: [
      path.join(process.cwd(), 'src/core/db/migrations'),
      path.join(process.cwd(), 'src/user/extensions/db/migrations'),
    ],
    tableName: 'knex_migrations',
    loadExtensions: ['.ts'],
  });
}

async function resetTables(db: Knex): Promise<void> {
  await db('devholm_plugin_cutover_reconciliation_events').del();
  await db('devholm_plugin_cutover_reconciliation_states').del();
  await db('devholm_plugin_migration_checkpoints').del();
  await db('devholm_plugin_lifecycle_events').del();
  await db('devholm_plugin_lifecycle_operations').del();
  await db('devholm_plugin_migrations').del();
  await db('devholm_plugins').where({ plugin_id: 'calendar' }).del();
  await db('site_settings').where('key', 'like', 'plugin:calendar:%').del();

  await db('calendar_integrations').del();
  await db('calendar_bookings').del();
  await db('calendar_blocks').del();
  await db('calendar_event_types').del();
  await db('calendar_collections').del();
}

postgresDescribe('plugin cutover Calendar preservation (postgres integration)', () => {
  beforeAll(async () => {
    const baseDatabaseUrl = requireBaseDatabaseUrl();
    integrationDbName = `${getDatabaseName(baseDatabaseUrl)}${TEST_DB_SUFFIX}`;
    integrationDbUrl = withDatabaseName(baseDatabaseUrl, integrationDbName);

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

    process.env.DATABASE_URL = integrationDbUrl;
    process.env.DATABASE_PASSWORD = 'test';

    await migrateSchemas(integrationDb);
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
    await resetTables(integrationDb);
  });

  it('preserves calendar domain tables and intent through reconciliation and rerun', async () => {
    await integrationDb('site_settings').insert({
      key: 'plugin:calendar:enabled',
      value: 'false',
      type: 'boolean',
      category: 'plugins',
      description: 'legacy calendar enablement',
      updated_at: new Date(),
    });

    const calendarId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const eventTypeId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const blockId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const bookingId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

    await integrationDb('calendar_collections').insert({
      id: calendarId,
      name: 'Team Calendar',
      slug: 'team',
      description: 'Team planning calendar',
      mode: 'booking',
      is_private: false,
      timezone: 'UTC',
      is_enabled: true,
      embed_title: 'Team Booking',
      owner_user_id: null,
      show_in_main_nav: true,
      show_in_footer_main: false,
      show_in_footer_resources: true,
      include_in_sitemap: true,
      created_at: new Date(),
      updated_at: new Date(),
    });

    await integrationDb('calendar_event_types').insert({
      id: eventTypeId,
      calendar_id: calendarId,
      name: 'Intro Call',
      slug: 'intro-call',
      description: 'Initial conversation',
      duration_minutes: 30,
      buffer_before_minutes: 0,
      buffer_after_minutes: 0,
      location_type: 'custom',
      location_value: 'Video call',
      is_active: true,
      availability_rules: JSON.stringify([]),
      created_at: new Date(),
      updated_at: new Date(),
    });

    await integrationDb('calendar_blocks').insert({
      id: blockId,
      calendar_id: calendarId,
      title: 'Focus Block',
      description: 'Do not book',
      starts_at: new Date(),
      ends_at: new Date(Date.now() + 3600_000),
      is_public: false,
      all_day: false,
      display_color: '#111111',
      external_source: null,
      external_id: null,
      created_at: new Date(),
      updated_at: new Date(),
    });

    await integrationDb('calendar_bookings').insert({
      id: bookingId,
      calendar_id: calendarId,
      event_type_id: eventTypeId,
      starts_at: new Date(Date.now() + 7200_000),
      ends_at: new Date(Date.now() + 9000_000),
      status: 'confirmed',
      name: 'Jane Doe',
      email: 'jane@example.com',
      title: 'Consultation',
      notes: 'Preserve me',
      meeting_url: null,
      source: 'public',
      source_ip: null,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const beforeCounts = {
      collections: Number(
        (await integrationDb('calendar_collections').count<{ count: string }[]>('* as count'))[0]
          ?.count ?? '0'
      ),
      eventTypes: Number(
        (await integrationDb('calendar_event_types').count<{ count: string }[]>('* as count'))[0]
          ?.count ?? '0'
      ),
      blocks: Number(
        (await integrationDb('calendar_blocks').count<{ count: string }[]>('* as count'))[0]
          ?.count ?? '0'
      ),
      bookings: Number(
        (await integrationDb('calendar_bookings').count<{ count: string }[]>('* as count'))[0]
          ?.count ?? '0'
      ),
    };

    const first = await reconcileLegacyAndCanonicalPluginState('calendar', {
      correlationId: 'corr-cal-1',
      db: integrationDb,
    });
    const second = await reconcileLegacyAndCanonicalPluginState('calendar', {
      correlationId: 'corr-cal-2',
      db: integrationDb,
    });

    expect(first.topology).toBe('legacy-only');
    expect(second.topology).toBe('legacy-and-canonical');

    const afterCounts = {
      collections: Number(
        (await integrationDb('calendar_collections').count<{ count: string }[]>('* as count'))[0]
          ?.count ?? '0'
      ),
      eventTypes: Number(
        (await integrationDb('calendar_event_types').count<{ count: string }[]>('* as count'))[0]
          ?.count ?? '0'
      ),
      blocks: Number(
        (await integrationDb('calendar_blocks').count<{ count: string }[]>('* as count'))[0]
          ?.count ?? '0'
      ),
      bookings: Number(
        (await integrationDb('calendar_bookings').count<{ count: string }[]>('* as count'))[0]
          ?.count ?? '0'
      ),
    };

    expect(afterCounts).toEqual(beforeCounts);

    const booking = await integrationDb('calendar_bookings').where({ id: bookingId }).first();
    expect(booking?.email).toBe('jane@example.com');
    expect(booking?.notes).toBe('Preserve me');

    const canonical = await integrationDb('devholm_plugins')
      .where({ plugin_id: 'calendar' })
      .first();
    expect(canonical).toBeTruthy();
    expect(Boolean(canonical?.enabled)).toBe(false);
    expect(canonical?.lifecycle_state).toBe('disabled');
  });
});
