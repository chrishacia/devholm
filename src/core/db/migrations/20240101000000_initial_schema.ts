import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Admin users table
  await knex.schema.createTable('admin_users', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.string('email', 255).notNullable().unique();
    table.string('password_hash', 255).notNullable();
    table.string('display_name', 100);
    table.string('avatar_url', 500);
    table.string('totp_secret', 100);
    table.boolean('totp_enabled').defaultTo(false);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.timestamp('last_login_at');
  });

  // Sessions table
  await knex.schema.createTable('sessions', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.uuid('user_id').notNullable().references('id').inTable('admin_users').onDelete('CASCADE');
    table.string('token_hash', 255).notNullable().unique();
    table.string('ip_address', 45);
    table.string('user_agent', 500);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('expires_at').notNullable();

    table.index('token_hash');
    table.index('expires_at');
  });

  // Tags table
  await knex.schema.createTable('tags', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.string('name', 100).notNullable().unique();
    table.string('slug', 100).notNullable().unique();
    table.text('description');
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('slug');
  });

  // Series table
  await knex.schema.createTable('series', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.string('name', 200).notNullable();
    table.string('slug', 200).notNullable().unique();
    table.text('description');
    table.integer('sort_order').defaultTo(0);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('slug');
  });

  // Posts table
  await knex.schema.createTable('posts', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.string('title', 300).notNullable();
    table.string('slug', 300).notNullable().unique();
    table.text('excerpt');
    table.text('content_markdown').notNullable();
    table.text('content_html');
    table.enum('status', ['draft', 'published', 'scheduled', 'archived']).defaultTo('draft');
    table.timestamp('published_at');
    table.timestamp('scheduled_at');
    table.string('featured_image_url', 500);
    table.string('featured_image_alt', 300);
    table.integer('reading_time_minutes').defaultTo(0);
    // SEO fields
    table.string('seo_title', 70);
    table.string('seo_description', 160);
    table.string('canonical_url', 500);
    table.string('og_image_url', 500);
    table.boolean('noindex').defaultTo(false);
    // Metadata
    table.uuid('author_id').references('id').inTable('admin_users').onDelete('SET NULL');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('slug');
    table.index('status');
    table.index('published_at');
    table.index('scheduled_at');
  });

  // Post tags junction table
  await knex.schema.createTable('post_tags', (table) => {
    table.uuid('post_id').notNullable().references('id').inTable('posts').onDelete('CASCADE');
    table.uuid('tag_id').notNullable().references('id').inTable('tags').onDelete('CASCADE');
    table.primary(['post_id', 'tag_id']);
  });

  // Post series junction table
  await knex.schema.createTable('post_series', (table) => {
    table.uuid('post_id').notNullable().references('id').inTable('posts').onDelete('CASCADE');
    table.uuid('series_id').notNullable().references('id').inTable('series').onDelete('CASCADE');
    table.integer('order_in_series').defaultTo(0);
    table.primary(['post_id', 'series_id']);
  });

  // Inbox messages table
  await knex.schema.createTable('inbox_messages', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.string('source', 100).notNullable().defaultTo('contact');
    table.string('name', 200);
    table.string('email', 255);
    table.string('subject', 500);
    table.text('body').notNullable();
    table.enum('status', ['unread', 'read', 'archived', 'deleted', 'spam']).defaultTo('unread');
    table.string('ip_address', 45);
    table.string('user_agent', 500);
    table.jsonb('metadata');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('read_at');

    table.index('status');
    table.index('created_at');
  });

  // Media assets table
  await knex.schema.createTable('media_assets', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.string('filename', 255).notNullable();
    table.string('original_filename', 255).notNullable();
    table.string('mime_type', 100).notNullable();
    table.bigInteger('file_size').notNullable();
    table.string('storage_path', 500).notNullable();
    table.string('public_url', 500);
    table.string('alt_text', 300);
    table.text('caption');
    table.integer('width');
    table.integer('height');
    table.uuid('uploaded_by').references('id').inTable('admin_users').onDelete('SET NULL');
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('mime_type');
    table.index('created_at');
  });

  // Rate limiting table
  await knex.schema.createTable('rate_limits', (table) => {
    table.string('key', 255).primary();
    table.integer('count').defaultTo(0);
    table.timestamp('window_start').notNullable();
    table.timestamp('expires_at').notNullable();

    table.index('expires_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('rate_limits');
  await knex.schema.dropTableIfExists('media_assets');
  await knex.schema.dropTableIfExists('inbox_messages');
  await knex.schema.dropTableIfExists('post_series');
  await knex.schema.dropTableIfExists('post_tags');
  await knex.schema.dropTableIfExists('posts');
  await knex.schema.dropTableIfExists('series');
  await knex.schema.dropTableIfExists('tags');
  await knex.schema.dropTableIfExists('sessions');
  await knex.schema.dropTableIfExists('admin_users');
}
