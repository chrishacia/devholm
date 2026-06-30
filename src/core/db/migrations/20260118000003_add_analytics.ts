/**
 * Analytics Tables Migration
 * ==========================
 *
 * Tracks page views and referrer information for traffic analysis.
 * Privacy-focused: No PII, no IP addresses stored, just aggregated metrics.
 */

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Page views table - stores individual page view events
  await knex.schema.createTable('analytics_page_views', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('session_id', 64).notNullable(); // Anonymous session identifier
    table.string('page_path', 500).notNullable(); // The page that was visited
    table.string('page_title', 300).nullable(); // Page title if available
    table.string('referrer_url', 2000).nullable(); // Full referrer URL
    table.string('referrer_domain', 253).nullable(); // Extracted domain from referrer
    table.string('utm_source', 100).nullable(); // UTM source parameter
    table.string('utm_medium', 100).nullable(); // UTM medium parameter
    table.string('utm_campaign', 100).nullable(); // UTM campaign parameter
    table.string('utm_term', 100).nullable(); // UTM term parameter
    table.string('utm_content', 100).nullable(); // UTM content parameter
    table.string('device_type', 20).nullable(); // desktop, mobile, tablet
    table.string('browser', 50).nullable(); // Browser name
    table.string('os', 50).nullable(); // Operating system
    table.string('country', 2).nullable(); // Country code (from Accept-Language or Cloudflare header)
    table.boolean('is_bot').defaultTo(false); // Whether this is a bot visit
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    // Indexes for efficient querying
    table.index('session_id');
    table.index('page_path');
    table.index('referrer_domain');
    table.index('created_at');
    table.index(['utm_source', 'utm_medium', 'utm_campaign']);
  });

  // Daily aggregated stats for faster dashboard queries
  await knex.schema.createTable('analytics_daily_stats', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.date('date').notNullable();
    table.string('page_path', 500).notNullable();
    table.string('referrer_domain', 253).nullable();
    table.integer('page_views').notNullable().defaultTo(0);
    table.integer('unique_visitors').notNullable().defaultTo(0);
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    // Unique constraint for upsert operations
    table.unique(['date', 'page_path', 'referrer_domain']);
    table.index('date');
    table.index('page_path');
    table.index('referrer_domain');
  });

  // Top referrers aggregated table
  await knex.schema.createTable('analytics_referrers', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('referrer_domain', 253).notNullable().unique();
    table.string('referrer_url_sample', 2000).nullable(); // Sample URL for context
    table.integer('total_visits').notNullable().defaultTo(0);
    table.integer('unique_visitors').notNullable().defaultTo(0);
    table.timestamp('first_seen_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('last_seen_at').notNullable().defaultTo(knex.fn.now());

    table.index('total_visits');
    table.index('last_seen_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('analytics_referrers');
  await knex.schema.dropTableIfExists('analytics_daily_stats');
  await knex.schema.dropTableIfExists('analytics_page_views');
}
