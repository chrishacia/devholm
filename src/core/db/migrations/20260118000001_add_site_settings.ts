import type { Knex } from 'knex';

/**
 * Add site_settings table for configurable site-wide settings
 * and extend admin_users with bio and additional profile fields
 */
export async function up(knex: Knex): Promise<void> {
  // Site settings table - key-value store for site configuration
  await knex.schema.createTable('site_settings', (table) => {
    table.string('key', 100).primary();
    table.text('value');
    table.string('type', 20).notNullable().defaultTo('string'); // string, number, boolean, json
    table.string('category', 50).notNullable().defaultTo('general');
    table.text('description');
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('category');
  });

  // Add additional profile fields to admin_users
  await knex.schema.alterTable('admin_users', (table) => {
    table.text('bio'); // Short bio for about sections
    table.string('title', 200); // Professional title/tagline
    table.string('location', 200);
    table.string('website_url', 500);
    table.string('twitter_handle', 50);
    table.string('github_handle', 50);
    table.string('linkedin_handle', 50);
    table.uuid('avatar_media_id').references('id').inTable('media_assets').onDelete('SET NULL');
  });

  // Insert default site settings
  const defaultSettings = [
    // General
    {
      key: 'site_name',
      value: 'DevHolm',
      type: 'string',
      category: 'general',
      description: 'Site name displayed in header and titles',
    },
    {
      key: 'site_description',
      value:
        'A modern personal website template built with Next.js. Customize it to showcase your work, blog, and projects.',
      type: 'string',
      category: 'general',
      description: 'Site description for SEO',
    },
    {
      key: 'site_url',
      value: 'https://yoursite.com',
      type: 'string',
      category: 'general',
      description: 'Public URL of the site',
    },
    {
      key: 'site_logo_url',
      value: '',
      type: 'string',
      category: 'general',
      description: 'URL to site logo image',
    },
    {
      key: 'site_favicon_url',
      value: '',
      type: 'string',
      category: 'general',
      description: 'URL to favicon',
    },

    // Author/Owner Info
    {
      key: 'author_name',
      value: 'Your Name',
      type: 'string',
      category: 'author',
      description: 'Author name for attribution',
    },
    {
      key: 'author_email',
      value: 'you@example.com',
      type: 'string',
      category: 'author',
      description: 'Contact email',
    },
    {
      key: 'author_bio',
      value: "I'm a developer passionate about building beautiful, performant web applications.",
      type: 'string',
      category: 'author',
      description: 'Short bio for sidebars',
    },
    {
      key: 'author_tagline',
      value: 'Full Stack Developer',
      type: 'string',
      category: 'author',
      description: 'Professional tagline',
    },
    {
      key: 'author_avatar_url',
      value: '/images/avatar.jpg',
      type: 'string',
      category: 'author',
      description: 'Default avatar image URL',
    },

    // Social Links (empty by default - users should fill in their own)
    {
      key: 'social_twitter',
      value: '',
      type: 'string',
      category: 'social',
      description: 'Twitter/X handle',
    },
    {
      key: 'social_github',
      value: '',
      type: 'string',
      category: 'social',
      description: 'GitHub username',
    },
    {
      key: 'social_linkedin',
      value: '',
      type: 'string',
      category: 'social',
      description: 'LinkedIn username',
    },
    {
      key: 'social_facebook',
      value: '',
      type: 'string',
      category: 'social',
      description: 'Facebook username',
    },
    {
      key: 'social_instagram',
      value: '',
      type: 'string',
      category: 'social',
      description: 'Instagram handle',
    },
    {
      key: 'social_tiktok',
      value: '',
      type: 'string',
      category: 'social',
      description: 'TikTok handle',
    },
    {
      key: 'social_youtube',
      value: '',
      type: 'string',
      category: 'social',
      description: 'YouTube channel',
    },
    {
      key: 'social_discord',
      value: '',
      type: 'string',
      category: 'social',
      description: 'Discord invite code',
    },

    // SEO
    {
      key: 'seo_title_template',
      value: '%s | DevHolm',
      type: 'string',
      category: 'seo',
      description: 'Page title template',
    },
    {
      key: 'seo_default_title',
      value: 'DevHolm - Personal Website Template',
      type: 'string',
      category: 'seo',
      description: 'Default page title',
    },
    {
      key: 'seo_og_image',
      value: '',
      type: 'string',
      category: 'seo',
      description: 'Default Open Graph image',
    },
    {
      key: 'seo_twitter_card',
      value: 'summary_large_image',
      type: 'string',
      category: 'seo',
      description: 'Twitter card type',
    },

    // Contact Form
    {
      key: 'contact_enabled',
      value: 'true',
      type: 'boolean',
      category: 'contact',
      description: 'Enable contact form',
    },
    {
      key: 'contact_email',
      value: 'you@example.com',
      type: 'string',
      category: 'contact',
      description: 'Email to receive contact form submissions',
    },
    {
      key: 'contact_success_message',
      value: 'Thank you for your message! I will get back to you soon.',
      type: 'string',
      category: 'contact',
      description: 'Success message after form submission',
    },

    // Features
    {
      key: 'feature_blog_enabled',
      value: 'true',
      type: 'boolean',
      category: 'features',
      description: 'Enable blog section',
    },
    {
      key: 'feature_projects_enabled',
      value: 'true',
      type: 'boolean',
      category: 'features',
      description: 'Enable projects section',
    },
    {
      key: 'feature_comments_enabled',
      value: 'false',
      type: 'boolean',
      category: 'features',
      description: 'Enable blog comments',
    },
    {
      key: 'feature_newsletter_enabled',
      value: 'false',
      type: 'boolean',
      category: 'features',
      description: 'Enable newsletter signup',
    },

    // Analytics
    {
      key: 'analytics_google_id',
      value: '',
      type: 'string',
      category: 'analytics',
      description: 'Google Analytics ID',
    },
    {
      key: 'analytics_plausible_domain',
      value: '',
      type: 'string',
      category: 'analytics',
      description: 'Plausible Analytics domain',
    },
  ];

  await knex('site_settings').insert(defaultSettings);
}

export async function down(knex: Knex): Promise<void> {
  // Remove added columns from admin_users
  await knex.schema.alterTable('admin_users', (table) => {
    table.dropColumn('bio');
    table.dropColumn('title');
    table.dropColumn('location');
    table.dropColumn('website_url');
    table.dropColumn('twitter_handle');
    table.dropColumn('github_handle');
    table.dropColumn('linkedin_handle');
    table.dropColumn('avatar_media_id');
  });

  // Drop site_settings table
  await knex.schema.dropTableIfExists('site_settings');
}
