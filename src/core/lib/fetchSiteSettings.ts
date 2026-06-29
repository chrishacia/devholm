/**
 * Server-Side Site Settings Fetch
 * ================================
 *
 * Server-only utility for fetching site settings.
 * Use this in server components, route handlers, or server actions.
 */

import type { SiteSettings } from '@/hooks/useSiteSettings';
import { getSiteInfo, getAuthorInfo, getSocialLinks, getSeoConfig } from '@/db/settings';

// Default settings (fallback)
const defaultSettings: SiteSettings = {
  site: {
    name: 'My Site',
    description: '',
    url: 'http://localhost:3000',
    logoUrl: null,
    faviconUrl: null,
  },
  author: {
    name: 'Admin',
    email: '',
    bio: '',
    tagline: '',
    avatarUrl: null,
  },
  social: {
    twitter: null,
    github: null,
    linkedin: null,
    facebook: null,
    instagram: null,
    tiktok: null,
    youtube: null,
    discord: null,
  },
  seo: {
    titleTemplate: '%s',
    defaultTitle: 'My Site',
    ogImage: null,
    twitterCard: 'summary',
    verification: {
      google: null,
      bing: null,
      yandex: null,
    },
    robots: {
      enabled: true,
      disallowPaths: [],
      customRules: '',
    },
    sitemap: {
      enabled: true,
      includePosts: true,
      includeTags: false,
      customPaths: [],
    },
  },
};

/**
 * Fetch site settings on the server side.
 * Use this in server components or route handlers.
 */
export async function fetchSiteSettings(): Promise<SiteSettings> {
  try {
    const [site, author, social, seo] = await Promise.all([
      getSiteInfo(),
      getAuthorInfo(),
      getSocialLinks(),
      getSeoConfig(),
    ]);

    return { site, author, social, seo };
  } catch (error) {
    console.error('Error fetching site settings:', error);
    return defaultSettings;
  }
}
