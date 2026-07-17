import type { Knex } from 'knex';

const IDEMPOTENCY_INDEX = 'devholm_plugin_lifecycle_operations_plugin_id_idempotency_key_uq';
const ACTIVE_OPERATION_INDEX = 'devholm_plugin_lifecycle_operations_plugin_id_active_uq';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('devholm_plugin_lifecycle_operations', (table) => {
    table.integer('schema_version').notNullable().defaultTo(1);
    table.string('idempotency_key', 255).nullable();
    table.string('lease_owner', 255).nullable();
    table.timestamp('lease_expires_at').nullable();
    table.string('expected_lifecycle_state', 64).nullable();
    table.json('authorization_context').nullable();
    table.string('mutation_authority_version', 32).notNullable().defaultTo('v1');
  });

  await knex.raw(
    `CREATE UNIQUE INDEX IF NOT EXISTS ${IDEMPOTENCY_INDEX}
     ON devholm_plugin_lifecycle_operations (plugin_id, idempotency_key)
     WHERE idempotency_key IS NOT NULL`
  );

  await knex.raw(
    `CREATE UNIQUE INDEX IF NOT EXISTS ${ACTIVE_OPERATION_INDEX}
     ON devholm_plugin_lifecycle_operations (plugin_id)
     WHERE status IN ('requested', 'running')`
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS ${ACTIVE_OPERATION_INDEX}`);
  await knex.raw(`DROP INDEX IF EXISTS ${IDEMPOTENCY_INDEX}`);

  await knex.schema.alterTable('devholm_plugin_lifecycle_operations', (table) => {
    table.dropColumn('schema_version');
    table.dropColumn('idempotency_key');
    table.dropColumn('lease_owner');
    table.dropColumn('lease_expires_at');
    table.dropColumn('expected_lifecycle_state');
    table.dropColumn('authorization_context');
    table.dropColumn('mutation_authority_version');
  });
}
