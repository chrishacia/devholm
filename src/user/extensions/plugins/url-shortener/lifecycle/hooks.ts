import { getDb } from '@/db';

export async function urlShortenerPurge(): Promise<void> {
  const db = getDb();

  await db.transaction(async (trx) => {
    await trx('u_url_shortener_daily_stats').del();
    await trx('u_url_shortener_click_events').del();
    await trx('u_url_shortener_public_submissions').del();
    await trx('u_url_shortener_audit_records').del();
    await trx('u_url_shortener_prefix_aliases').del();
    await trx('u_url_shortener_links').del();
  });
}
