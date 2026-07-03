/**
 * Site Settings Database Layer
 * ============================
 *
 * Manages site-wide configuration stored in the database.
 * Settings are stored as key-value pairs with type information.
 */

import { getDb } from './index';
import { listCmsNavigationLinks, listDevPageNavigationLinks } from './pages';
import { listCalendarPublicNavigation } from './calendar';
import { listGalleryPublicNavigation } from './gallery';
import { isPluginEnabled } from './plugins';
import { mainNavigation, footerNavigation } from '@/config';
import { devPageDefinitions } from '@user/extensions/pages';
import { URL_SHORTENER_ROUTE_PREFIX_KEY } from '@user/extensions/plugins/url-shortener/constants';
import { validateRoutePrefix } from '@user/extensions/plugins/url-shortener/validation/prefix-validation';

// =============================================================================
// Types
// =============================================================================

export interface SiteSetting {
  key: string;
  value: string | null;
  type: 'string' | 'number' | 'boolean' | 'json';
  category: string;
  description: string | null;
  updatedAt: Date;
}

export interface SettingsMap {
  [key: string]: string | number | boolean | object | null;
}

export interface SettingsByCategory {
  [category: string]: SettingsMap;
}

// =============================================================================
// Transform Functions
// =============================================================================

function transformSetting(row: Record<string, unknown>): SiteSetting {
  return {
    key: row.key as string,
    value: row.value as string | null,
    type: row.type as 'string' | 'number' | 'boolean' | 'json',
    category: row.category as string,
    description: row.description as string | null,
    updatedAt: row.updated_at as Date,
  };
}

/**
 * Parse a setting value based on its type
 */
function parseValue(value: string | null, type: string): string | number | boolean | object | null {
  if (value === null || value === '') return null;

  switch (type) {
    case 'number':
      return Number(value);
    case 'boolean':
      return value === 'true' || value === '1';
    case 'json':
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    default:
      return value;
  }
}

/**
 * Stringify a value for storage
 */
function stringifyValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

async function routePrefixCollisionCandidates(trx: ReturnType<typeof getDb>): Promise<string[]> {
  const rows = await trx('site_settings')
    .select('key', 'value')
    .where('key', 'like', 'plugin:%:route-prefix');

  const pluginRows = await trx('devholm_plugins').select('plugin_id', 'enabled');
  const enabledById = new Map(
    pluginRows.map((row: { plugin_id: string; enabled: boolean }) => [
      row.plugin_id,
      Boolean(row.enabled),
    ])
  );

  const candidates: string[] = [];
  for (const row of rows) {
    const key = String((row as { key: string }).key);
    const match = key.match(/^plugin:(.+):route-prefix$/u);
    if (!match) {
      continue;
    }

    const pluginId = match[1];
    if (pluginId === 'url-shortener') {
      continue;
    }

    if (enabledById.get(pluginId) !== true) {
      continue;
    }

    const value = (row as { value: string | null }).value;
    if (typeof value === 'string' && value.trim()) {
      candidates.push(value);
    }
  }

  const aliasTableExists = await trx.schema.hasTable('u_url_shortener_prefix_aliases');
  if (aliasTableExists) {
    const aliasRows = await trx('u_url_shortener_prefix_aliases')
      .select('prefix')
      .where({ is_active: true });
    for (const row of aliasRows) {
      const value = (row as { prefix: string | null }).prefix;
      if (typeof value === 'string' && value.trim()) {
        candidates.push(value);
      }
    }
  }

  return candidates;
}

