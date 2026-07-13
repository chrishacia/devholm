import type { Knex } from 'knex';

const UNIQUE_INDEX_NAME = 'devholm_plugin_migrations_plugin_id_migration_id_unique';
const UNIQUE_INDEX_V2_NAME = 'devholm_plugin_migrations_plugin_id_migration_id_direction_unique';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('devholm_plugin_migrations', (table) => {
    table.string('direction', 16).notNullable().defaultTo('up');
    table.string('operation_id', 64).nullable();
    table.string('execution_id', 64).nullable();
    table.string('source_version', 64).nullable();
    table.string('target_version', 64).nullable();
    table.string('artifact_identity', 255).nullable();
    table.string('assigned_schema', 128).nullable();
    table.string('state', 32).notNullable().defaultTo('succeeded');
    table.timestamp('started_at').nullable();
    table.timestamp('completed_at').nullable();
    table.string('rollback_of_execution_id', 64).nullable();
    table.string('error_category', 64).nullable();
  });

  await knex.raw(
    `ALTER TABLE devholm_plugin_migrations DROP CONSTRAINT IF EXISTS ${UNIQUE_INDEX_NAME}`
  );
  await knex.schema.alterTable('devholm_plugin_migrations', (table) => {
    table.unique(['plugin_id', 'migration_id', 'direction'], {
      indexName: UNIQUE_INDEX_V2_NAME,
    });
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(
    `ALTER TABLE devholm_plugin_migrations DROP CONSTRAINT IF EXISTS ${UNIQUE_INDEX_V2_NAME}`
  );

  await knex.schema.alterTable('devholm_plugin_migrations', (table) => {
    table.unique(['plugin_id', 'migration_id'], {
      indexName: UNIQUE_INDEX_NAME,
    });

    table.dropColumn('direction');
    table.dropColumn('operation_id');
    table.dropColumn('execution_id');
    table.dropColumn('source_version');
    table.dropColumn('target_version');
    table.dropColumn('artifact_identity');
    table.dropColumn('assigned_schema');
    table.dropColumn('state');
    table.dropColumn('started_at');
    table.dropColumn('completed_at');
    table.dropColumn('rollback_of_execution_id');
    table.dropColumn('error_category');
  });
}
