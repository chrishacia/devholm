import type { Knex } from 'knex';

const LINKS = 'u_url_shortener_links';
const CLICKS = 'u_url_shortener_click_events';
const DAILY = 'u_url_shortener_daily_stats';
const SUBMISSIONS = 'u_url_shortener_public_submissions';
const AUDIT = 'u_url_shortener_audit_records';
const PREFIX_ALIASES = 'u_url_shortener_prefix_aliases';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(LINKS, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('code', 64).notNullable().unique();
    table.text('destination_url').notNullable();
    table.string('title', 255).nullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('expires_at').nullable();
    table.smallint('redirect_status_code').notNullable().defaultTo(302);
    table.string('creator_type', 32).nullable();
    table.string('creator_id', 255).nullable();
    table.string('creator_label', 255).nullable();
    table.uuid('source_submission_id').nullable();
    table.bigInteger('cached_click_count').notNullable().defaultTo(0);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('deleted_at').nullable();
  });

  await knex.schema.createTable(CLICKS, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('link_id').notNullable().references('id').inTable(LINKS).onDelete('CASCADE');
    table.timestamp('clicked_at').notNullable().defaultTo(knex.fn.now());
    table.string('referrer_domain', 255).nullable();
    table.string('referrer_category', 64).nullable();
    table.string('user_agent_category', 64).nullable();
    table.string('device_category', 64).nullable();
    table.string('browser_category', 64).nullable();
    table.string('country_code', 8).nullable();
    table.string('region_code', 32).nullable();
    table.string('privacy_hash', 128).nullable();
    table.string('request_id', 255).nullable();

    table.index(['link_id', 'clicked_at']);
  });

  await knex.schema.createTable(DAILY, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('link_id').notNullable().references('id').inTable(LINKS).onDelete('CASCADE');
    table.date('stat_date').notNullable();
    table.integer('total_clicks').notNullable().defaultTo(0);
    table.integer('unique_clicks_approx').notNullable().defaultTo(0);
    table.string('referrer_category', 64).nullable();
    table.string('device_category', 64).nullable();
    table.string('browser_category', 64).nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.unique([
      'link_id',
      'stat_date',
      'referrer_category',
      'device_category',
      'browser_category',
    ]);
  });

  await knex.schema.createTable(SUBMISSIONS, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.text('requested_destination').notNullable();
    table.string('requested_code', 64).nullable();
    table.string('requester_type', 32).nullable();
    table.string('requester_id', 255).nullable();
    table.string('requester_label', 255).nullable();
    table
      .enu('status', ['pending', 'approved', 'rejected'], {
        useNative: true,
        enumName: 'u_url_shortener_submission_status',
      })
      .notNullable()
      .defaultTo('pending');
    table.text('review_notes').nullable();
    table.timestamp('approved_at').nullable();
    table.timestamp('rejected_at').nullable();
    table.uuid('result_link_id').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.alterTable(LINKS, (table) => {
    table
      .foreign('source_submission_id')
      .references('id')
      .inTable(SUBMISSIONS)
      .onDelete('SET NULL');
  });

  await knex.schema.alterTable(SUBMISSIONS, (table) => {
    table.foreign('result_link_id').references('id').inTable(LINKS).onDelete('SET NULL');
  });

  await knex.schema.createTable(AUDIT, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('action_type', 128).notNullable();
    table.string('target_type', 128).notNullable();
    table.string('target_id', 255).nullable();
    table.string('actor_type', 32).nullable();
    table.string('actor_id', 255).nullable();
    table.string('actor_label', 255).nullable();
    table.jsonb('before_state').nullable();
    table.jsonb('after_state').nullable();
    table.string('request_id', 255).nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.index(['target_type', 'target_id']);
  });

  await knex.schema.createTable(PREFIX_ALIASES, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('prefix', 64).notNullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('starts_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('ends_at').nullable();
    table.text('creation_reason').nullable();
    table.string('audit_reference', 255).nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.unique(['prefix']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(PREFIX_ALIASES);
  await knex.schema.dropTableIfExists(AUDIT);
  await knex.schema.dropTableIfExists(SUBMISSIONS);
  await knex.schema.dropTableIfExists(DAILY);
  await knex.schema.dropTableIfExists(CLICKS);
  await knex.schema.dropTableIfExists(LINKS);
  await knex.raw('DROP TYPE IF EXISTS u_url_shortener_submission_status');
}
