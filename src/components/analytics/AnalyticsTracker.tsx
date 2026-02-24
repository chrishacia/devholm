'use client';

/**
 * Analytics Tracker Component
 * ===========================
 *
 * Client-side component that tracks page views and referrers.
 * Privacy-focused: Uses anonymous session IDs, no PII collected.
 *
 * Usage: Add <AnalyticsTracker /> to your layout.tsx
 * For 404 pages: <AnalyticsTracker statusCode={404} />
 *
 * Note: Logged-in admin users are automatically excluded from tracking
 * to avoid skewing analytics with owner activity.
 */

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { SessionProvider } from 'next-auth/react';
import type { ReactNode } from 'react';

// =============================================================================
// Safe Session Wrapper (for use outside SessionProvider)
// =============================================================================

/**
 * Wrapper component that provides a SessionProvider if one doesn't exist.
 * This allows AnalyticsTracker to work in not-found.tsx and error pages.
 */
function SafeSessionWrapper({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}

/**
 * Inner component that safely uses session
 */
function AnalyticsTrackerInner({ statusCode }: { statusCode?: number }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const trackingInProgress = useRef(false);

  // Safe to use useSession here - we're always inside a SessionProvider
  const { status } = useSession();
  const isAuthenticated = status === 'authenticated';

  useEffect(() => {
    // Skip tracking for authenticated admin users
    if (isAuthenticated) {
      return;
    }

    // Build full path for comparison
    const fullPath = `${pathname}${searchParams?.toString() ? `?${searchParams.toString()}` : ''}`;
    const now = Date.now();

    // Skip if we've already tracked this exact path recently (debounce)
    if (lastTrackedFullPath === fullPath && now - lastTrackTime < TRACK_DEBOUNCE_MS) {
      return;
    }

    // Skip if already tracking (prevents concurrent calls)
    if (trackingInProgress.current) {
      return;
    }

    // Mark as tracking
    trackingInProgress.current = true;
    lastTrackedFullPath = fullPath;
    lastTrackTime = now;

    // Get page title
    const pageTitle = typeof document !== 'undefined' ? document.title : undefined;

    trackPageView({
      pagePath: pathname || '/',
      pageTitle,
      statusCode,
    }).finally(() => {
      trackingInProgress.current = false;
    });
  }, [pathname, searchParams, statusCode, isAuthenticated]);

  return null;
}

// =============================================================================
// Session Management
// =============================================================================

function getOrCreateSessionId(): string {
  const SESSION_KEY = 'ch_analytics_session';

  // Check if we already have a session
  if (typeof window !== 'undefined') {
    let sessionId = sessionStorage.getItem(SESSION_KEY);

    if (!sessionId) {
      // Generate a random session ID (no fingerprinting, no tracking)
      sessionId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
      sessionStorage.setItem(SESSION_KEY, sessionId);
    }

    return sessionId;
  }

  return 'ssr-session';
}

// =============================================================================
// UTM Parameter Extraction
// =============================================================================

interface UTMParams {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
}

function extractUTMParams(searchParams: URLSearchParams | null): UTMParams {
  if (!searchParams) return {};

  return {
    utmSource: searchParams.get('utm_source') || undefined,
    utmMedium: searchParams.get('utm_medium') || undefined,
    utmCampaign: searchParams.get('utm_campaign') || undefined,
    utmTerm: searchParams.get('utm_term') || undefined,
    utmContent: searchParams.get('utm_content') || undefined,
  };
}

// =============================================================================
// Referrer Processing
// =============================================================================

function getCleanReferrer(): string | undefined {
  if (typeof document === 'undefined') return undefined;

  const referrer = document.referrer;
  if (!referrer) return undefined;

  try {
    const url = new URL(referrer);
    const currentHost = window.location.hostname;

    // Don't track internal referrers
    if (url.hostname === currentHost) {
      return undefined;
    }

    // Return the full referrer URL
    return referrer;
  } catch {
    // Invalid URL, return as-is if not empty
    return referrer || undefined;
  }
}

// =============================================================================
// Tracking Function (exported for use in other components)
// =============================================================================

export async function trackPageView(options: {
  pagePath: string;
  pageTitle?: string;
  statusCode?: number;
}): Promise<void> {
  try {
    const sessionId = getOrCreateSessionId();
    const referrer = getCleanReferrer();

    // Get UTM params from current URL
    const searchParams =
      typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const utmParams = extractUTMParams(searchParams);

    const payload = {
      sessionId,
      pagePath: options.pagePath,
      pageTitle: options.pageTitle,
      referrer,
      statusCode: options.statusCode,
      ...utmParams,
    };

    await fetch('/api/analytics/track', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch (error) {
    console.debug('Analytics tracking error:', error);
  }
}

// =============================================================================
// Module-level tracking state (prevents duplicate API calls)
// =============================================================================

let lastTrackedFullPath: string | null = null;
let lastTrackTime: number = 0;
const TRACK_DEBOUNCE_MS = 500; // Minimum time between tracks for same path

// =============================================================================
// Tracker Component
// =============================================================================

interface AnalyticsTrackerProps {
  statusCode?: number;
}

/**
 * Analytics Tracker that works both inside and outside SessionProvider.
 * Wraps itself in a SessionProvider when needed (e.g., in not-found.tsx).
 */
export default function AnalyticsTracker({ statusCode }: AnalyticsTrackerProps) {
  return (
    <SafeSessionWrapper>
      <AnalyticsTrackerInner statusCode={statusCode} />
    </SafeSessionWrapper>
  );
}
