import type { Knex } from 'knex';

const CALENDAR_BASELINE_TABLES = [
  'calendar_collections',
  'calendar_event_types',
  'calendar_blocks',
  'calendar_bookings',
  'calendar_integrations',
] as const;

const CALENDAR_BASELINE_SCHEMA_VERSION_KEY = 'plugin:calendar:baseline-schema-version';
const CALENDAR_BASELINE_SCHEMA_VERSION =
  'core:20260629010000_add_calendar_gallery_and_media_transforms';

async function assertCalendarBaselineTables(knex: Knex): Promise<void> {
  const missingTables: string[] = [];

  for (const tableName of CALENDAR_BASELINE_TABLES) {
    const exists = await knex.schema.hasTable(tableName);
    if (!exists) {
      missingTables.push(tableName);
    }
  }

  if (missingTables.length > 0) {
    throw new Error(
      `Calendar baseline schema is missing required tables: ${missingTables.join(', ')}`
    );
  }
}

export async function up(knex: Knex): Promise<void> {
  await assertCalendarBaselineTables(knex);

  await knex('site_settings')
    .insert({
      key: CALENDAR_BASELINE_SCHEMA_VERSION_KEY,
      value: CALENDAR_BASELINE_SCHEMA_VERSION,
      type: 'string',
      category: 'plugins',
      description: 'Calendar canonical authority baseline migration ownership marker',
      updated_at: knex.fn.now(),
    })
    .onConflict('key')
    .ignore();
}

export async function down(): Promise<void> {
  // Non-destructive ownership migration: intentionally no-op.
}
