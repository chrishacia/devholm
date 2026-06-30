import type { Knex } from 'knex';
import { siteConfig, defaultSeoConfig } from '@/config';

export async function seed(knex: Knex): Promise<void> {
  const tableExists = await knex.schema.hasTable('site_settings');
  if (!tableExists) {
    console.log('⚠ site_settings table does not exist, skipping settings seed');
    return;
  }

  const settingsUpdates = [
    { key: 'site_name', value: siteConfig.name },
    { key: 'site_description', value: siteConfig.description },
    { key: 'site_url', value: siteConfig.url },
    { key: 'author_name', value: siteConfig.author.name },
    { key: 'author_email', value: siteConfig.author.email },
    {
      key: 'author_bio',
      value:
        'I love exploring new worlds through audiobooks. When not listening to epic space operas or fantasy adventures, I enjoy sharing recommendations and discussing what makes a great listening experience.',
    },
    { key: 'author_tagline', value: 'Audiobook Enthusiast & Reviewer' },
    {
      key: 'social_twitter',
      value: siteConfig.social.twitter ? `https://twitter.com/${siteConfig.social.twitter}` : null,
    },
    {
      key: 'social_github',
      value: siteConfig.social.github ? `https://github.com/${siteConfig.social.github}` : null,
    },
    {
      key: 'social_linkedin',
      value: siteConfig.social.linkedin
        ? `https://linkedin.com/in/${siteConfig.social.linkedin}`
        : null,
    },
    {
      key: 'social_facebook',
      value: siteConfig.social.facebook
        ? `https://facebook.com/${siteConfig.social.facebook}`
        : null,
    },
    {
      key: 'social_instagram',
      value: siteConfig.social.instagram
        ? `https://instagram.com/${siteConfig.social.instagram}`
        : null,
    },
    {
      key: 'social_tiktok',
      value: siteConfig.social.tiktok ? `https://tiktok.com/@${siteConfig.social.tiktok}` : null,
    },
    {
      key: 'social_youtube',
      value: siteConfig.social.youtube ? `https://youtube.com/@${siteConfig.social.youtube}` : null,
    },
    {
      key: 'social_discord',
      value: siteConfig.social.discord ? `https://discord.gg/${siteConfig.social.discord}` : null,
    },
    { key: 'seo_title_template', value: defaultSeoConfig.titleTemplate },
    { key: 'seo_default_title', value: defaultSeoConfig.defaultTitle },
    { key: 'seo_twitter_card', value: defaultSeoConfig.twitter.cardType },
  ];

  for (const { key, value } of settingsUpdates) {
    await knex('site_settings')
      .where('key', key)
      .update({
        value: value !== null ? String(value) : null,
        updated_at: new Date(),
      });
  }

  console.log('✓ Site settings seeded from config');
  console.log(`  Site: ${siteConfig.name}`);
  console.log(`  Author: ${siteConfig.author.name}`);
  console.log(`  ${settingsUpdates.length} settings updated`);
}
