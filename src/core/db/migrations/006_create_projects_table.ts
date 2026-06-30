import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('projects', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.string('title').notNullable();
    table.string('slug').notNullable().unique();
    table.text('description').notNullable();
    table.string('image_url');
    table.string('github_url');
    table.string('live_url');
    table.boolean('is_featured').defaultTo(false);
    table.boolean('is_private').defaultTo(false);
    table.integer('sort_order').defaultTo(0);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // Create project_technologies junction table
  await knex.schema.createTable('project_technologies', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.uuid('project_id').notNullable().references('id').inTable('projects').onDelete('CASCADE');
    table.string('technology').notNullable();
    table.integer('sort_order').defaultTo(0);
    table.unique(['project_id', 'technology']);
  });

  // Create indexes
  await knex.schema.alterTable('projects', (table) => {
    table.index('slug');
    table.index('is_featured');
    table.index('sort_order');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('project_technologies');
  await knex.schema.dropTableIfExists('projects');
}
