import type { Knex } from 'knex';

const GALLERY_BASELINE_TABLES = ['gallery_collections', 'gallery_items'] as const;

const GALLERY_BASELINE_SCHEMA_VERSION_KEY = 'plugin:gallery:baseline-schema-version';
const GALLERY_BASELINE_SCHEMA_VERSION =
  'core:20260629010000_add_calendar_gallery_and_media_transforms';

async function assertGalleryBaselineTables(knex: Knex): Promise<void> {
  const missingTables: string[] = [];

  for (const tableName of GALLERY_BASELINE_TABLES) {
    const exists = await knex.schema.hasTable(tableName);
    if (!exists) {
      missingTables.push(tableName);
    }
  }

  if (missingTables.length > 0) {
    throw new Error(
      `Gallery baseline schema is missing required tables: ${missingTables.join(', ')}`
    );
  }
}

export async function up(knex: Knex): Promise<void> {
  await assertGalleryBaselineTables(knex);

  await knex('site_settings')
    .insert({
      key: GALLERY_BASELINE_SCHEMA_VERSION_KEY,
      value: GALLERY_BASELINE_SCHEMA_VERSION,
      type: 'string',
      category: 'plugins',
      description: 'Gallery canonical authority baseline migration ownership marker',
      updated_at: knex.fn.now(),
    })
    .onConflict('key')
    .ignore();
}

export async function down(): Promise<void> {
  // Non-destructive ownership migration: intentionally no-op.
}
