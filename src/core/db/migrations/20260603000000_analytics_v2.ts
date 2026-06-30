/**
 * Analytics V2 Migration
 * ======================
 *
 * Enhances the analytics system with:
 * - Composite indexes on analytics_page_views for efficient session/range queries
 * - analytics_sessions table for session-level metrics (bounce rate, depth, entry/exit pages)
 * - analytics_daily_rollups table for fast dashboard summary queries
 */

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add composite indexes to support session-level and time-range queries efficiently
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS analytics_page_views_session_created_idx
    ON analytics_page_views (session_id, created_at)
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS analytics_page_views_created_status_idx
    ON analytics_page_views (created_at, status_code)
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS analytics_page_views_created_bot_idx
    ON analytics_page_views (created_at, is_bot)
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS analytics_page_views_path_created_idx
    ON analytics_page_views (page_path, created_at)
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS analytics_page_views_referrer_created_idx
    ON analytics_page_views (referrer_domain, created_at)
  `);

  // Session summary table — one row per anonymous session.
  // Maintained by recordPageView() going forward. Historical data uses raw page views.
  await knex.schema.createTable('analytics_sessions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('session_id', 64).notNullable().unique();
    table.timestamp('started_at').notNullable();
    table.timestamp('ended_at').notNullable();
    table.string('first_page_path', 500).notNullable();
    table.string('last_page_path', 500).notNullable();
    table.integer('page_views').notNullable().defaultTo(1);
    table.boolean('bounced').notNullable().defaultTo(true);
    table.string('referrer_domain', 253).nullable();
    table.string('utm_source', 100).nullable();
    table.string('utm_medium', 100).nullable();
    table.string('utm_campaign', 100).nullable();
    table.string('device_type', 20).nullable();
    table.string('browser', 50).nullable();
    table.string('os', 50).nullable();
    table.string('country', 2).nullable();
    table.boolean('is_bot').notNullable().defaultTo(false);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.index('started_at');
    table.index('referrer_domain');
  });

  // Daily rollup snapshots for faster top-level summary queries over long date ranges.
  await knex.schema.createTable('analytics_daily_rollups', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.date('date').notNullable().unique();
    table.integer('total_page_views').notNullable().defaultTo(0);
    table.integer('unique_sessions').notNullable().defaultTo(0);
    table.integer('bounced_sessions').notNullable().defaultTo(0);
    table.integer('total_404s').notNullable().defaultTo(0);
    table.integer('total_errors').notNullable().defaultTo(0);
    table.integer('bot_events').notNullable().defaultTo(0);
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.index('date');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('analytics_daily_rollups');
  await knex.schema.dropTableIfExists('analytics_sessions');

  await knex.raw('DROP INDEX IF EXISTS analytics_page_views_referrer_created_idx');
  await knex.raw('DROP INDEX IF EXISTS analytics_page_views_path_created_idx');
  await knex.raw('DROP INDEX IF EXISTS analytics_page_views_created_bot_idx');
  await knex.raw('DROP INDEX IF EXISTS analytics_page_views_created_status_idx');
  await knex.raw('DROP INDEX IF EXISTS analytics_page_views_session_created_idx');
}
