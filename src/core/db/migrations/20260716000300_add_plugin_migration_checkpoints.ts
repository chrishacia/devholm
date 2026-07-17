import type { Knex } from 'knex';

const CHECKPOINT_UNIQUE_INDEX =
  'devholm_plugin_migration_checkpoints_operation_plugin_migration_attempt_uq';
const CHECKPOINT_RUNNING_INDEX =
  'devholm_plugin_migration_checkpoints_operation_plugin_migration_running_uq';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('devholm_plugin_migration_checkpoints', (table) => {
    table.increments('id').primary();
    table.string('checkpoint_id', 64).notNullable().unique();
    table.string('operation_id', 64).notNullable();
    table.string('plugin_id', 128).notNullable();
    table.string('plugin_version', 64).notNullable();
    table.string('migration_id', 255).notNullable();
    table.string('direction', 16).notNullable();
    table.string('status', 32).notNullable();
    table.integer('attempt_count').notNullable().defaultTo(1);
    table.boolean('irreversible').notNullable().defaultTo(false);
    table.string('checksum', 128).nullable();
    table.timestamp('started_at').notNullable();
    table.timestamp('completed_at').nullable();
    table.string('error_code', 128).nullable();
    table.text('public_message').nullable();
    table.text('internal_diagnostic').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.foreign('operation_id').references('devholm_plugin_lifecycle_operations.operation_id');
    table.foreign('plugin_id').references('devholm_plugins.plugin_id').onDelete('CASCADE');

    table.index(['plugin_id', 'status', 'started_at']);
    table.index(['plugin_id', 'migration_id', 'direction', 'attempt_count']);
  });

  await knex.raw(
    `CREATE UNIQUE INDEX IF NOT EXISTS ${CHECKPOINT_UNIQUE_INDEX}
     ON devholm_plugin_migration_checkpoints
     (operation_id, plugin_id, migration_id, direction, attempt_count)`
  );

  await knex.raw(
    `CREATE UNIQUE INDEX IF NOT EXISTS ${CHECKPOINT_RUNNING_INDEX}
     ON devholm_plugin_migration_checkpoints
     (operation_id, plugin_id, migration_id, direction)
     WHERE status = 'running'`
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS ${CHECKPOINT_RUNNING_INDEX}`);
  await knex.raw(`DROP INDEX IF EXISTS ${CHECKPOINT_UNIQUE_INDEX}`);
  await knex.schema.dropTableIfExists('devholm_plugin_migration_checkpoints');
}
