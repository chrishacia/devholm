import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('devholm_plugins', (table) => {
    table.string('plugin_id', 128).primary();
    table.string('installed_version', 64).notNullable();
    table.boolean('enabled').notNullable().defaultTo(false);
    table
      .enu(
        'lifecycle_state',
        ['pending_install', 'installed', 'enabled', 'disabled', 'uninstalled', 'error'],
        {
          useNative: true,
          enumName: 'devholm_plugin_lifecycle_state',
        }
      )
      .notNullable()
      .defaultTo('pending_install');
    table.timestamp('installed_at').nullable();
    table.timestamp('upgraded_at').nullable();
    table.timestamp('disabled_at').nullable();
    table.text('last_error').nullable();
    table.string('manifest_checksum', 128).nullable();
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('devholm_plugin_migrations', (table) => {
    table.increments('id').primary();
    table.string('plugin_id', 128).notNullable();
    table.string('migration_id', 255).notNullable();
    table.string('plugin_version', 64).notNullable();
    table.string('checksum', 128).notNullable();
    table.timestamp('applied_at').notNullable();
    table.integer('execution_duration_ms').notNullable().defaultTo(0);
    table.integer('batch_order').notNullable().defaultTo(0);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.unique(['plugin_id', 'migration_id']);
    table.index(['plugin_id', 'applied_at']);
    table.foreign('plugin_id').references('devholm_plugins.plugin_id').onDelete('CASCADE');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('devholm_plugin_migrations');
  await knex.schema.dropTableIfExists('devholm_plugins');
  await knex.raw('DROP TYPE IF EXISTS devholm_plugin_lifecycle_state');
}
