import type { Knex } from 'knex';

const ROLLBACK_STAGE_ENUM = 'devholm_plugin_cutover_rollback_stage';
const ROLLBACK_STATUS_ENUM = 'devholm_plugin_cutover_rollback_status';
const ROLLBACK_UNIQUE_INDEX = 'devholm_plugin_cutover_rollback_checkpoints_plugin_stage_attempt_uq';
const ROLLBACK_RUNNING_INDEX =
  'devholm_plugin_cutover_rollback_checkpoints_plugin_stage_running_uq';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '${ROLLBACK_STAGE_ENUM}') THEN
        CREATE TYPE ${ROLLBACK_STAGE_ENUM} AS ENUM (
          'before-canonical-lifecycle-creation',
          'after-canonical-lifecycle-creation',
          'after-enabled-settings-reconciliation',
          'before-legacy-decommission',
          'after-legacy-decommission-initiation'
        );
      END IF;
    END
    $$;
  `);

  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '${ROLLBACK_STATUS_ENUM}') THEN
        CREATE TYPE ${ROLLBACK_STATUS_ENUM} AS ENUM (
          'pending',
          'running',
          'succeeded',
          'failed',
          'unavailable'
        );
      END IF;
    END
    $$;
  `);

  await knex.schema.createTable('devholm_plugin_cutover_rollback_checkpoints', (table) => {
    table.increments('id').primary();
    table.string('checkpoint_id', 64).notNullable().unique();
    table.string('plugin_id', 128).notNullable();
    table.specificType('stage', ROLLBACK_STAGE_ENUM).notNullable();
    table.specificType('status', ROLLBACK_STATUS_ENUM).notNullable();
    table.integer('attempt_count').notNullable().defaultTo(1);
    table.boolean('rollback_eligible').notNullable().defaultTo(true);
    table.boolean('irreversible_boundary').notNullable().defaultTo(false);
    table.string('operation_id', 64).nullable();
    table.string('correlation_id', 64).nullable();
    table.text('reason').nullable();
    table.json('evidence').nullable();
    table.timestamp('started_at').notNullable();
    table.timestamp('completed_at').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.index(['plugin_id', 'stage', 'status']);
    table.index(['plugin_id', 'started_at']);
  });

  await knex.raw(
    `CREATE UNIQUE INDEX IF NOT EXISTS ${ROLLBACK_UNIQUE_INDEX}
     ON devholm_plugin_cutover_rollback_checkpoints
     (plugin_id, stage, attempt_count)`
  );

  await knex.raw(
    `CREATE UNIQUE INDEX IF NOT EXISTS ${ROLLBACK_RUNNING_INDEX}
     ON devholm_plugin_cutover_rollback_checkpoints
     (plugin_id, stage)
     WHERE status = 'running'`
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS ${ROLLBACK_RUNNING_INDEX}`);
  await knex.raw(`DROP INDEX IF EXISTS ${ROLLBACK_UNIQUE_INDEX}`);
  await knex.schema.dropTableIfExists('devholm_plugin_cutover_rollback_checkpoints');

  await knex.raw(`DROP TYPE IF EXISTS ${ROLLBACK_STATUS_ENUM}`);
  await knex.raw(`DROP TYPE IF EXISTS ${ROLLBACK_STAGE_ENUM}`);
}
