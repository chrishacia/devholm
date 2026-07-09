import { getDb } from '@/db';
import { CALENDAR_BASELINE_TABLES } from '@user/extensions/plugins/calendar/constants';

async function ensureCalendarBaselineSchema(): Promise<void> {
  const db = getDb();
  const missingTables: string[] = [];

  for (const tableName of CALENDAR_BASELINE_TABLES) {
    // Calendar ownership adopts an existing schema baseline in Phase 1/2.
    const exists = await db.schema.hasTable(tableName);
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

async function countRowsForTable(tableName: string): Promise<number> {
  const db = getDb();
  const row = await db(tableName).count<{ row_count: string | number }>({ row_count: '*' }).first();
  const rawCount = row?.row_count ?? 0;
  const parsedCount =
    typeof rawCount === 'number' ? rawCount : Number.parseInt(String(rawCount), 10);
  return Number.isNaN(parsedCount) ? 0 : parsedCount;
}

async function collectCalendarTableCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  for (const tableName of CALENDAR_BASELINE_TABLES) {
    counts[tableName] = await countRowsForTable(tableName);
  }

  return counts;
}

export async function calendarAfterInstall(): Promise<void> {
  await ensureCalendarBaselineSchema();
}

export async function calendarAfterUpgrade(): Promise<void> {
  await ensureCalendarBaselineSchema();
}

export async function calendarBeforeDisable(): Promise<void> {
  await ensureCalendarBaselineSchema();
}

export async function calendarBeforeUninstall(): Promise<void> {
  await ensureCalendarBaselineSchema();
}

export async function calendarPurge(): Promise<void> {
  await ensureCalendarBaselineSchema();

  const tableCounts = await collectCalendarTableCounts();
  const totalRows = Object.values(tableCounts).reduce((acc, count) => acc + count, 0);
  if (totalRows > 0) {
    const summary = Object.entries(tableCounts)
      .map(([tableName, count]) => `${tableName}=${count}`)
      .join(', ');
    throw new Error(
      `Calendar purge is blocked while data exists. Non-destructive lifecycle policy in effect. Table counts: ${summary}`
    );
  }
}
