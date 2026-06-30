/**
 * Site Settings Hook
 * ==================
 *
 * React hook for accessing site settings from the database.
 * Provides cached settings with automatic refresh.
 *
 * OPTIMIZATION: Uses module-level caching to prevent duplicate API calls
 * across component instances and React Strict Mode double-renders.
 */

'use client';

import {
  useState,
  useEffect,
  useCallback,
  createContext,
  useContext,
  ReactNode,
  useRef,
} from 'react';
import { mainNavigation, footerNavigation } from '@/config';

// =============================================================================
// Module-level Cache (prevents duplicate fetches across instances)
// =============================================================================

let cachedSettings: SiteSettings | null = null;
let fetchPromise: Promise<SiteSettings | null> | null = null;
let lastFetchTime: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

// =============================================================================
// Types
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

export interface SiteSettings {
  site: SiteInfo;
  author: AuthorInfo;
  social: SocialLinks;
  seo: SeoConfig;
  navigation: {
    main: Array<{ label: string; href: string }>;
    footerMain: Array<{ label: string; href: string }>;
    footerResources: Array<{ label: string; href: string }>;
  };
}

interface SiteSettingsContextValue {
  settings: SiteSettings | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

// =============================================================================
// Default Settings (fallback)
// =============================================================================

export const defaultSettings: SiteSettings = {
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
};

// =============================================================================
// Context
// =============================================================================

const SiteSettingsContext = createContext<SiteSettingsContextValue>({
  settings: null,
  loading: true,
  error: null,
  refresh: async () => {},
});

// =============================================================================
// Provider
// =============================================================================

interface SiteSettingsProviderProps {
  children: ReactNode;
  initialSettings?: SiteSettings;
}

export function SiteSettingsProvider({ children, initialSettings }: SiteSettingsProviderProps) {
  const [settings, setSettings] = useState<SiteSettings | null>(
    initialSettings || cachedSettings || null
  );
  const [loading, setLoading] = useState(!initialSettings && !cachedSettings);
  const [error, setError] = useState<string | null>(null);
  const hasFetched = useRef(false);

  const fetchSettings = useCallback(async (force = false) => {
    // Use cached data if available and not expired (unless forced)
    const now = Date.now();
    if (!force && cachedSettings && now - lastFetchTime < CACHE_TTL) {
      setSettings(cachedSettings);
      setLoading(false);
      return cachedSettings;
    }

    // If there's already a fetch in progress, wait for it (deduplication)
    if (fetchPromise) {
      try {
        const result = await fetchPromise;
        setSettings(result);
        setLoading(false);
        return result;
      } catch {
        // Fall through to make a new request
      }
    }

    // Start a new fetch and cache the promise
    fetchPromise = (async () => {
      try {
        const response = await fetch('/api/site-settings');

        if (!response.ok) {
          throw new Error('Failed to fetch site settings');
        }

        const result = await response.json();
        cachedSettings = result.data;
        lastFetchTime = Date.now();
        return result.data;
      } catch (err) {
        console.error('Error fetching site settings:', err);
        throw err;
      } finally {
        fetchPromise = null;
      }
    })();

    try {
      const result = await fetchPromise;
      setSettings(result);
      setError(null);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
      // Use default settings as fallback
      setSettings((current) => current ?? defaultSettings);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Skip if we have initial settings or already fetched in this instance
    if (initialSettings || hasFetched.current) {
      return;
    }

    hasFetched.current = true;
    fetchSettings();
  }, [initialSettings, fetchSettings]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await fetchSettings(true); // Force refresh
  }, [fetchSettings]);

  return (
    <SiteSettingsContext.Provider value={{ settings, loading, error, refresh }}>
      {children}
    </SiteSettingsContext.Provider>
  );
}

// =============================================================================
// Hook
// =============================================================================

export function useSiteSettings() {
  const context = useContext(SiteSettingsContext);

  if (!context) {
    throw new Error('useSiteSettings must be used within a SiteSettingsProvider');
  }

  return context;
}
