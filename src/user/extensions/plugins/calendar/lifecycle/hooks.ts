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

export async function calendarAfterInstall(): Promise<void> {
  await ensureCalendarBaselineSchema();
}

export async function calendarAfterUpgrade(): Promise<void> {
  await ensureCalendarBaselineSchema();
}

export async function calendarBeforeDisable(): Promise<void> {
  return Promise.resolve();
}

export async function calendarBeforeUninstall(): Promise<void> {
  return Promise.resolve();
}

export async function calendarPurge(): Promise<void> {
  // Intentionally non-destructive in Phase 1/2.
  return Promise.resolve();
}