async function normalizeSettingMutationValue(
  trx: ReturnType<typeof getDb>,
  key: string,
  value: unknown
): Promise<unknown> {
  if (key !== URL_SHORTENER_ROUTE_PREFIX_KEY) {
    return value;
  }

  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Invalid route prefix value for ${URL_SHORTENER_ROUTE_PREFIX_KEY}`);
  }

  const candidates = await routePrefixCollisionCandidates(trx);
  return validateRoutePrefix(value, {
    additionalDisallowedPrefixes: candidates,
  });
}

// =============================================================================
// Read Operations
// =============================================================================

/**
 * Get all settings
 */
export async function getAllSettings(): Promise<SiteSetting[]> {
  const db = getDb();
  const settings = await db('site_settings').select('*').orderBy('category', 'key');
  return settings.map(transformSetting);
}

/**
 * Get all settings as a flat map with parsed values
 */
export async function getSettingsMap(): Promise<SettingsMap> {
  const settings = await getAllSettings();
  const map: SettingsMap = {};

  for (const setting of settings) {
    map[setting.key] = parseValue(setting.value, setting.type);
  }

  return map;
}

/**
 * Get settings organized by category
 */
export async function getSettingsByCategory(): Promise<SettingsByCategory> {
  const settings = await getAllSettings();
  const byCategory: SettingsByCategory = {};

  for (const setting of settings) {
    if (!byCategory[setting.category]) {
      byCategory[setting.category] = {};
    }
    byCategory[setting.category][setting.key] = parseValue(setting.value, setting.type);
  }

  return byCategory;
}

/**
 * Get settings for a specific category
 */
export async function getCategorySettings(category: string): Promise<SettingsMap> {
  const db = getDb();
  const settings = await db('site_settings').where('category', category).select('*');

  const map: SettingsMap = {};
  for (const row of settings) {
    const setting = transformSetting(row);
    map[setting.key] = parseValue(setting.value, setting.type);
  }

  return map;
}

/**
 * Get a single setting by key
 */
export async function getSetting(key: string): Promise<unknown> {
  const db = getDb();
  const row = await db('site_settings').where('key', key).first();

  if (!row) return null;

  const setting = transformSetting(row);
  return parseValue(setting.value, setting.type);
}

/**
 * Get multiple settings by keys
 */
export async function getSettings(keys: string[]): Promise<SettingsMap> {
  const db = getDb();
  const rows = await db('site_settings').whereIn('key', keys).select('*');

  const map: SettingsMap = {};
  for (const row of rows) {
    const setting = transformSetting(row);
    map[setting.key] = parseValue(setting.value, setting.type);
  }

  return map;
}

// =============================================================================
// Write Operations
// =============================================================================

/**
 * Update a single setting
 */
export async function updateSetting(key: string, value: unknown): Promise<boolean> {
  const db = getDb();
  const normalized = await normalizeSettingMutationValue(db, key, value);

  const updated = await db('site_settings')
    .where('key', key)
    .update({
      value: stringifyValue(normalized),
      updated_at: new Date(),
    });

  return updated > 0;
}

/**
 * Update multiple settings at once
 */
export async function updateSettings(settings: Record<string, unknown>): Promise<number> {
  const db = getDb();
  let count = 0;

  await db.transaction(async (trx) => {
    for (const [key, value] of Object.entries(settings)) {
      const normalized = await normalizeSettingMutationValue(trx, key, value);
      const updated = await trx('site_settings')
        .where('key', key)
        .update({
          value: stringifyValue(normalized),
          updated_at: new Date(),
        });

      if (updated > 0) count++;
    }
  });

  return count;
}

/**
 * Create or update a setting
 */
export async function upsertSetting(
  key: string,
  value: unknown,
  type: 'string' | 'number' | 'boolean' | 'json' = 'string',
  category: string = 'general',
  description?: string
): Promise<void> {
  const db = getDb();

  await db('site_settings')
    .insert({
      key,
      value: stringifyValue(value),
      type,
      category,
      description,
      updated_at: new Date(),
    })
    .onConflict('key')
    .merge({
      value: stringifyValue(value),
      updated_at: new Date(),
    });
}

// =============================================================================
// Convenience Getters for Common Settings
// =============================================================================

export interface SiteInfo {
  name: string;
  description: string;
  url: string;
  logoUrl: string | null;
  faviconUrl: string | null;
}

export interface AuthorInfo {
  name: string;
  email: string;
  bio: string;
  tagline: string;
  avatarUrl: string | null;
}

export interface SocialLinks {
  twitter: string | null;
  github: string | null;
  linkedin: string | null;
  facebook: string | null;
  instagram: string | null;
  tiktok: string | null;
  youtube: string | null;
  discord: string | null;
}

export interface NavigationConfig {
  main: Array<{ label: string; href: string }>;
  footerMain: Array<{ label: string; href: string }>;
  footerResources: Array<{ label: string; href: string }>;
}

export interface SeoConfig {
  titleTemplate: string;
  defaultTitle: string;
  ogImage: string | null;
  twitterCard: string;
  verification: VerificationConfig;
  robots: RobotsConfig;
  sitemap: SitemapConfig;
}

export interface VerificationConfig {
  google: string | null;
  bing: string | null;
  yandex: string | null;
}

export interface RobotsConfig {
  enabled: boolean;
  disallowPaths: string[];
  customRules: string;
}

export interface SitemapConfig {
  enabled: boolean;
  includePosts: boolean;
  includeTags: boolean;
  customPaths: string[];
}

/**
 * Get site info settings
 */
export async function getSiteInfo(): Promise<SiteInfo> {
  const settings = await getSettings([
    'site_name',
    'site_description',
    'site_url',
    'site_logo_url',
    'site_favicon_url',
  ]);

  return {
    name: (settings.site_name as string) || 'My Site',
    description: (settings.site_description as string) || '',
    url: (settings.site_url as string) || 'http://localhost:3000',
    logoUrl: (settings.site_logo_url as string) || null,
    faviconUrl: (settings.site_favicon_url as string) || null,
  };
}

/**
 * Get author info settings
 */
export async function getAuthorInfo(): Promise<AuthorInfo> {
  const settings = await getSettings([
    'author_name',
    'author_email',
    'author_bio',
    'author_tagline',
    'author_avatar_url',
  ]);

  return {
    name: (settings.author_name as string) || 'Admin',
    email: (settings.author_email as string) || '',
    bio: (settings.author_bio as string) || '',
    tagline: (settings.author_tagline as string) || '',
    avatarUrl: (settings.author_avatar_url as string) || null,
  };
}

/**
 * Get social links settings
 */
export async function getSocialLinks(): Promise<SocialLinks> {
  const settings = await getSettings([
    'social_twitter',
    'social_github',
    'social_linkedin',
    'social_facebook',
    'social_instagram',
    'social_tiktok',
    'social_youtube',
    'social_discord',
  ]);

  return {
    twitter: (settings.social_twitter as string) || null,
    github: (settings.social_github as string) || null,
    linkedin: (settings.social_linkedin as string) || null,
    facebook: (settings.social_facebook as string) || null,
    instagram: (settings.social_instagram as string) || null,
    tiktok: (settings.social_tiktok as string) || null,
    youtube: (settings.social_youtube as string) || null,
    discord: (settings.social_discord as string) || null,
  };
}

/**
 * Get SEO config settings
 */
export async function getSeoConfig(): Promise<SeoConfig> {
  const settings = await getSettings([
    'seo_title_template',
    'seo_default_title',
    'seo_og_image',
    'seo_twitter_card',
    'seo_verification_google',
    'seo_verification_bing',
    'seo_verification_yandex',
    'seo_robots_enabled',
    'seo_robots_disallow_paths',
    'seo_robots_custom_rules',
    'seo_sitemap_enabled',
    'seo_sitemap_include_posts',
    'seo_sitemap_include_tags',
    'seo_sitemap_custom_paths',
  ]);

  const disallowPaths = Array.isArray(settings.seo_robots_disallow_paths)
    ? settings.seo_robots_disallow_paths.filter(
        (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0
      )
    : [];

  const customPaths = Array.isArray(settings.seo_sitemap_custom_paths)
    ? settings.seo_sitemap_custom_paths.filter(
        (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0
      )
    : [];

  return {
    titleTemplate: (settings.seo_title_template as string) || '%s',
    defaultTitle: (settings.seo_default_title as string) || 'My Site',
    ogImage: (settings.seo_og_image as string) || null,
    twitterCard: (settings.seo_twitter_card as string) || 'summary',
    verification: {
      google: (settings.seo_verification_google as string) || null,
      bing: (settings.seo_verification_bing as string) || null,
      yandex: (settings.seo_verification_yandex as string) || null,
    },
    robots: {
      enabled: settings.seo_robots_enabled !== false,
      disallowPaths,
      customRules: (settings.seo_robots_custom_rules as string) || '',
    },
    sitemap: {
      enabled: settings.seo_sitemap_enabled !== false,
      includePosts: settings.seo_sitemap_include_posts !== false,
      includeTags: settings.seo_sitemap_include_tags === true,
      customPaths,
    },
  };
}

/**
 * Get runtime navigation that merges default links with user-managed pages.
 */
export async function getNavigationConfig(): Promise<NavigationConfig> {
  const [calendarPluginEnabled, galleryPluginEnabled] = await Promise.all([
    isPluginEnabled('calendar').catch(() => false),
    isPluginEnabled('gallery').catch(() => false),
  ]);

  const [cmsLinks, devLinks, calendarLinks, galleryLinks] = await Promise.all([
    listCmsNavigationLinks().catch(() => ({ main: [], footerMain: [], footerResources: [] })),
    listDevPageNavigationLinks(devPageDefinitions).catch(() => ({
      main: [],
      footerMain: [],
      footerResources: [],
    })),
    (calendarPluginEnabled
      ? listCalendarPublicNavigation()
      : Promise.resolve({ main: [], footerMain: [], footerResources: [] })
    ).catch(() => ({
      main: [],
      footerMain: [],
      footerResources: [],
    })),
    (galleryPluginEnabled
      ? listGalleryPublicNavigation()
      : Promise.resolve({ main: [], footerMain: [], footerResources: [] })
    ).catch(() => ({
      main: [],
      footerMain: [],
      footerResources: [],
    })),
  ]);

  const main = [
    ...mainNavigation,
    ...cmsLinks.main,
    ...devLinks.main,
    ...calendarLinks.main,
    ...galleryLinks.main,
  ];
  const footerMain = [
    ...footerNavigation.main,
    ...cmsLinks.footerMain,
    ...devLinks.footerMain,
    ...calendarLinks.footerMain,
    ...galleryLinks.footerMain,
  ];
  const footerResources = [
    ...footerNavigation.resources,
    ...cmsLinks.footerResources,
    ...devLinks.footerResources,
    ...calendarLinks.footerResources,
    ...galleryLinks.footerResources,
  ];

  return {
    main: Array.from(new Map(main.map((item) => [item.href, item])).values()),
    footerMain: Array.from(new Map(footerMain.map((item) => [item.href, item])).values()),
    footerResources: Array.from(new Map(footerResources.map((item) => [item.href, item])).values()),
  };
}

/**
 * Check if a feature is enabled
 */
export async function isFeatureEnabled(feature: string): Promise<boolean> {
  const value = await getSetting(`feature_${feature}_enabled`);
  return value === true;
}
