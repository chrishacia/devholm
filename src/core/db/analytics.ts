/**
 * Analytics Database Layer
 * ========================
 *
 * Manages page views, referrer tracking, and aggregated statistics.
 * Privacy-focused: No PII stored, data is aggregated for insights.
 */

import { getDb } from './index';

// =============================================================================
// Types
// =============================================================================

export interface PageView {
  id: string;
  sessionId: string;
  pagePath: string;
  pageTitle: string | null;
  referrerUrl: string | null;
  referrerDomain: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  deviceType: string | null;
  browser: string | null;
  os: string | null;
  country: string | null;
  isBot: boolean;
  statusCode: number;
  createdAt: Date;
}

export interface PageViewInput {
  sessionId: string;
  pagePath: string;
  pageTitle?: string;
  referrerUrl?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  deviceType?: string;
  browser?: string;
  os?: string;
  country?: string;
  isBot?: boolean;
  statusCode?: number;
}

export interface DailyStats {
  date: string;
  pagePath: string;
  referrerDomain: string | null;
  pageViews: number;
  uniqueVisitors: number;
}

export interface ReferrerStats {
  id: string;
  referrerDomain: string;
  referrerUrlSample: string | null;
  totalVisits: number;
  uniqueVisitors: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

export interface AnalyticsSummary {
  totalPageViews: number;
  uniqueVisitors: number;
  total404s: number;
  topPages: { path: string; views: number; uniqueVisitors: number }[];
  topReferrers: { domain: string; visits: number; uniqueVisitors: number }[];
  recentReferrers: { domain: string; url: string | null; visitedAt: Date }[];
  viewsByDay: { date: string; views: number; visitors: number }[];
  trafficSources: { source: string; visits: number }[];
  top404s: { path: string; hits: number; lastHit: Date }[];
}

export interface PaginatedPages {
  pages: { path: string; views: number; uniqueVisitors: number }[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface Paginated404s {
  errors: { path: string; hits: number; lastHit: Date; referrer: string | null }[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginatedReferrers {
  referrers: { domain: string; visits: number; uniqueVisitors: number; lastVisit: Date }[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PageReferrers {
  pagePath: string;
  referrers: { domain: string; visits: number; uniqueVisitors: number; lastVisit: Date }[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ReferrerPages {
  referrerDomain: string;
  pages: { path: string; views: number; uniqueVisitors: number; lastVisit: Date }[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SessionDepthBucket {
  bucket: '1' | '2-3' | '4-6' | '7-10' | '11+';
  sessions: number;
}

export interface HourlyTrafficPoint {
  hour: number;
  views: number;
  visitors: number;
}

export interface CampaignPerformanceRow {
  campaign: string;
  source: string | null;
  medium: string | null;
  visits: number;
  uniqueVisitors: number;
}

export interface BreakdownRow {
  label: string;
  visits: number;
  uniqueVisitors: number;
}

export interface StatusCodeRow {
  statusCode: number;
  hits: number;
}

export interface DataHealth {
  latestEventAt: Date | null;
  latestRollupAt: Date | null;
  rawRetentionDays: number;
  persistentVisitorIdEnabled: boolean;
}

export interface EnhancedAnalyticsSummary {
  // Core totals
  totalPageViews: number;
  uniqueVisitors: number;
  total404s: number;
  pagesPerVisit: number;
  bounceRate: number;

  // Content
  topPages: { path: string; views: number; uniqueVisitors: number }[];
  entryPages: { path: string; sessions: number }[];
  exitPages: { path: string; sessions: number }[];

  // Referrers
  topReferrers: { domain: string | null; visits: number; uniqueVisitors: number }[];
  recentReferrers: { domain: string; url: string | null; visitedAt: Date }[];

  // Time trends
  viewsByDay: { date: string; views: number; visitors: number }[];
  hourlyTraffic: HourlyTrafficPoint[];
  peakHours: { hour: number; views: number }[];

  // Session behavior
  sessionDepth: SessionDepthBucket[];

  // Attribution
  trafficSources: { source: string; visits: number }[];
  campaignPerformance: CampaignPerformanceRow[];

  // Audience technology
  deviceBreakdown: BreakdownRow[];
  browserBreakdown: BreakdownRow[];
  osBreakdown: BreakdownRow[];

  // Site quality
  statusCodeMix: StatusCodeRow[];
  top404s: { path: string; hits: number; lastHit: Date }[];

  // Operations
  dataHealth: DataHealth;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Safely parse a value to number, handling null, undefined, BigInt, and string inputs
 */
function toNumber(value: unknown, defaultValue: number = 0): number {
  if (value === null || value === undefined) return defaultValue;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }
  return defaultValue;
}

/**
 * Extract domain from a URL
 */
function extractDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Sanitize and validate input strings
 */
function sanitizeString(str: string | undefined, maxLength: number): string | null {
  if (!str || typeof str !== 'string') return null;
  return str.slice(0, maxLength).trim() || null;
}

/**
 * Sensitive query parameter names to strip from referrer URLs before storage.
 * Defense in depth: referrer URLs from external sites may contain sensitive tokens.
 */
const SENSITIVE_PARAMS = new Set([
  'token',
  'code',
  'password',
  'email',
  'session',
  'auth',
  'key',
  'secret',
  'access_token',
  'refresh_token',
  'id_token',
  'api_key',
  'apikey',
  'authorization',
  'passwd',
  'pass',
  'credential',
  'credentials',
]);

/**
 * Strip sensitive query parameters from a URL string before storage.
 * Returns the original string if it cannot be parsed as a URL.
 */
export function scrubSensitiveReferrerParams(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const toDelete: string[] = [];
    parsed.searchParams.forEach((_, key) => {
      if (SENSITIVE_PARAMS.has(key.toLowerCase())) {
        toDelete.push(key);
      }
    });
    toDelete.forEach((key) => parsed.searchParams.delete(key));
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Format a number compactly for display (1500 → 1.5k, 1500000 → 1.5M)
 */
export function formatCompactNumber(value: number): string {
  if (value >= 1_000_000) return `${Number((value / 1_000_000).toFixed(1))}M`;
  if (value >= 1_000) return `${Number((value / 1_000).toFixed(1))}k`;
  return String(value);
}

// =============================================================================
// Page View Operations
// =============================================================================

/**
 * Record a page view
 */
export async function recordPageView(input: PageViewInput): Promise<void> {
  const db = getDb();

  const referrerDomain = extractDomain(input.referrerUrl);
  const cleanReferrerUrl = scrubSensitiveReferrerParams(input.referrerUrl);
  const pagePath = sanitizeString(input.pagePath, 500) || '/';
  const sessionId = sanitizeString(input.sessionId, 64);
  const now = new Date();

  // Insert page view
  await db('analytics_page_views').insert({
    session_id: sessionId,
    page_path: pagePath,
    page_title: sanitizeString(input.pageTitle, 300),
    referrer_url: sanitizeString(cleanReferrerUrl ?? undefined, 2000),
    referrer_domain: referrerDomain,
    utm_source: sanitizeString(input.utmSource, 100),
    utm_medium: sanitizeString(input.utmMedium, 100),
    utm_campaign: sanitizeString(input.utmCampaign, 100),
    utm_term: sanitizeString(input.utmTerm, 100),
    utm_content: sanitizeString(input.utmContent, 100),
    device_type: sanitizeString(input.deviceType, 20),
    browser: sanitizeString(input.browser, 50),
    os: sanitizeString(input.os, 50),
    country: sanitizeString(input.country, 2),
    is_bot: input.isBot || false,
    status_code: input.statusCode || 200,
  });

  // Upsert session summary for non-bot traffic so session-level metrics stay current
  if (!input.isBot && sessionId) {
    try {
      await db('analytics_sessions')
        .insert({
          session_id: sessionId,
          started_at: now,
          ended_at: now,
          first_page_path: pagePath,
          last_page_path: pagePath,
          page_views: 1,
          bounced: true,
          referrer_domain: referrerDomain,
          utm_source: sanitizeString(input.utmSource, 100),
          utm_medium: sanitizeString(input.utmMedium, 100),
          utm_campaign: sanitizeString(input.utmCampaign, 100),
          device_type: sanitizeString(input.deviceType, 20),
          browser: sanitizeString(input.browser, 50),
          os: sanitizeString(input.os, 50),
          country: sanitizeString(input.country, 2),
          is_bot: false,
        })
        .onConflict('session_id')
        .merge({
          ended_at: now,
          last_page_path: pagePath,
          page_views: db.raw('analytics_sessions.page_views + 1'),
          bounced: false,
        });
    } catch (err) {
      // Session tracking is non-critical — page view was already recorded
      console.warn(
        'Failed to upsert session summary:',
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  // Update referrer stats if we have a referrer
  if (referrerDomain) {
    await db('analytics_referrers')
      .insert({
        referrer_domain: referrerDomain,
        referrer_url_sample: sanitizeString(cleanReferrerUrl ?? undefined, 2000),
        total_visits: 1,
        unique_visitors: 1,
        first_seen_at: now,
        last_seen_at: now,
      })
      .onConflict('referrer_domain')
      .merge({
        total_visits: db.raw('analytics_referrers.total_visits + 1'),
        referrer_url_sample: sanitizeString(cleanReferrerUrl ?? undefined, 2000),
        last_seen_at: now,
      });
  }

  // Update daily stats
  const today = now.toISOString().split('T')[0];
  await db('analytics_daily_stats')
    .insert({
      date: today,
      page_path: pagePath,
      referrer_domain: referrerDomain,
      page_views: 1,
      unique_visitors: 1,
      updated_at: now,
    })
    .onConflict(['date', 'page_path', 'referrer_domain'])
    .merge({
      page_views: db.raw('analytics_daily_stats.page_views + 1'),
      updated_at: now,
    });

  // Update daily rollup (non-critical)
  try {
    const isError = (input.statusCode ?? 200) >= 400;
    const is404 = input.statusCode === 404;
    const isBot = input.isBot || false;

    await db('analytics_daily_rollups')
      .insert({
        date: today,
        total_page_views: isBot ? 0 : 1,
        unique_sessions: 0, // Computed from raw data
        bounced_sessions: 0,
        total_404s: is404 && !isBot ? 1 : 0,
        total_errors: isError && !isBot ? 1 : 0,
        bot_events: isBot ? 1 : 0,
        updated_at: now,
      })
      .onConflict('date')
      .merge({
        total_page_views: db.raw(`analytics_daily_rollups.total_page_views + ${isBot ? 0 : 1}`),
        total_404s: db.raw(`analytics_daily_rollups.total_404s + ${is404 && !isBot ? 1 : 0}`),
        total_errors: db.raw(`analytics_daily_rollups.total_errors + ${isError && !isBot ? 1 : 0}`),
        bot_events: db.raw(`analytics_daily_rollups.bot_events + ${isBot ? 1 : 0}`),
        updated_at: now,
      });
  } catch (err) {
    console.warn(
      'Failed to update daily rollup:',
      err instanceof Error ? err.message : String(err)
    );
  }
}
// =============================================================================
// Analytics Queries
// =============================================================================

/**
 * Get the full enhanced analytics summary for a date range.
 * Runs all sub-queries in parallel for performance.
 */
export async function getAnalyticsSummary(
  startDate: Date,
  endDate: Date
): Promise<EnhancedAnalyticsSummary> {
  const db = getDb();
  const start = startDate;
  const end = endDate;
  const startStr = start.toISOString().split('T')[0];
  const endStr = end.toISOString().split('T')[0];

  const [
    totals,
    topPages,
    topReferrers,
    recentReferrers,
    viewsByDay,
    trafficSources,
    total404Result,
    top404s,
    bounceRaw,
    sessionDepthRaw,
    entryPagesRaw,
    exitPagesRaw,
    hourlyRaw,
    campaignRaw,
    deviceRaw,
    browserRaw,
    osRaw,
    statusCodeRaw,
    dataHealthRaw,
  ] = await Promise.all([
    // Core totals
    db('analytics_page_views')
      .where('created_at', '>=', start)
      .where('created_at', '<=', end)
      .where('is_bot', false)
      .select(
        db.raw('COUNT(*) as total_views'),
        db.raw('COUNT(DISTINCT session_id) as unique_visitors')
      )
      .first(),

    // Top pages (successful views only)
    db('analytics_page_views')
      .where('created_at', '>=', start)
      .where('created_at', '<=', end)
      .where('is_bot', false)
      .where('status_code', 200)
      .groupBy('page_path')
      .select(
        'page_path as path',
        db.raw('COUNT(*) as views'),
        db.raw('COUNT(DISTINCT session_id) as unique_visitors')
      )
      .orderBy('views', 'desc')
      .limit(10),

    // Top referrers
    db('analytics_page_views')
      .where('created_at', '>=', start)
      .where('created_at', '<=', end)
      .where('is_bot', false)
      .whereNotNull('referrer_domain')
      .groupBy('referrer_domain')
      .select(
        'referrer_domain as domain',
        db.raw('COUNT(*) as visits'),
        db.raw('COUNT(DISTINCT session_id) as unique_visitors')
      )
      .orderBy('visits', 'desc')
      .limit(10),

    // Recent referrers
    db('analytics_page_views')
      .where('created_at', '>=', start)
      .where('created_at', '<=', end)
      .where('is_bot', false)
      .whereNotNull('referrer_domain')
      .select('referrer_domain as domain', 'referrer_url as url', 'created_at as visitedAt')
      .orderBy('created_at', 'desc')
      .limit(20),

    // Views by day (from daily stats rollup)
    db('analytics_daily_stats')
      .where('date', '>=', startStr)
      .where('date', '<=', endStr)
      .groupBy('date')
      .select(
        'date',
        db.raw('SUM(page_views) as views'),
        db.raw('SUM(unique_visitors) as visitors')
      )
      .orderBy('date', 'asc'),

    // Traffic sources (UTM source → referrer domain → direct)
    db('analytics_page_views')
      .where('created_at', '>=', start)
      .where('created_at', '<=', end)
      .where('is_bot', false)
      .select(
        db.raw(`
          CASE
            WHEN utm_source IS NOT NULL THEN utm_source
            WHEN referrer_domain IS NOT NULL THEN referrer_domain
            ELSE 'direct'
          END as source
        `),
        db.raw('COUNT(*) as visits')
      )
      .groupBy('source')
      .orderBy('visits', 'desc')
      .limit(15),

    // Total 404s
    db('analytics_page_views')
      .where('created_at', '>=', start)
      .where('created_at', '<=', end)
      .where('is_bot', false)
      .where('status_code', 404)
      .count('* as count')
      .first(),

    // Top 404 paths
    db('analytics_page_views')
      .where('created_at', '>=', start)
      .where('created_at', '<=', end)
      .where('is_bot', false)
      .where('status_code', 404)
      .groupBy('page_path')
      .select(
        'page_path as path',
        db.raw('COUNT(*) as hits'),
        db.raw('MAX(created_at) as last_hit')
      )
      .orderBy('hits', 'desc')
      .limit(10),

    // Bounce rate: sessions with exactly 1 successful page view
    db.raw<{ rows: Array<{ total_sessions: string; bounced_sessions: string }> }>(
      `
      WITH session_counts AS (
        SELECT session_id, COUNT(*) as cnt
        FROM analytics_page_views
        WHERE created_at >= ? AND created_at <= ?
          AND is_bot = false AND status_code = 200
        GROUP BY session_id
      )
      SELECT
        COUNT(*)::integer as total_sessions,
        COUNT(*) FILTER (WHERE cnt = 1)::integer as bounced_sessions
      FROM session_counts
      `,
      [start, end]
    ),

    // Session depth buckets
    db.raw<{ rows: Array<{ bucket: string; sessions: string }> }>(
      `
      WITH session_counts AS (
        SELECT session_id, COUNT(*) as cnt
        FROM analytics_page_views
        WHERE created_at >= ? AND created_at <= ?
          AND is_bot = false AND status_code = 200
        GROUP BY session_id
      ),
      bucketed AS (
        SELECT
          CASE
            WHEN cnt = 1 THEN '1'
            WHEN cnt BETWEEN 2 AND 3 THEN '2-3'
            WHEN cnt BETWEEN 4 AND 6 THEN '4-6'
            WHEN cnt BETWEEN 7 AND 10 THEN '7-10'
            ELSE '11+'
          END as bucket
        FROM session_counts
      )
      SELECT bucket, COUNT(*)::integer as sessions
      FROM bucketed
      GROUP BY bucket
      ORDER BY
        CASE bucket
          WHEN '1' THEN 1 WHEN '2-3' THEN 2 WHEN '4-6' THEN 3
          WHEN '7-10' THEN 4 ELSE 5
        END
      `,
      [start, end]
    ),

    // Entry pages: first successful page per session
    db.raw<{ rows: Array<{ path: string; sessions: string }> }>(
      `
      WITH first_views AS (
        SELECT DISTINCT ON (session_id) session_id, page_path
        FROM analytics_page_views
        WHERE created_at >= ? AND created_at <= ?
          AND is_bot = false AND status_code = 200
        ORDER BY session_id, created_at ASC
      )
      SELECT page_path as path, COUNT(*)::integer as sessions
      FROM first_views
      GROUP BY page_path
      ORDER BY sessions DESC
      LIMIT 10
      `,
      [start, end]
    ),

    // Exit pages: last successful page per session
    db.raw<{ rows: Array<{ path: string; sessions: string }> }>(
      `
      WITH last_views AS (
        SELECT DISTINCT ON (session_id) session_id, page_path
        FROM analytics_page_views
        WHERE created_at >= ? AND created_at <= ?
          AND is_bot = false AND status_code = 200
        ORDER BY session_id, created_at DESC
      )
      SELECT page_path as path, COUNT(*)::integer as sessions
      FROM last_views
      GROUP BY page_path
      ORDER BY sessions DESC
      LIMIT 10
      `,
      [start, end]
    ),

    // Hourly traffic distribution
    db.raw<{ rows: Array<{ hour: string; views: string; visitors: string }> }>(
      `
      SELECT
        EXTRACT(HOUR FROM created_at)::integer as hour,
        COUNT(*)::integer as views,
        COUNT(DISTINCT session_id)::integer as visitors
      FROM analytics_page_views
      WHERE created_at >= ? AND created_at <= ?
        AND is_bot = false
      GROUP BY EXTRACT(HOUR FROM created_at)
      ORDER BY hour ASC
      `,
      [start, end]
    ),

    // Campaign performance
    db('analytics_page_views')
      .where('created_at', '>=', start)
      .where('created_at', '<=', end)
      .where('is_bot', false)
      .whereNotNull('utm_campaign')
      .groupBy(['utm_campaign', 'utm_source', 'utm_medium'])
      .select(
        'utm_campaign as campaign',
        'utm_source as source',
        'utm_medium as medium',
        db.raw('COUNT(*) as visits'),
        db.raw('COUNT(DISTINCT session_id) as unique_visitors')
      )
      .orderBy('visits', 'desc')
      .limit(20),

    // Device breakdown
    db('analytics_page_views')
      .where('created_at', '>=', start)
      .where('created_at', '<=', end)
      .where('is_bot', false)
      .where('status_code', 200)
      .groupBy('device_type')
      .select(
        db.raw("COALESCE(device_type, 'unknown') as device_type"),
        db.raw('COUNT(*) as visits'),
        db.raw('COUNT(DISTINCT session_id) as unique_visitors')
      )
      .orderBy('visits', 'desc'),

    // Browser breakdown
    db('analytics_page_views')
      .where('created_at', '>=', start)
      .where('created_at', '<=', end)
      .where('is_bot', false)
      .where('status_code', 200)
      .groupBy('browser')
      .select(
        db.raw("COALESCE(browser, 'unknown') as browser"),
        db.raw('COUNT(*) as visits'),
        db.raw('COUNT(DISTINCT session_id) as unique_visitors')
      )
      .orderBy('visits', 'desc'),

    // OS breakdown
    db('analytics_page_views')
      .where('created_at', '>=', start)
      .where('created_at', '<=', end)
      .where('is_bot', false)
      .where('status_code', 200)
      .groupBy('os')
      .select(
        db.raw("COALESCE(os, 'unknown') as os"),
        db.raw('COUNT(*) as visits'),
        db.raw('COUNT(DISTINCT session_id) as unique_visitors')
      )
      .orderBy('visits', 'desc'),

    // Status code mix (all non-bot traffic)
    db('analytics_page_views')
      .where('created_at', '>=', start)
      .where('created_at', '<=', end)
      .where('is_bot', false)
      .groupBy('status_code')
      .select('status_code', db.raw('COUNT(*) as hits'))
      .orderBy('hits', 'desc'),

    // Data health
    Promise.all([
      db('analytics_page_views').max('created_at as latest').first(),
      db('analytics_daily_rollups').max('updated_at as latest').first(),
    ]),
  ]);

  const totalSessions = toNumber(bounceRaw.rows[0]?.total_sessions);
  const bouncedSessions = toNumber(bounceRaw.rows[0]?.bounced_sessions);
  const bounceRate =
    totalSessions > 0 ? Math.round((bouncedSessions / totalSessions) * 1000) / 10 : 0;

  const totalViews = toNumber(totals?.total_views);
  const uniqueVisitors = toNumber(totals?.unique_visitors);
  const pagesPerVisit =
    uniqueVisitors > 0 ? Math.round((totalViews / uniqueVisitors) * 10) / 10 : 0;

  const [latestEventRow, latestRollupRow] = dataHealthRaw as [
    { latest: Date | null } | undefined,
    { latest: Date | null } | undefined,
  ];

  const allHours: HourlyTrafficPoint[] = hourlyRaw.rows.map((r) => ({
    hour: toNumber(r.hour),
    views: toNumber(r.views),
    visitors: toNumber(r.visitors),
  }));

  return {
    totalPageViews: totalViews,
    uniqueVisitors,
    total404s: toNumber(total404Result?.count),
    pagesPerVisit,
    bounceRate,

    topPages: topPages.map((p) => ({
      path: p.path,
      views: toNumber(p.views),
      uniqueVisitors: toNumber(p.unique_visitors),
    })),
    entryPages: entryPagesRaw.rows.map((r) => ({
      path: r.path,
      sessions: toNumber(r.sessions),
    })),
    exitPages: exitPagesRaw.rows.map((r) => ({
      path: r.path,
      sessions: toNumber(r.sessions),
    })),

    topReferrers: topReferrers.map((r) => ({
      domain: r.domain,
      visits: toNumber(r.visits),
      uniqueVisitors: toNumber(r.unique_visitors),
    })),
    recentReferrers: recentReferrers.map((r) => ({
      domain: r.domain,
      url: r.url,
      visitedAt: r.visitedAt,
    })),

    viewsByDay: viewsByDay.map((d) => ({
      date: d.date,
      views: toNumber(d.views),
      visitors: toNumber(d.visitors),
    })),
    hourlyTraffic: allHours,
    peakHours: [...allHours].sort((a, b) => b.views - a.views).slice(0, 3),

    sessionDepth: sessionDepthRaw.rows.map((r) => ({
      bucket: r.bucket as SessionDepthBucket['bucket'],
      sessions: toNumber(r.sessions),
    })),

    trafficSources: trafficSources.map((s) => ({
      source: s.source,
      visits: toNumber(s.visits),
    })),
    campaignPerformance: campaignRaw.map((c) => ({
      campaign: c.campaign,
      source: c.source ?? null,
      medium: c.medium ?? null,
      visits: toNumber(c.visits),
      uniqueVisitors: toNumber(c.unique_visitors),
    })),

    deviceBreakdown: deviceRaw.map((d) => ({
      label: d.device_type as string,
      visits: toNumber(d.visits),
      uniqueVisitors: toNumber(d.unique_visitors),
    })),
    browserBreakdown: browserRaw.map((b) => ({
      label: b.browser as string,
      visits: toNumber(b.visits),
      uniqueVisitors: toNumber(b.unique_visitors),
    })),
    osBreakdown: osRaw.map((o) => ({
      label: o.os as string,
      visits: toNumber(o.visits),
      uniqueVisitors: toNumber(o.unique_visitors),
    })),

    statusCodeMix: statusCodeRaw.map((s) => ({
      statusCode: toNumber(s.status_code),
      hits: toNumber(s.hits),
    })),
    top404s: top404s.map((e) => ({
      path: e.path,
      hits: toNumber(e.hits),
      lastHit: e.last_hit,
    })),

    dataHealth: {
      latestEventAt: latestEventRow?.latest ?? null,
      latestRollupAt: latestRollupRow?.latest ?? null,
      rawRetentionDays: 90,
      persistentVisitorIdEnabled: false,
    },
  };
}

/**
 * Get all-time referrer stats
 */
export async function getReferrerStats(limit: number = 50): Promise<ReferrerStats[]> {
  const db = getDb();

  const referrers = await db('analytics_referrers')
    .select('*')
    .orderBy('total_visits', 'desc')
    .limit(limit);

  return referrers.map((r) => ({
    id: r.id,
    referrerDomain: r.referrer_domain,
    referrerUrlSample: r.referrer_url_sample,
    totalVisits: r.total_visits,
    uniqueVisitors: r.unique_visitors,
    firstSeenAt: r.first_seen_at,
    lastSeenAt: r.last_seen_at,
  }));
}

/**
 * Get page view trends for a specific page
 */
export async function getPageTrends(
  pagePath: string,
  days: number = 30
): Promise<{ date: string; views: number }[]> {
  const db = getDb();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const trends = await db('analytics_daily_stats')
    .where('page_path', pagePath)
    .where('date', '>=', startDate.toISOString().split('T')[0])
    .groupBy('date')
    .select('date', db.raw('SUM(page_views) as views'))
    .orderBy('date', 'asc');

  return trends.map((t) => ({
    date: t.date,
    views: toNumber(t.views),
  }));
}

/**
 * Get referrer details with their landing pages
 */
export async function getReferrerDetails(
  domain: string,
  limit: number = 50
): Promise<{ pagePath: string; visits: number; lastVisit: Date }[]> {
  const db = getDb();

  const details = await db('analytics_page_views')
    .where('referrer_domain', domain)
    .where('is_bot', false)
    .groupBy('page_path')
    .select(
      'page_path as pagePath',
      db.raw('COUNT(*) as visits'),
      db.raw('MAX(created_at) as lastVisit')
    )
    .orderBy('visits', 'desc')
    .limit(limit);

  return details.map((d) => ({
    pagePath: d.pagePath,
    visits: toNumber(d.visits),
    lastVisit: d.lastVisit,
  }));
}

/**
 * Clean up old page view data (keep aggregates)
 */
export async function cleanupOldPageViews(daysToKeep: number = 90): Promise<number> {
  const db = getDb();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  const result = await db('analytics_page_views').where('created_at', '<', cutoffDate).delete();

  return result;
}

// =============================================================================
// Paginated Queries for Drill-Down
// =============================================================================

/**
 * Get paginated list of all pages with view counts
 */
export async function getAllPages(
  startDate: Date,
  endDate: Date,
  page: number = 1,
  limit: number = 50
): Promise<PaginatedPages> {
  const db = getDb();
  const offset = (page - 1) * limit;

  // Get total count
  const countResult = await db('analytics_page_views')
    .where('created_at', '>=', startDate)
    .where('created_at', '<=', endDate)
    .where('is_bot', false)
    .countDistinct('page_path as count')
    .first();

  const total = toNumber(countResult?.count);

  // Get paginated results
  const pages = await db('analytics_page_views')
    .where('created_at', '>=', startDate)
    .where('created_at', '<=', endDate)
    .where('is_bot', false)
    .groupBy('page_path')
    .select(
      'page_path as path',
      db.raw('COUNT(*) as views'),
      db.raw('COUNT(DISTINCT session_id) as unique_visitors')
    )
    .orderBy('views', 'desc')
    .limit(limit)
    .offset(offset);

  return {
    pages: pages.map((p) => ({
      path: p.path,
      views: toNumber(p.views),
      uniqueVisitors: toNumber(p.unique_visitors),
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Get paginated list of all 404 errors
 */
export async function getAll404s(
  startDate: Date,
  endDate: Date,
  page: number = 1,
  limit: number = 50
): Promise<Paginated404s> {
  const db = getDb();
  const offset = (page - 1) * limit;

  // Get total count of unique 404 paths
  const countResult = await db('analytics_page_views')
    .where('created_at', '>=', startDate)
    .where('created_at', '<=', endDate)
    .where('is_bot', false)
    .where('status_code', 404)
    .countDistinct('page_path as count')
    .first();

  const total = toNumber(countResult?.count);

  // Get paginated results with referrer info
  const errors = await db('analytics_page_views')
    .where('created_at', '>=', startDate)
    .where('created_at', '<=', endDate)
    .where('is_bot', false)
    .where('status_code', 404)
    .groupBy('page_path')
    .select(
      'page_path as path',
      db.raw('COUNT(*) as hits'),
      db.raw('MAX(created_at) as last_hit'),
      db.raw(
        '(SELECT referrer_domain FROM analytics_page_views pv2 WHERE pv2.page_path = analytics_page_views.page_path AND pv2.status_code = 404 ORDER BY pv2.created_at DESC LIMIT 1) as referrer'
      )
    )
    .orderBy('hits', 'desc')
    .limit(limit)
    .offset(offset);

  return {
    errors: errors.map((e) => ({
      path: e.path,
      hits: toNumber(e.hits),
      lastHit: e.last_hit,
      referrer: e.referrer,
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Get paginated list of all referrers
 */
export async function getAllReferrers(
  startDate: Date,
  endDate: Date,
  page: number = 1,
  limit: number = 50
): Promise<PaginatedReferrers> {
  const db = getDb();
  const offset = (page - 1) * limit;

  // Get total count
  const countResult = await db('analytics_page_views')
    .where('created_at', '>=', startDate)
    .where('created_at', '<=', endDate)
    .where('is_bot', false)
    .whereNotNull('referrer_domain')
    .countDistinct('referrer_domain as count')
    .first();

  const total = toNumber(countResult?.count);

  // Get paginated results
  const referrers = await db('analytics_page_views')
    .where('created_at', '>=', startDate)
    .where('created_at', '<=', endDate)
    .where('is_bot', false)
    .whereNotNull('referrer_domain')
    .groupBy('referrer_domain')
    .select(
      'referrer_domain as domain',
      db.raw('COUNT(*) as visits'),
      db.raw('COUNT(DISTINCT session_id) as unique_visitors'),
      db.raw('MAX(created_at) as last_visit')
    )
    .orderBy('visits', 'desc')
    .limit(limit)
    .offset(offset);

  return {
    referrers: referrers.map((r) => ({
      domain: r.domain,
      visits: toNumber(r.visits),
      uniqueVisitors: toNumber(r.unique_visitors),
      lastVisit: r.last_visit,
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

// =============================================================================
// Granular Drill-Down Queries
// =============================================================================

/**
 * Get referrers for a specific page (drill-down from pages view)
 */
export async function getReferrersForPage(
  pagePath: string,
  startDate: Date,
  endDate: Date,
  page: number = 1,
  limit: number = 50
): Promise<PageReferrers> {
  const db = getDb();
  const offset = (page - 1) * limit;

  // Get total count of unique referrers for this page
  const countResult = await db('analytics_page_views')
    .where('created_at', '>=', startDate)
    .where('created_at', '<=', endDate)
    .where('is_bot', false)
    .where('page_path', pagePath)
    .whereNotNull('referrer_domain')
    .countDistinct('referrer_domain as count')
    .first();

  const total = toNumber(countResult?.count);

  // Get paginated referrers for this specific page
  const referrers = await db('analytics_page_views')
    .where('created_at', '>=', startDate)
    .where('created_at', '<=', endDate)
    .where('is_bot', false)
    .where('page_path', pagePath)
    .whereNotNull('referrer_domain')
    .groupBy('referrer_domain')
    .select(
      'referrer_domain as domain',
      db.raw('COUNT(*) as visits'),
      db.raw('COUNT(DISTINCT session_id) as unique_visitors'),
      db.raw('MAX(created_at) as last_visit')
    )
    .orderBy('visits', 'desc')
    .limit(limit)
    .offset(offset);

  return {
    pagePath,
    referrers: referrers.map((r) => ({
      domain: r.domain,
      visits: toNumber(r.visits),
      uniqueVisitors: toNumber(r.unique_visitors),
      lastVisit: r.last_visit,
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Get pages visited from a specific referrer (drill-down from referrers view)
 */
export async function getPagesFromReferrer(
  referrerDomain: string,
  startDate: Date,
  endDate: Date,
  page: number = 1,
  limit: number = 50
): Promise<ReferrerPages> {
  const db = getDb();
  const offset = (page - 1) * limit;

  // Get total count of unique pages from this referrer
  const countResult = await db('analytics_page_views')
    .where('created_at', '>=', startDate)
    .where('created_at', '<=', endDate)
    .where('is_bot', false)
    .where('referrer_domain', referrerDomain)
    .countDistinct('page_path as count')
    .first();

  const total = toNumber(countResult?.count);

  // Get paginated pages visited from this referrer
  const pages = await db('analytics_page_views')
    .where('created_at', '>=', startDate)
    .where('created_at', '<=', endDate)
    .where('is_bot', false)
    .where('referrer_domain', referrerDomain)
    .groupBy('page_path')
    .select(
      'page_path as path',
      db.raw('COUNT(*) as views'),
      db.raw('COUNT(DISTINCT session_id) as unique_visitors'),
      db.raw('MAX(created_at) as last_visit')
    )
    .orderBy('views', 'desc')
    .limit(limit)
    .offset(offset);

  return {
    referrerDomain,
    pages: pages.map((p) => ({
      path: p.path,
      views: toNumber(p.views),
      uniqueVisitors: toNumber(p.unique_visitors),
      lastVisit: p.last_visit,
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}
