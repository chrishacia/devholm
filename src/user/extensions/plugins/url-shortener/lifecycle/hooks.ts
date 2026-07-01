import { getDb } from '@/db';

export async function urlShortenerAfterInstall(): Promise<void> {
  const db = getDb();
  const now = new Date();

  await db('site_settings')
    .insert({
      key: 'plugin:url-shortener:route-prefix',
      value: '/s',
      type: 'string',
      category: 'plugins',
      description: 'URL shortener route prefix',
      updated_at: now,
    })
    .onConflict('key')
    .ignore();
}

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
