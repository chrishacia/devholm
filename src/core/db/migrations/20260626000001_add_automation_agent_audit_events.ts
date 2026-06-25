import type { Knex } from 'knex';

const TABLE = 'automation_agent_audit_events';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(TABLE, (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.string('route', 200).notNullable();
    table.string('method', 10).notNullable();
    table.string('action', 100).notNullable();
    table.integer('status_code').notNullable();
    table.boolean('success').notNullable().defaultTo(false);
    table.string('client_ip', 64);
    table.jsonb('details');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.index(['created_at']);
    table.index(['action', 'created_at']);
    table.index(['success', 'created_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TABLE);
}
