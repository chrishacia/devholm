import { getDb } from '@/db';
import { GALLERY_BASELINE_TABLES } from '@user/extensions/plugins/gallery/constants';

async function ensureGalleryBaselineSchema(): Promise<void> {
  const db = getDb();
  const missingTables: string[] = [];

  for (const tableName of GALLERY_BASELINE_TABLES) {
    // Gallery ownership adopts an existing schema baseline in Phase 1/2.
    const exists = await db.schema.hasTable(tableName);
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

async function countRowsForTable(tableName: string): Promise<number> {
  const db = getDb();
  const row = await db(tableName).count<{ row_count: string | number }>({ row_count: '*' }).first();
  const rawCount = row?.row_count ?? 0;
  const parsedCount =
    typeof rawCount === 'number' ? rawCount : Number.parseInt(String(rawCount), 10);
  return Number.isNaN(parsedCount) ? 0 : parsedCount;
}

async function countMediaReferences(): Promise<number> {
  const db = getDb();
  const row = await db('gallery_items')
    .whereNotNull('media_asset_id')
    .count<{ row_count: string | number }>({ row_count: '*' })
    .first();
  const rawCount = row?.row_count ?? 0;
  const parsedCount =
    typeof rawCount === 'number' ? rawCount : Number.parseInt(String(rawCount), 10);
  return Number.isNaN(parsedCount) ? 0 : parsedCount;
}

async function collectGalleryTableCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  for (const tableName of GALLERY_BASELINE_TABLES) {
    counts[tableName] = await countRowsForTable(tableName);
  }

  counts.gallery_media_references = await countMediaReferences();

  return counts;
}

export async function galleryAfterInstall(): Promise<void> {
  await ensureGalleryBaselineSchema();
}

export async function galleryAfterUpgrade(): Promise<void> {
  await ensureGalleryBaselineSchema();
}

export async function galleryBeforeDisable(): Promise<void> {
  await ensureGalleryBaselineSchema();
}

export async function galleryBeforeUninstall(): Promise<void> {
  await ensureGalleryBaselineSchema();
}

export async function galleryPurge(): Promise<void> {
  await ensureGalleryBaselineSchema();

  const tableCounts = await collectGalleryTableCounts();
  const totalRows = Object.values(tableCounts).reduce((acc, count) => acc + count, 0);
  if (totalRows > 0) {
    const summary = Object.entries(tableCounts)
      .map(([tableName, count]) => `${tableName}=${count}`)
      .join(', ');
    throw new Error(
      `Gallery purge is blocked while data or media references exist. Non-destructive lifecycle policy in effect. Table counts: ${summary}`
    );
  }
}
