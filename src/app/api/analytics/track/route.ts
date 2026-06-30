/**
 * Analytics Tracking API
 * ======================
 *
 * Receives page view events from the client-side tracker.
 * Privacy-focused: No IP logging, minimal data collection.
 */

import { NextRequest, NextResponse } from 'next/server';
import { recordPageView } from '@/db/analytics';

// =============================================================================
// Bot Detection
// =============================================================================

const BOT_PATTERNS = [
  /bot/i,
  /spider/i,
  /crawl/i,
  /slurp/i,
  /mediapartners/i,
  /googlebot/i,
  /bingbot/i,
  /yandex/i,
  /baidu/i,
  /duckduckbot/i,
  /facebookexternalhit/i,
  /twitterbot/i,
  /linkedinbot/i,
  /discordbot/i,
  /slackbot/i,
  /whatsapp/i,
  /telegrambot/i,
  /pingdom/i,
  /uptimerobot/i,
  /headless/i,
  /phantom/i,
  /selenium/i,
  /puppeteer/i,
  /lighthouse/i,
  /pagespeed/i,
];

function isBot(userAgent: string | null): boolean {
  if (!userAgent) return false;
  return BOT_PATTERNS.some((pattern) => pattern.test(userAgent));
}

// =============================================================================
// Device Detection
// =============================================================================

function getDeviceType(userAgent: string | null): string {
  if (!userAgent) return 'unknown';
  if (/mobile/i.test(userAgent)) return 'mobile';
  if (/tablet|ipad/i.test(userAgent)) return 'tablet';
  return 'desktop';
}

function getBrowser(userAgent: string | null): string {
  if (!userAgent) return 'unknown';
  if (/firefox/i.test(userAgent)) return 'Firefox';
  if (/edg/i.test(userAgent)) return 'Edge';
  if (/chrome/i.test(userAgent)) return 'Chrome';
  if (/safari/i.test(userAgent)) return 'Safari';
  if (/opera|opr/i.test(userAgent)) return 'Opera';
  return 'Other';
}

function getOS(userAgent: string | null): string {
  if (!userAgent) return 'unknown';
  if (/windows/i.test(userAgent)) return 'Windows';
  if (/macintosh|mac os/i.test(userAgent)) return 'macOS';
  if (/linux/i.test(userAgent)) return 'Linux';
  if (/android/i.test(userAgent)) return 'Android';
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'iOS';
  return 'Other';
}

// =============================================================================
// Rate Limiting
// =============================================================================

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 30; // Max 30 events per minute per session

function isRateLimited(sessionId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(sessionId);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(sessionId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return false;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return true;
  }

  entry.count++;
  return false;
}

// =============================================================================
// Input Validation
// =============================================================================

interface TrackingPayload {
  sessionId: string;
  pagePath: string;
  pageTitle?: string;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  statusCode?: number;
}

function validatePayload(body: unknown): TrackingPayload | null {
  if (!body || typeof body !== 'object') return null;

  const payload = body as Record<string, unknown>;

  // Required fields
  if (typeof payload.sessionId !== 'string' || payload.sessionId.length < 10) {
    return null;
  }
  if (typeof payload.pagePath !== 'string' || payload.pagePath.length === 0) {
    return null;
  }

  return {
    sessionId: payload.sessionId,
    pagePath: payload.pagePath,
    pageTitle: typeof payload.pageTitle === 'string' ? payload.pageTitle : undefined,
    referrer: typeof payload.referrer === 'string' ? payload.referrer : undefined,
    utmSource: typeof payload.utmSource === 'string' ? payload.utmSource : undefined,
    utmMedium: typeof payload.utmMedium === 'string' ? payload.utmMedium : undefined,
    utmCampaign: typeof payload.utmCampaign === 'string' ? payload.utmCampaign : undefined,
    utmTerm: typeof payload.utmTerm === 'string' ? payload.utmTerm : undefined,
    utmContent: typeof payload.utmContent === 'string' ? payload.utmContent : undefined,
    statusCode: typeof payload.statusCode === 'number' ? payload.statusCode : undefined,
  };
}

// =============================================================================
// Route Handler
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    // Parse body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    // Validate payload
    const payload = validatePayload(body);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    // Rate limit check
    if (isRateLimited(payload.sessionId)) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    // Get request metadata
    const userAgent = request.headers.get('user-agent');
    const acceptLanguage = request.headers.get('accept-language');

    // Extract country from Cloudflare/Vercel headers or Accept-Language
    let country: string | undefined;
    const cfCountry = request.headers.get('cf-ipcountry');
    const vercelCountry = request.headers.get('x-vercel-ip-country');
    if (cfCountry && cfCountry.length === 2) {
      country = cfCountry.toUpperCase();
    } else if (vercelCountry && vercelCountry.length === 2) {
      country = vercelCountry.toUpperCase();
    } else if (acceptLanguage) {
      // Try to extract from Accept-Language (e.g., "en-US" -> "US")
      const match = acceptLanguage.match(/[a-z]{2}-([A-Z]{2})/);
      if (match) {
        country = match[1];
      }
    }

    // Record the page view
    await recordPageView({
      sessionId: payload.sessionId,
      pagePath: payload.pagePath,
      pageTitle: payload.pageTitle,
      referrerUrl: payload.referrer,
      utmSource: payload.utmSource,
      utmMedium: payload.utmMedium,
      utmCampaign: payload.utmCampaign,
      utmTerm: payload.utmTerm,
      utmContent: payload.utmContent,
      deviceType: getDeviceType(userAgent),
      browser: getBrowser(userAgent),
      os: getOS(userAgent),
      country,
      isBot: isBot(userAgent),
      statusCode: payload.statusCode,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Analytics tracking error:', error);
    // Don't expose internal errors, fail silently
    return NextResponse.json({ success: true });
  }
}

// Health check
export async function GET() {
  return NextResponse.json({ status: 'ok' });
}
