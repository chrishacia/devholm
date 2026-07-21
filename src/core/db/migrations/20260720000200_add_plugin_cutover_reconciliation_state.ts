import type { Knex } from 'knex';

const CUTOVER_STATE_PHASE_ENUM = 'devholm_plugin_cutover_phase';
const CUTOVER_EVENT_RESULT_ENUM = 'devholm_plugin_cutover_event_result';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '${CUTOVER_STATE_PHASE_ENUM}') THEN
        CREATE TYPE ${CUTOVER_STATE_PHASE_ENUM} AS ENUM (
          'not-started',
          'inspected',
          'safe-migration-planned',
          'migration-running',
          'canonical-record-established',
          'settings-data-preserved',
          'lifecycle-state-reconciled',
          'canonical-ownership-activated',
          'legacy-path-decommissioned',
          'cleanup-completed',
          'rollback-pending',
          'recovery-required',
          'manual-intervention-required'
        );
      END IF;
    END
    $$;
  `);

  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '${CUTOVER_EVENT_RESULT_ENUM}') THEN
        CREATE TYPE ${CUTOVER_EVENT_RESULT_ENUM} AS ENUM (
          'applied',
          'noop',
          'blocked',
          'failed'
        );
      END IF;
    END
    $$;
  `);

  await knex.schema.createTable('devholm_plugin_cutover_reconciliation_states', (table) => {
    table.increments('id').primary();
    table.string('plugin_id', 128).notNullable().unique();
    table.specificType('phase', CUTOVER_STATE_PHASE_ENUM).notNullable().defaultTo('not-started');
    table.string('operation_id', 64).nullable();
    table.string('correlation_id', 64).nullable();
    table.string('classification', 128).nullable();
    table.boolean('blocking').notNullable().defaultTo(false);
    table.text('reason').nullable();
    table.json('evidence').nullable();
    table.json('snapshot').nullable();
    table.timestamp('inspected_at').nullable();
    table.timestamp('phase_updated_at').notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.index(['phase']);
    table.index(['blocking']);
    table.index(['phase_updated_at']);
  });

  await knex.schema.createTable('devholm_plugin_cutover_reconciliation_events', (table) => {
    table.increments('id').primary();
    table.string('event_id', 64).notNullable().unique();
    table.string('plugin_id', 128).notNullable();
    table.specificType('phase', CUTOVER_STATE_PHASE_ENUM).notNullable();
    table.specificType('result', CUTOVER_EVENT_RESULT_ENUM).notNullable();
    table.string('operation_id', 64).nullable();
    table.string('correlation_id', 64).nullable();
    table.string('classification', 128).nullable();
    table.boolean('blocking').notNullable().defaultTo(false);
    table.text('reason').nullable();
    table.json('evidence').nullable();
    table.json('snapshot').nullable();
    table.timestamp('timestamp').notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.index(['plugin_id', 'timestamp']);
    table.index(['phase', 'timestamp']);
    table.index(['result', 'timestamp']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('devholm_plugin_cutover_reconciliation_events');
  await knex.schema.dropTableIfExists('devholm_plugin_cutover_reconciliation_states');

  await knex.raw(`DROP TYPE IF EXISTS ${CUTOVER_EVENT_RESULT_ENUM}`);
  await knex.raw(`DROP TYPE IF EXISTS ${CUTOVER_STATE_PHASE_ENUM}`);
}
