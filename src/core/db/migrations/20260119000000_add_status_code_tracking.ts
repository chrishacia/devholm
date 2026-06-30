/**
 * Add Status Code Tracking
 * ========================
 *
 * Adds status_code field to track 404s and other HTTP status codes.
 */

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add status_code column to analytics_page_views
  await knex.schema.alterTable('analytics_page_views', (table) => {
    table.smallint('status_code').nullable().defaultTo(200);
  });

  // Add index for querying 404s
  await knex.schema.alterTable('analytics_page_views', (table) => {
    table.index('status_code');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('analytics_page_views', (table) => {
    table.dropIndex('status_code');
    table.dropColumn('status_code');
  });
}
