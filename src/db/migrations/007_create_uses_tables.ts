import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create uses_categories table
  await knex.schema.createTable('uses_categories', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.string('title').notNullable();
    table.string('icon').notNullable().defaultTo('Build'); // MUI icon name
    table.integer('sort_order').defaultTo(0);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // Create uses_items table
  await knex.schema.createTable('uses_items', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table
      .uuid('category_id')
      .notNullable()
      .references('id')
      .inTable('uses_categories')
      .onDelete('CASCADE');
    table.string('name').notNullable();
    table.text('description');
    table.string('url'); // Optional affiliate/product link
    table.integer('sort_order').defaultTo(0);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // Create indexes
  await knex.schema.alterTable('uses_categories', (table) => {
    table.index('sort_order');
  });

  await knex.schema.alterTable('uses_items', (table) => {
    table.index('category_id');
    table.index('sort_order');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('uses_items');
  await knex.schema.dropTableIfExists('uses_categories');
}
