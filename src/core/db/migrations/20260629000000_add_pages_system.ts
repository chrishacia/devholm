import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('pages', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.string('title', 300).notNullable();
    table.string('slug', 300).notNullable().unique();
    table.text('excerpt');
    table.text('content_markdown').notNullable();
    table.text('content_html');
    table.enum('status', ['draft', 'published', 'archived']).notNullable().defaultTo('draft');
    table.timestamp('published_at');
    table.boolean('is_enabled').notNullable().defaultTo(true);
    table.string('nav_label', 120);
    table.boolean('show_in_main_nav').notNullable().defaultTo(false);
    table.boolean('show_in_footer_main').notNullable().defaultTo(false);
    table.boolean('show_in_footer_resources').notNullable().defaultTo(false);
    table.boolean('include_in_sitemap').notNullable().defaultTo(true);
    table.uuid('author_id').references('id').inTable('admin_users').onDelete('SET NULL');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('status');
    table.index('is_enabled');
    table.index('published_at');
  });

  await knex.schema.createTable('dev_pages', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.string('page_key', 120).notNullable().unique();
    table.string('path', 300).notNullable().unique();
    table.string('title', 300).notNullable();
    table.string('nav_label', 120);
    table.boolean('is_enabled').notNullable().defaultTo(false);
    table.boolean('show_in_main_nav').notNullable().defaultTo(false);
    table.boolean('show_in_footer_main').notNullable().defaultTo(false);
    table.boolean('show_in_footer_resources').notNullable().defaultTo(false);
    table.boolean('include_in_sitemap').notNullable().defaultTo(false);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('is_enabled');
    table.index('include_in_sitemap');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('dev_pages');
  await knex.schema.dropTableIfExists('pages');
}
