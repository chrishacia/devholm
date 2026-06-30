'use client';

import { ReactNode, useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { MainLayout } from './MainLayout';

// =============================================================================
// Module-level Cache (prevents duplicate fetches across instances)
// =============================================================================

interface ProfileData {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  avatarUrls?: {
    thumbnail?: string;
    small?: string;
    original?: string;
  };
  email?: string;
}

let cachedProfile: ProfileData | null = null;
let cachedUnreadCount: number = 0;
let profileFetchPromise: Promise<ProfileData | null> | null = null;
let unreadCountFetchPromise: Promise<number> | null = null;
let lastProfileFetchTime: number = 0;
let lastUnreadCountFetchTime: number = 0;
const PROFILE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const UNREAD_COUNT_CACHE_TTL = 60 * 1000; // 1 minute (check more often)

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface AuthAwareMainLayoutProps {
  children: ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  announcement?: {
    message: string;
    link?: string;
    linkText?: string;
  };
}

/**
 * A wrapper around MainLayout that automatically detects authentication state
 * and fetches user profile data when logged in.
 *
 * Use this component on public pages to show the proper avatar menu state.
 *
 * OPTIMIZATION: Uses module-level caching to prevent duplicate API calls
 * across component instances and React Strict Mode double-renders.
 */
export function AuthAwareMainLayout({
  children,
  breadcrumbs,
  announcement,
}: AuthAwareMainLayoutProps) {
  const { data: session, status } = useSession();
  const [profile, setProfile] = useState<ProfileData | null>(cachedProfile);
  const [unreadCount, setUnreadCount] = useState(cachedUnreadCount);
  // Prevent hydration mismatch by deferring auth-dependent UI until mounted
  const [mounted, setMounted] = useState(false);
  const hasFetchedProfile = useRef(false);
  const hasFetchedUnreadCount = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch profile data when authenticated (with caching & deduplication)
  const fetchProfile = useCallback(async (force = false) => {
    const now = Date.now();

    // Use cached data if available and not expired
    if (!force && cachedProfile && now - lastProfileFetchTime < PROFILE_CACHE_TTL) {
      setProfile(cachedProfile);
      return cachedProfile;
    }

    // Deduplicate concurrent requests
    if (profileFetchPromise) {
      const result = await profileFetchPromise;
      setProfile(result);
      return result;
    }

    profileFetchPromise = (async () => {
      try {
        const response = await fetch('/api/admin/profile');
        if (response.ok) {
          const result = await response.json();
          cachedProfile = result.data;
          lastProfileFetchTime = Date.now();
          return result.data;
        }
        return null;
      } catch (err) {
        console.error('Error fetching profile:', err);
        return null;
      } finally {
        profileFetchPromise = null;
      }
    })();

    const result = await profileFetchPromise;
    setProfile(result);
    return result;
  }, []);

  // Fetch unread message count when authenticated (with caching & deduplication)
  const fetchUnreadCount = useCallback(async (force = false) => {
    const now = Date.now();

    // Use cached data if available and not expired
    if (
      !force &&
      cachedUnreadCount !== undefined &&
      now - lastUnreadCountFetchTime < UNREAD_COUNT_CACHE_TTL
    ) {
      setUnreadCount(cachedUnreadCount);
      return cachedUnreadCount;
    }

    // Deduplicate concurrent requests
    if (unreadCountFetchPromise) {
      const result = await unreadCountFetchPromise;
      setUnreadCount(result);
      return result;
    }

    unreadCountFetchPromise = (async () => {
      try {
        const response = await fetch('/api/admin/inbox/unread-count');
        if (response.ok) {
          const result = await response.json();
          cachedUnreadCount = result.count || 0;
          lastUnreadCountFetchTime = Date.now();
          return cachedUnreadCount;
        }
        return 0;
      } catch (err) {
        console.error('Error fetching unread count:', err);
        return 0;
      } finally {
        unreadCountFetchPromise = null;
      }
    })();

    const result = await unreadCountFetchPromise;
    setUnreadCount(result);
    return result;
  }, []);

  useEffect(() => {
    if (status === 'authenticated') {
      // Only fetch if not already fetched in this instance
      if (!hasFetchedProfile.current) {
        hasFetchedProfile.current = true;
        fetchProfile();
      }
      if (!hasFetchedUnreadCount.current) {
        hasFetchedUnreadCount.current = true;
        fetchUnreadCount();
      }
    } else if (status === 'unauthenticated') {
      // Reset state and cache when logged out
      setProfile(null);
      setUnreadCount(0);
      cachedProfile = null;
      cachedUnreadCount = 0;
      hasFetchedProfile.current = false;
      hasFetchedUnreadCount.current = false;
    }
  }, [status, fetchProfile, fetchUnreadCount]);

  // Only show authenticated state after client-side mount to prevent hydration mismatch
  // Server always renders as "not logged in", client updates after hydration
  const isLoggedIn = mounted && status === 'authenticated';

  // Build user object for the avatar menu
  const user =
    isLoggedIn && profile
      ? {
          displayName: profile.displayName,
          avatarUrl:
            profile.avatarUrls?.thumbnail || profile.avatarUrls?.small || profile.avatarUrl,
          email: profile.email || session?.user?.email || '',
        }
      : isLoggedIn && session?.user
        ? {
            displayName: session.user.name || null,
            // Profile not loaded yet, avatar will come from profile API
            avatarUrl: null,
            email: session.user.email || '',
          }
        : null;

  return (
    <MainLayout
      breadcrumbs={breadcrumbs}
      announcement={announcement}
      isLoggedIn={isLoggedIn}
      user={user}
      unreadCount={unreadCount}
    >
      {children}
    </MainLayout>
  );
}
