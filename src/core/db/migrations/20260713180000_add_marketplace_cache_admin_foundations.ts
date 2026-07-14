import type { Knex } from 'knex';

const ACTIVE_PIN_UNIQUE_INDEX = 'plugin_marketplace_cache_pins_active_reason_owner_unique';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('plugin_marketplace_cache_policy', (table) => {
    table.increments('id').primary();
    table.integer('policy_version').notNullable();
    table.text('policy_json').notNullable();
    table.string('created_by', 255).nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.index(['policy_version', 'created_at']);
  });

  await knex.schema.createTable('plugin_marketplace_cache_entries', (table) => {
    table.string('cache_key', 64).primary();
    table.string('plugin_id', 128).nullable();
    table.string('plugin_version', 64).nullable();
    table.text('artifact_url').nullable();
    table.string('approved_host', 255).nullable();
    table.string('source', 16).notNullable().defaultTo('cache');
    table.bigint('size_bytes').notNullable().defaultTo(0);
    table.timestamp('first_cached_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('last_accessed_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('last_verified_at').nullable();
    table.integer('access_count').notNullable().defaultTo(0);
    table.integer('hit_count').notNullable().defaultTo(0);
    table.integer('network_write_count').notNullable().defaultTo(0);
    table.string('integrity_state', 32).notNullable().defaultTo('unknown');
    table.integer('integrity_failures').notNullable().defaultTo(0);
    table.string('last_warning_code', 64).nullable();
    table.text('last_warning_detail').nullable();
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.index('last_accessed_at');
    table.index('size_bytes');
    table.index('plugin_id');
  });

  await knex.schema.createTable('plugin_marketplace_cache_pins', (table) => {
    table.increments('id').primary();
    table.string('cache_key', 64).notNullable();
    table.string('reason_code', 64).notNullable();
    table.text('reason_detail').nullable();
    table.string('owner_type', 32).notNullable().defaultTo('system');
    table.string('owner_id', 255).nullable();
    table.string('created_by', 255).nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('released_at').nullable();
    table.string('release_reason_code', 64).nullable();
    table.text('release_reason_detail').nullable();

    table.index(['cache_key', 'released_at']);
    table.index(['owner_type', 'owner_id']);
    table
      .foreign('cache_key')
      .references('plugin_marketplace_cache_entries.cache_key')
      .onDelete('CASCADE');
  });

  await knex.raw(
    `CREATE UNIQUE INDEX ${ACTIVE_PIN_UNIQUE_INDEX} ON plugin_marketplace_cache_pins (cache_key, reason_code, owner_type, COALESCE(owner_id, '')) WHERE released_at IS NULL`
  );

  await knex.schema.createTable('plugin_marketplace_cache_mirrors', (table) => {
    table.increments('id').primary();
    table.string('mirror_id', 64).notNullable().unique();
    table.text('base_url').notNullable();
    table.boolean('enabled').notNullable().defaultTo(true);
    table.integer('priority').notNullable().defaultTo(100);
    table.string('auth_type', 32).notNullable().defaultTo('none');
    table.string('auth_secret_ref', 255).nullable();
    table.text('auth_secret_value').nullable();
    table.text('auth_headers_json').nullable();
    table.string('health_state', 32).notNullable().defaultTo('unknown');
    table.timestamp('last_checked_at').nullable();
    table.timestamp('last_success_at').nullable();
    table.timestamp('last_failure_at').nullable();
    table.integer('failure_count').notNullable().defaultTo(0);
    table.integer('last_status_code').nullable();
    table.text('last_error').nullable();
    table.text('metadata_json').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.index(['enabled', 'priority']);
    table.index('health_state');
  });

  await knex.schema.createTable('plugin_marketplace_cache_audit_runs', (table) => {
    table.string('run_id', 64).primary();
    table.string('status', 16).notNullable().defaultTo('running');
    table.string('started_by', 255).nullable();
    table.timestamp('started_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('completed_at').nullable();
    table.integer('scanned_entries').notNullable().defaultTo(0);
    table.integer('findings_total').notNullable().defaultTo(0);
    table.integer('findings_corrupt').notNullable().defaultTo(0);
    table.integer('findings_missing').notNullable().defaultTo(0);
    table.integer('findings_stale').notNullable().defaultTo(0);
    table.boolean('degraded').notNullable().defaultTo(false);
    table.text('summary_json').nullable();
    table.text('notes').nullable();

    table.index('started_at');
    table.index('status');
  });

  await knex.schema.createTable('plugin_marketplace_cache_cleanup_runs', (table) => {
    table.string('run_id', 64).primary();
    table.string('mode', 16).notNullable();
    table.string('status', 16).notNullable().defaultTo('running');
    table.string('triggered_by', 255).nullable();
    table.integer('policy_version').notNullable();
    table.timestamp('started_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('completed_at').nullable();
    table.integer('total_entries').notNullable().defaultTo(0);
    table.bigint('total_bytes').notNullable().defaultTo(0);
    table.integer('evictable_entries').notNullable().defaultTo(0);
    table.bigint('evictable_bytes').notNullable().defaultTo(0);
    table.integer('planned_entries').notNullable().defaultTo(0);
    table.bigint('planned_bytes').notNullable().defaultTo(0);
    table.integer('evicted_entries').notNullable().defaultTo(0);
    table.bigint('evicted_bytes').notNullable().defaultTo(0);
    table.boolean('degraded').notNullable().defaultTo(false);
    table.text('reason_codes_json').nullable();
    table.text('plan_json').nullable();
    table.text('error_summary').nullable();

    table.index('started_at');
    table.index(['mode', 'status']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('plugin_marketplace_cache_cleanup_runs');
  await knex.schema.dropTableIfExists('plugin_marketplace_cache_audit_runs');
  await knex.schema.dropTableIfExists('plugin_marketplace_cache_mirrors');

  await knex.raw(`DROP INDEX IF EXISTS ${ACTIVE_PIN_UNIQUE_INDEX}`);
  await knex.schema.dropTableIfExists('plugin_marketplace_cache_pins');
  await knex.schema.dropTableIfExists('plugin_marketplace_cache_entries');
  await knex.schema.dropTableIfExists('plugin_marketplace_cache_policy');
}
