/** @vitest-environment node */

import path from 'node:path';
import knex, { type Knex } from 'knex';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { reconcileLegacyAndCanonicalPluginState } from '@core/lib/plugin-cutover-legacy-reconciler.server';
import { up as setupUrlShortenerSchema } from '@user/extensions/plugins/url-shortener/db/migrations/20260701010000_url_shortener_foundation';

const TEST_DB_SUFFIX = `_cutover_url_shortener_preserve_${process.pid}`;
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
      'plugin-cutover-url-shortener-preservation-postgres.integration.test requires PHASE2_TEST_DATABASE_URL or DATABASE_URL'
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
  await db('devholm_plugins').where({ plugin_id: 'url-shortener' }).del();
  await db('site_settings').where('key', 'like', 'plugin:url-shortener:%').del();

  await db('u_url_shortener_daily_stats').del();
  await db('u_url_shortener_click_events').del();
  await db('u_url_shortener_public_submissions').del();
  await db('u_url_shortener_audit_records').del();
  await db('u_url_shortener_prefix_aliases').del();
  await db('u_url_shortener_links').del();
}

postgresDescribe('plugin cutover URL Shortener preservation (postgres integration)', () => {
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
    await setupUrlShortenerSchema(integrationDb);
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

  it('preserves URL shortener data/settings and intent through legacy-only reconciliation and rerun', async () => {
    await integrationDb('site_settings').insert({
      key: 'plugin:url-shortener:enabled',
      value: 'true',
      type: 'boolean',
      category: 'plugins',
      description: 'legacy enabled setting',
      updated_at: new Date(),
    });

    const linkId = '11111111-1111-4111-8111-111111111111';
    await integrationDb('u_url_shortener_links').insert({
      id: linkId,
      code: 'hello-world',
      destination_url: 'https://example.com/landing',
      title: 'Hello',
      is_active: true,
      redirect_status_code: 302,
      cached_click_count: 2,
      created_at: new Date(),
      updated_at: new Date(),
    });

    await integrationDb('u_url_shortener_click_events').insert({
      id: '22222222-2222-4222-8222-222222222222',
      link_id: linkId,
      clicked_at: new Date(),
    });

    await integrationDb('u_url_shortener_daily_stats').insert({
      id: '33333333-3333-4333-8333-333333333333',
      link_id: linkId,
      stat_date: new Date().toISOString().slice(0, 10),
      total_clicks: 2,
      unique_clicks_approx: 1,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const beforeCounts = {
      links: Number(
        (await integrationDb('u_url_shortener_links').count<{ count: string }[]>('* as count'))[0]
          ?.count ?? '0'
      ),
      clicks: Number(
        (
          await integrationDb('u_url_shortener_click_events').count<{ count: string }[]>(
            '* as count'
          )
        )[0]?.count ?? '0'
      ),
      daily: Number(
        (
          await integrationDb('u_url_shortener_daily_stats').count<{ count: string }[]>(
            '* as count'
          )
        )[0]?.count ?? '0'
      ),
    };

    const first = await reconcileLegacyAndCanonicalPluginState('url-shortener', {
      correlationId: 'corr-us-1',
      db: integrationDb,
    });
    const second = await reconcileLegacyAndCanonicalPluginState('url-shortener', {
      correlationId: 'corr-us-2',
      db: integrationDb,
    });

    expect(first.topology).toBe('legacy-only');
    expect(second.topology).toBe('legacy-and-canonical');

    const afterCounts = {
      links: Number(
        (await integrationDb('u_url_shortener_links').count<{ count: string }[]>('* as count'))[0]
          ?.count ?? '0'
      ),
      clicks: Number(
        (
          await integrationDb('u_url_shortener_click_events').count<{ count: string }[]>(
            '* as count'
          )
        )[0]?.count ?? '0'
      ),
      daily: Number(
        (
          await integrationDb('u_url_shortener_daily_stats').count<{ count: string }[]>(
            '* as count'
          )
        )[0]?.count ?? '0'
      ),
    };

    expect(afterCounts).toEqual(beforeCounts);

    const link = await integrationDb('u_url_shortener_links').where({ id: linkId }).first();
    expect(link?.code).toBe('hello-world');
    expect(link?.destination_url).toBe('https://example.com/landing');

    const canonical = await integrationDb('devholm_plugins')
      .where({ plugin_id: 'url-shortener' })
      .first();
    expect(canonical).toBeTruthy();
    expect(Boolean(canonical?.enabled)).toBe(true);
    expect(canonical?.lifecycle_state).toBe('installed');
  });
});
