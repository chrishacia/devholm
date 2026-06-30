import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('media_transforms', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table
      .uuid('media_asset_id')
      .notNullable()
      .references('id')
      .inTable('media_assets')
      .onDelete('CASCADE');
    table.string('context_type', 80).notNullable();
    table.string('context_id', 120).notNullable();
    table.string('name', 120).notNullable().defaultTo('default');
    table.integer('crop_x').notNullable().defaultTo(0);
    table.integer('crop_y').notNullable().defaultTo(0);
    table.integer('crop_width').notNullable().defaultTo(0);
    table.integer('crop_height').notNullable().defaultTo(0);
    table.integer('focus_x').notNullable().defaultTo(50);
    table.integer('focus_y').notNullable().defaultTo(50);
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.unique(['media_asset_id', 'context_type', 'context_id', 'name']);
    table.index(['context_type', 'context_id']);
  });

  await knex.schema.createTable('calendar_collections', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.string('name', 180).notNullable();
    table.string('slug', 220).notNullable().unique();
    table.text('description');
    table.enum('mode', ['display', 'booking']).notNullable().defaultTo('display');
    table.boolean('is_private').notNullable().defaultTo(false);
    table.boolean('is_enabled').notNullable().defaultTo(true);
    table.string('timezone', 100).notNullable().defaultTo('UTC');
    table.string('embed_title', 220);
    table.uuid('owner_user_id').references('id').inTable('admin_users').onDelete('SET NULL');
    table.boolean('show_in_main_nav').notNullable().defaultTo(false);
    table.boolean('show_in_footer_main').notNullable().defaultTo(false);
    table.boolean('show_in_footer_resources').notNullable().defaultTo(false);
    table.boolean('include_in_sitemap').notNullable().defaultTo(false);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('calendar_event_types', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table
      .uuid('calendar_id')
      .notNullable()
      .references('id')
      .inTable('calendar_collections')
      .onDelete('CASCADE');
    table.string('name', 180).notNullable();
    table.string('slug', 220).notNullable();
    table.text('description');
    table.integer('duration_minutes').notNullable().defaultTo(30);
    table.integer('buffer_before_minutes').notNullable().defaultTo(0);
    table.integer('buffer_after_minutes').notNullable().defaultTo(0);
    table.string('location_type', 80).notNullable().defaultTo('custom');
    table.string('location_value', 500);
    table.boolean('is_active').notNullable().defaultTo(true);
    table.jsonb('availability_rules').notNullable().defaultTo('[]');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.unique(['calendar_id', 'slug']);
  });

  await knex.schema.createTable('calendar_blocks', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table
      .uuid('calendar_id')
      .notNullable()
      .references('id')
      .inTable('calendar_collections')
      .onDelete('CASCADE');
    table.string('title', 220).notNullable();
    table.text('description');
    table.timestamp('starts_at').notNullable();
    table.timestamp('ends_at').notNullable();
    table.boolean('is_public').notNullable().defaultTo(false);
    table.boolean('all_day').notNullable().defaultTo(false);
    table.string('display_color', 20);
    table.string('external_source', 120);
    table.string('external_id', 220);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index(['calendar_id', 'starts_at']);
  });

  await knex.schema.createTable('calendar_bookings', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table
      .uuid('calendar_id')
      .notNullable()
      .references('id')
      .inTable('calendar_collections')
      .onDelete('CASCADE');
    table
      .uuid('event_type_id')
      .references('id')
      .inTable('calendar_event_types')
      .onDelete('SET NULL');
    table.string('status', 40).notNullable().defaultTo('pending');
    table.string('name', 180).notNullable();
    table.string('email', 255).notNullable();
    table.string('title', 220).notNullable();
    table.text('notes');
    table.timestamp('starts_at').notNullable();
    table.timestamp('ends_at').notNullable();
    table.string('meeting_url', 500);
    table.string('source', 60).notNullable().defaultTo('public');
    table.string('source_ip', 45);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index(['calendar_id', 'starts_at']);
    table.index(['status']);
  });

  await knex.schema.createTable('calendar_integrations', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table
      .uuid('calendar_id')
      .notNullable()
      .references('id')
      .inTable('calendar_collections')
      .onDelete('CASCADE');
    table.string('provider', 80).notNullable();
    table.boolean('is_enabled').notNullable().defaultTo(false);
    table.jsonb('settings').notNullable().defaultTo('{}');
    table.jsonb('secrets').notNullable().defaultTo('{}');
    table.timestamp('last_synced_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.unique(['calendar_id', 'provider']);
  });

  await knex.schema.createTable('gallery_collections', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.string('name', 180).notNullable();
    table.string('slug', 220).notNullable().unique();
    table.text('description');
    table.string('layout', 80).notNullable().defaultTo('masonry');
    table.boolean('is_private').notNullable().defaultTo(false);
    table.boolean('is_enabled').notNullable().defaultTo(true);
    table.boolean('show_in_main_nav').notNullable().defaultTo(false);
    table.boolean('show_in_footer_main').notNullable().defaultTo(false);
    table.boolean('show_in_footer_resources').notNullable().defaultTo(false);
    table.boolean('include_in_sitemap').notNullable().defaultTo(false);
    table.uuid('cover_media_id').references('id').inTable('media_assets').onDelete('SET NULL');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('gallery_items', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table
      .uuid('gallery_id')
      .notNullable()
      .references('id')
      .inTable('gallery_collections')
      .onDelete('CASCADE');
    table.integer('sort_order').notNullable().defaultTo(0);
    table.string('kind', 40).notNullable().defaultTo('media');
    table.uuid('media_asset_id').references('id').inTable('media_assets').onDelete('CASCADE');
    table.string('external_url', 700);
    table.string('external_provider', 80);
    table.string('title', 220);
    table.text('caption');
    table.boolean('is_enabled').notNullable().defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index(['gallery_id', 'sort_order']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('gallery_items');
  await knex.schema.dropTableIfExists('gallery_collections');
  await knex.schema.dropTableIfExists('calendar_integrations');
  await knex.schema.dropTableIfExists('calendar_bookings');
  await knex.schema.dropTableIfExists('calendar_blocks');
  await knex.schema.dropTableIfExists('calendar_event_types');
  await knex.schema.dropTableIfExists('calendar_collections');
  await knex.schema.dropTableIfExists('media_transforms');
}
