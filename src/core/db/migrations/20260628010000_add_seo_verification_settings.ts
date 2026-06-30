import type { Knex } from 'knex';

const SETTINGS = [
  {
    key: 'seo_verification_google',
    value: '',
    type: 'string',
    category: 'seo',
    description: 'Google Search Console verification token',
  },
  {
    key: 'seo_verification_bing',
    value: '',
    type: 'string',
    category: 'seo',
    description: 'Bing Webmaster Tools verification token',
  },
  {
    key: 'seo_verification_yandex',
    value: '',
    type: 'string',
    category: 'seo',
    description: 'Yandex webmaster verification token',
  },
] as const;

export async function up(knex: Knex): Promise<void> {
  for (const setting of SETTINGS) {
    await knex('site_settings')
      .insert({
        ...setting,
        updated_at: knex.fn.now(),
      })
      .onConflict('key')
      .ignore();
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex('site_settings')
    .whereIn(
      'key',
      SETTINGS.map((setting) => setting.key)
    )
    .delete();
}
