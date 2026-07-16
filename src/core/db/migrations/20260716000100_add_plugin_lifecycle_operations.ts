import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('devholm_plugin_lifecycle_operations', (table) => {
    table.increments('id').primary();
    table.string('operation_id', 64).notNullable().unique();
    table.string('plugin_id', 128).notNullable();
    table.string('action', 32).notNullable();
    table.string('status', 32).notNullable();
    table.string('actor', 255).nullable();
    table.string('correlation_id', 64).notNullable();
    table.string('current_phase', 32).notNullable();
    table.timestamp('started_at').notNullable();
    table.timestamp('updated_at').notNullable();
    table.timestamp('finished_at').nullable();
    table.integer('attempt_count').notNullable().defaultTo(1);
    table.json('prior_state_snapshot').nullable();
    table.json('next_state_snapshot').nullable();
    table.string('error_code', 128).nullable();
    table.text('public_message').nullable();
    table.text('internal_diagnostic').nullable();
    table.boolean('retryable').notNullable().defaultTo(false);
    table.string('recovery_classification', 64).nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.index(['plugin_id', 'updated_at']);
    table.index(['plugin_id', 'started_at']);
    table.foreign('plugin_id').references('devholm_plugins.plugin_id').onDelete('CASCADE');
  });

  await knex.schema.createTable('devholm_plugin_lifecycle_events', (table) => {
    table.increments('id').primary();
    table.string('event_id', 64).notNullable().unique();
    table.string('operation_id', 64).notNullable();
    table.string('plugin_id', 128).notNullable();
    table.string('schema_version', 16).notNullable().defaultTo('1');
    table.string('transition', 32).notNullable();
    table.string('result', 32).notNullable();
    table.string('actor', 255).nullable();
    table.string('correlation_id', 64).notNullable();
    table.timestamp('timestamp').notNullable();
    table.json('previous_state').nullable();
    table.json('next_state').nullable();
    table.string('desired_state', 64).nullable();
    table.json('build_reference').nullable();
    table.json('deployment_reference').nullable();
    table.string('plugin_version', 64).nullable();
    table.string('artifact_digest', 128).nullable();
    table.string('error_code', 128).nullable();
    table.text('public_message').nullable();
    table.text('internal_diagnostic').nullable();
    table.boolean('retryable').notNullable().defaultTo(false);
    table.string('recovery_classification', 64).nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.index(['plugin_id', 'timestamp']);
    table.index(['operation_id', 'timestamp']);
    table.foreign('plugin_id').references('devholm_plugins.plugin_id').onDelete('CASCADE');
    table
      .foreign('operation_id')
      .references('devholm_plugin_lifecycle_operations.operation_id')
      .onDelete('CASCADE');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('devholm_plugin_lifecycle_events');
  await knex.schema.dropTableIfExists('devholm_plugin_lifecycle_operations');
}
