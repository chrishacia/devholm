import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  /**
   * plugin_lockfile - tracks exact locked versions of all installed plugins
   * This is the source of truth for reproducible plugin state
   */
  await knex.schema.createTable('plugin_lockfile', (table) => {
    table.increments('id').primary();
    table.string('plugin_id', 128).notNullable().unique();
    table.string('version', 64).notNullable();
    table.string('devholm_version', 64).notNullable();
    table.string('lockfile_checksum', 128).notNullable();
    table.text('package_source').notNullable(); // JSON serialized PluginPackageSource

    // Integrity data
    table.string('package_checksum', 128).notNullable();
    table.string('manifest_checksum', 128).notNullable();
    table.text('migration_checksums').notNullable(); // JSON object of migration_id -> checksum

    // Audit trail
    table.string('locked_by', 255).nullable();
    table.timestamp('locked_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.index('plugin_id');
    table.index('updated_at');
    table.foreign('plugin_id').references('devholm_plugins.plugin_id').onDelete('CASCADE');
  });

  /**
   * plugin_update_pins - user-selectable version pinning and update policies
   */
  await knex.schema.createTable('plugin_update_pins', (table) => {
    table.string('plugin_id', 128).primary();
    table.string('exact_version', 64).nullable();
    table.string('compatible_range', 64).nullable();
    table
      .enu('channel', ['stable', 'beta', 'alpha'], {
        useNative: true,
        enumName: 'plugin_update_channel',
      })
      .nullable();
    table
      .enu('policy', ['manual', 'stable', 'beta'], {
        useNative: true,
        enumName: 'plugin_update_policy',
      })
      .notNullable()
      .defaultTo('manual');

    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.foreign('plugin_id').references('devholm_plugins.plugin_id').onDelete('CASCADE');
  });

  /**
   * plugin_update_history - tracks all version updates for rollback capability
   */
  await knex.schema.createTable('plugin_update_history', (table) => {
    table.increments('id').primary();
    table.string('plugin_id', 128).notNullable();
    table.string('from_version', 64).notNullable();
    table.string('to_version', 64).notNullable();
    table
      .enu('status', ['success', 'failed', 'rolled_back'], {
        useNative: true,
        enumName: 'plugin_update_status',
      })
      .notNullable()
      .defaultTo('success');

    // Audit
    table.string('applied_by', 255).nullable();
    table.timestamp('applied_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('rollback_available_until').nullable();

    // Last checkpoint for staged activation
    table.text('last_checkpoint').nullable(); // JSON serialized PluginActivationCheckpoint

    table.index('plugin_id');
    table.index('applied_at');
    table.index(['plugin_id', 'status']);
    table.foreign('plugin_id').references('devholm_plugins.plugin_id').onDelete('CASCADE');
  });

  /**
   * plugin_packages - metadata for available plugin packages
   * Can be used for caching remote package info or tracking marketplace
   */
  await knex.schema.createTable('plugin_packages', (table) => {
    table.increments('id').primary();
    table.string('plugin_id', 128).notNullable();
    table.string('version', 64).notNullable();
    table.string('devholm_compat_range', 64).nullable();
    table
      .enu('release_channel', ['stable', 'beta', 'alpha'], {
        useNative: true,
        enumName: 'package_release_channel',
      })
      .notNullable()
      .defaultTo('stable');

    // Package metadata
    table.text('package_source').notNullable(); // JSON serialized PluginPackageSource
    table.string('package_checksum', 128).notNullable();
    table.string('manifest_checksum', 128).notNullable();
    table.text('dependencies').nullable(); // JSON object

    // Optional marketplace data
    table.string('publisher_id', 255).nullable();
    table.string('publisher_signature', 1024).nullable();

    // Lifecycle
    table.string('published_by', 255).nullable();
    table.timestamp('published_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('yanked_at').nullable(); // For release revocation

    table.unique(['plugin_id', 'version']);
    table.index('plugin_id');
    table.index(['plugin_id', 'release_channel']);
    table.index('published_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('plugin_packages');
  await knex.schema.dropTableIfExists('plugin_update_history');
  await knex.schema.dropTableIfExists('plugin_update_pins');
  await knex.schema.dropTableIfExists('plugin_lockfile');

  await knex.raw('DROP TYPE IF EXISTS package_release_channel');
  await knex.raw('DROP TYPE IF EXISTS plugin_update_status');
  await knex.raw('DROP TYPE IF EXISTS plugin_update_policy');
  await knex.raw('DROP TYPE IF EXISTS plugin_update_channel');
}
