import type { Knex } from 'knex';

const SETTINGS = [
  {
    key: 'seo_robots_enabled',
    value: 'true',
    type: 'boolean',
    category: 'seo',
    description: 'Enable robots.txt crawling directives',
  },
  {
    key: 'seo_robots_disallow_paths',
    value: '[]',
    type: 'json',
    category: 'seo',
    description: 'Paths disallowed in robots.txt',
  },
  {
    key: 'seo_robots_custom_rules',
    value: '',
    type: 'string',
    category: 'seo',
    description: 'Additional raw robots.txt directives appended after default rules',
  },
  {
    key: 'seo_sitemap_enabled',
    value: 'true',
    type: 'boolean',
    category: 'seo',
    description: 'Enable sitemap.xml generation',
  },
  {
    key: 'seo_sitemap_include_posts',
    value: 'true',
    type: 'boolean',
    category: 'seo',
    description: 'Include published blog posts in sitemap.xml',
  },
  {
    key: 'seo_sitemap_include_tags',
    value: 'false',
    type: 'boolean',
    category: 'seo',
    description: 'Include blog tag archive pages in sitemap.xml',
  },
  {
    key: 'seo_sitemap_custom_paths',
    value: '[]',
    type: 'json',
    category: 'seo',
    description: 'Additional relative or absolute URLs to append to sitemap.xml',
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
