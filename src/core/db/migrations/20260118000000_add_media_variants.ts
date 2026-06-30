import type { Knex } from 'knex';

/**
 * Add media variants table for storing optimized image versions
 */
export async function up(knex: Knex): Promise<void> {
  // Create media_variants table for storing image variants
  await knex.schema.createTable('media_variants', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table
      .uuid('media_asset_id')
      .notNullable()
      .references('id')
      .inTable('media_assets')
      .onDelete('CASCADE');
    table.string('variant_name', 50).notNullable(); // thumbnail, small, medium, large, xlarge
    table.string('filename', 255).notNullable();
    table.string('storage_path', 500).notNullable();
    table.string('public_url', 500).notNullable();
    table.string('mime_type', 100).notNullable();
    table.bigInteger('file_size').notNullable();
    table.integer('width');
    table.integer('height');
    table.timestamp('created_at').defaultTo(knex.fn.now());

    // Index for fast lookups by media asset
    table.index('media_asset_id');
    table.index('variant_name');
  });

  // Add new columns to media_assets for better tracking
  await knex.schema.alterTable('media_assets', (table) => {
    // Original file hash for deduplication
    table.string('file_hash', 64);
    // Processed flag to track if variants were generated
    table.boolean('is_processed').defaultTo(false);
    // Original upload name (before secure rename)
    // Note: original_filename already exists, but let's ensure we have upload tracking
    table.string('upload_ip', 45); // IPv6 can be up to 45 chars
    // Processing error if any
    table.text('processing_error');
  });

  // Add index on file_hash for deduplication lookups
  await knex.schema.alterTable('media_assets', (table) => {
    table.index('file_hash');
    table.index('is_processed');
  });
}

export async function down(knex: Knex): Promise<void> {
  // Drop the variants table
  await knex.schema.dropTableIfExists('media_variants');

  // Remove added columns from media_assets
  await knex.schema.alterTable('media_assets', (table) => {
    table.dropIndex('file_hash');
    table.dropIndex('is_processed');
    table.dropColumn('file_hash');
    table.dropColumn('is_processed');
    table.dropColumn('upload_ip');
    table.dropColumn('processing_error');
  });
}
