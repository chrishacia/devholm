/**
 * Public Site Settings API
 * ========================
 *
 * Returns public site configuration for use in the frontend.
 * This endpoint does not require authentication.
 * It caches responses for performance.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getSiteInfo,
  getAuthorInfo,
  getSocialLinks,
  getSeoConfig,
  getNavigationConfig,
} from '@/db/settings';
import { checkRateLimit, getClientIp, rateLimitHeaders, RateLimits } from '@/lib/rate-limiter';
import { mainNavigation, footerNavigation } from '@/config';

// Cache the settings for 1 minute to reduce database load
let cachedSettings: Record<string, unknown> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60 * 1000; // 1 minute

async function getCachedSettings() {
  const now = Date.now();

  if (cachedSettings && now - cacheTimestamp < CACHE_TTL) {
    return cachedSettings;
  }

  try {
    const [site, author, social, seo, navigation] = await Promise.all([
      getSiteInfo(),
      getAuthorInfo(),
      getSocialLinks(),
      getSeoConfig(),
      getNavigationConfig(),
    ]);

    cachedSettings = { site, author, social, seo, navigation };
    cacheTimestamp = now;

    return cachedSettings;
  } catch (error) {
    // If we have cached settings, return them even if expired
    if (cachedSettings) {
      return cachedSettings;
    }
    throw error;
  }
}

// =============================================================================
// GET /api/site-settings - Get public site settings
// =============================================================================

export async function GET(request: NextRequest) {
  // Rate limit
  const clientIp = getClientIp(request);
  const rateLimit = await checkRateLimit({
    action: 'site-settings',
    identifier: clientIp,
    ...RateLimits.PUBLIC_API,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: rateLimitHeaders(rateLimit) }
    );
  }

  try {
    const settings = await getCachedSettings();

    return NextResponse.json(
      { data: settings },
      {
        headers: {
          ...rateLimitHeaders(rateLimit),
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        },
      }
    );
  } catch (error) {
    console.error('Site settings GET error:', error);

    // Return fallback settings if database is unavailable
    return NextResponse.json(
      {
        data: {
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
          navigation: {
            main: mainNavigation,
            footerMain: footerNavigation.main,
            footerResources: footerNavigation.resources,
          },
        },
      },
      { headers: rateLimitHeaders(rateLimit) }
    );
  }
}
