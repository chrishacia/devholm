# Analytics System Documentation

This document provides a comprehensive reference for the custom, privacy-first analytics system built into devholm.com. The system is entirely self-hosted — no third-party tracking services (Google Analytics, Mixpanel, etc.) are used.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Database Schema](#2-database-schema)
3. [Data Collection (Client-Side)](#3-data-collection-client-side)
4. [Tracking API Endpoint](#4-tracking-api-endpoint)
5. [Database Layer](#5-database-layer)
6. [Admin Dashboard API](#6-admin-dashboard-api)
7. [Admin Dashboard UI](#7-admin-dashboard-ui)
8. [Type Definitions](#8-type-definitions)
9. [Privacy & Security](#9-privacy--security)
10. [Data Retention](#10-data-retention)
11. [Telemetry Ping Script](#11-telemetry-ping-script)
12. [Flow Diagrams](#12-flow-diagrams)

---

## 1. Architecture Overview

The analytics system consists of four layers:

| Layer | Files | Responsibility |
|---|---|---|
| **Client** | `src/components/analytics/AnalyticsTracker.tsx` | Generates sessions, fires tracking events |
| **API – Ingest** | `src/app/api/analytics/track/route.ts` | Validates, rate-limits, bot-filters, stores events |
| **API – Read** | `src/app/api/analytics/route.ts` | Serves aggregated data to the admin dashboard |
| **Database** | `src/db/analytics.ts` | All read/write query logic against PostgreSQL |

Supporting infrastructure:
- **Migrations**: `src/db/migrations/20260118000003_add_analytics.ts`, `20260119000000_*.ts`
- **Types**: `src/types/index.ts`
- **Rate limiter**: `src/lib/rate-limiter.ts` (DB-backed, general-purpose)
- **Security helpers**: `src/lib/security.ts` (bot detection utilities)

---

## 2. Database Schema

Three PostgreSQL tables handle all analytics storage. Migrations are managed via Knex.

### `analytics_page_views`

The raw event log. Every non-bot page view is inserted here.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK, default `gen_random_uuid()` | Unique event ID |
| `session_id` | varchar(64) | NOT NULL | Anonymous session identifier |
| `page_path` | varchar(500) | NOT NULL | URL path visited (e.g. `/blog/my-post`) |
| `page_title` | varchar(300) | nullable | Page `<title>` at time of visit |
| `referrer_url` | varchar(2000) | nullable | Full referrer URL |
| `referrer_domain` | varchar(253) | nullable | Extracted hostname of referrer |
| `utm_source` | varchar(100) | nullable | UTM tracking parameter |
| `utm_medium` | varchar(100) | nullable | UTM tracking parameter |
| `utm_campaign` | varchar(100) | nullable | UTM tracking parameter |
| `utm_term` | varchar(100) | nullable | UTM tracking parameter |
| `utm_content` | varchar(100) | nullable | UTM tracking parameter |
| `device_type` | varchar(20) | nullable | `desktop`, `mobile`, or `tablet` |
| `browser` | varchar(50) | nullable | `Chrome`, `Firefox`, `Safari`, `Edge`, `Opera`, `Other` |
| `os` | varchar(50) | nullable | `Windows`, `macOS`, `Linux`, `Android`, `iOS`, `Other` |
| `country` | varchar(2) | nullable | ISO country code (from CDN headers or Accept-Language) |
| `is_bot` | boolean | default `false` | Bot detection flag |
| `status_code` | smallint | nullable | HTTP status of the response (e.g. `200`, `404`) |
| `created_at` | timestamptz | default `now()` | Event timestamp |

**Indexes:** `session_id`, `page_path`, `referrer_domain`, `created_at`, composite `(utm_source, utm_medium, utm_campaign)`, `status_code`

---

### `analytics_daily_stats`

Pre-aggregated daily statistics for fast dashboard queries. Upserted on each page view event.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | Unique row ID |
| `date` | date | NOT NULL | Aggregation date |
| `page_path` | varchar(500) | NOT NULL | Page being aggregated |
| `referrer_domain` | varchar(253) | NOT NULL | Referrer domain (or `''` for direct) |
| `page_views` | integer | default 0 | Total views for this date/path/referrer combo |
| `unique_visitors` | integer | default 0 | Distinct sessions for this combo |
| `updated_at` | timestamptz | default `now()` | Last updated time |

**Unique Constraint:** `(date, page_path, referrer_domain)` — enables efficient `INSERT ... ON CONFLICT DO UPDATE`.

**Indexes:** `date`, `page_path`, `referrer_domain`

---

### `analytics_referrers`

All-time aggregated referrer statistics. One row per unique referring domain.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | Unique row ID |
| `referrer_domain` | varchar(253) | UNIQUE, NOT NULL | The referring domain |
| `referrer_url_sample` | varchar(2000) | nullable | A sample full URL from this referrer |
| `total_visits` | integer | default 0 | All-time visit count |
| `unique_visitors` | integer | default 0 | All-time unique visitor count |
| `first_seen_at` | timestamptz | default `now()` | When this referrer was first observed |
| `last_seen_at` | timestamptz | default `now()` | Most recent visit from this referrer |

**Indexes:** `total_visits` (DESC sort), `last_seen_at`

---

## 3. Data Collection (Client-Side)

**File:** [src/components/analytics/AnalyticsTracker.tsx](src/components/analytics/AnalyticsTracker.tsx)

### Component Integration

The `<AnalyticsTracker />` component is injected globally in the root layout and on the 404 page:

```tsx
// src/app/layout.tsx
import { AnalyticsTracker } from '@/components/analytics';

<Suspense fallback={null}>
  <AnalyticsTracker />
</Suspense>

// src/app/not-found.tsx
<AnalyticsTracker statusCode={404} />
```

### Session Management

- A random anonymous session ID is generated on first page load.
- **Format:** `${Date.now()}-${Math.random()}`
- **Storage:** `sessionStorage` under the key `ch_analytics_session`
- The ID persists across client-side navigations within the same browser tab/session.
- No cookies. No cross-session persistence.

### Admin Exclusion

The component calls `useSession()` (NextAuth). If a valid session exists (i.e., the site owner is logged in), tracking is **skipped entirely**. This prevents admin activity from inflating analytics data.

### Page View Triggering

- Fires on initial mount and whenever `pathname` or `searchParams` changes (Next.js App Router navigation).
- **Debounce:** A minimum of 500ms must elapse before re-tracking the same path. This prevents duplicate events from React re-renders.
- A ref tracks whether a track is in-flight to avoid concurrent calls.

### Data Sent Per Event

| Field | Source |
|---|---|
| `sessionId` | `sessionStorage` value |
| `pagePath` | `usePathname()` |
| `pageTitle` | `document.title` |
| `referrer` | `document.referrer` (external only — internal same-domain referrers are excluded) |
| `utmSource` | `useSearchParams()` → `utm_source` |
| `utmMedium` | `useSearchParams()` → `utm_medium` |
| `utmCampaign` | `useSearchParams()` → `utm_campaign` |
| `utmTerm` | `useSearchParams()` → `utm_term` |
| `utmContent` | `useSearchParams()` → `utm_content` |
| `statusCode` | Prop (default `200`, or `404` for not-found pages) |

### Exported `trackPageView()` Utility

For manual tracking from other components:

```typescript
import { trackPageView } from '@/components/analytics';

await trackPageView({
  pagePath: '/some/path',
  pageTitle: 'Optional Title',
  statusCode: 200,
});
```

### `SessionProvider` Safety Wrapper

The component self-wraps in a `SessionProvider` if invoked outside the normal provider tree (e.g., `not-found.tsx`, `error.tsx`), preventing `useSession must be inside SessionProvider` runtime errors.

---

## 4. Tracking API Endpoint

**File:** [src/app/api/analytics/track/route.ts](src/app/api/analytics/track/route.ts)

**Route:** `POST /api/analytics/track`  
**Authentication:** None (public endpoint — intentional)

### Request Body

```typescript
interface TrackingPayload {
  sessionId: string;       // Required; min 10 characters
  pagePath: string;        // Required; non-empty
  pageTitle?: string;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  statusCode?: number;     // Default: 200
}
```

### Response

```json
{ "success": true }
```

Errors are swallowed server-side — the endpoint always returns `{ "success": true }` to avoid leaking implementation details (except for rate limit responses).

### Processing Pipeline

1. **Parse JSON** — Returns 400 on malformed body.
2. **Validate required fields** — `sessionId` (≥10 chars) and `pagePath` (non-empty) must be present.
3. **Rate limit check** — In-memory map keyed by `sessionId`. Limit: **30 events per 60-second window**. Returns HTTP `429` with `Retry-After` header if exceeded.
4. **Bot detection** — Checks `User-Agent` header against 24+ known bot/crawler patterns:
   - Generic: `bot`, `spider`, `crawl`, `slurp`, `mediapartners`
   - Search engines: `googlebot`, `bingbot`, `yandex`, `baidu`, `duckduckbot`
   - Social: `facebookexternalhit`, `twitterbot`, `linkedinbot`, `discordbot`, `slackbot`, `whatsapp`, `telegrambot`
   - Monitoring: `pingdom`, `uptimerobot`
   - Headless/testing: `headless`, `phantom`, `selenium`, `puppeteer`, `lighthouse`, `pagespeed`
5. **Device detection** from User-Agent:
   - `tablet` if `/tablet|ipad/i`
   - `mobile` if `/mobile/i`
   - `desktop` otherwise
6. **Browser detection** from User-Agent: Firefox → Edge → Chrome → Safari → Opera → Other
7. **OS detection** from User-Agent: Windows, macOS, Linux, Android, iOS, Other
8. **Country detection** (priority order):
   - Cloudflare header: `cf-ipcountry`
   - Vercel header: `x-vercel-ip-country`
   - Fallback: parses locale from `Accept-Language` header (e.g. `en-US` → `US`)
9. **Store event** — Calls `recordPageView()` in `src/db/analytics.ts`.

---

## 5. Database Layer

**File:** [src/db/analytics.ts](src/db/analytics.ts)

All database interactions go through named functions exported from this module. Knex is used as the query builder against a PostgreSQL connection pool.

### Write Functions

#### `recordPageView(input: PageViewInput): Promise<void>`

The core write function. Called by the tracking API after all server-side enrichment.

1. **Sanitizes** all string inputs — truncates to column max-length and trims whitespace. Returns `null` for empty/missing values.
2. **Extracts domain** from referrer URL using `new URL()`, lowercased.
3. **Inserts** a row into `analytics_page_views`.
4. **Upserts** `analytics_referrers` — increments `total_visits` and `unique_visitors` on conflict by `referrer_domain`.
5. **Upserts** `analytics_daily_stats` — increments `page_views` and `unique_visitors` on conflict by `(date, page_path, referrer_domain)`.

#### `cleanupOldPageViews(daysToKeep?: number): Promise<number>`

Deletes raw `analytics_page_views` rows older than `daysToKeep` days (default: **90 days**). Aggregated tables (`analytics_daily_stats`, `analytics_referrers`) are **never purged** — they represent all-time data.

---

### Read Functions

All read functions filter out bot events (`WHERE is_bot = false`) unless explicitly noted.

| Function | Description |
|---|---|
| `getAnalyticsSummary(startDate, endDate)` | Main dashboard query. Returns totals, top pages, top referrers, daily trend, traffic sources, top 404s. |
| `getReferrerStats(limit)` | Sorted list of all-time referrers from `analytics_referrers`. |
| `getPageTrends(pagePath, days)` | Day-by-day view count time series for a single page path. |
| `getReferrerDetails(domain, limit)` | Which pages were visited from a given referrer domain. |
| `getAllPages(startDate, endDate, page, limit)` | Paginated list of all pages with view and visitor counts. |
| `getAll404s(startDate, endDate, page, limit)` | Paginated list of 404 errors with hit counts and a referrer sample. |
| `getAllReferrers(startDate, endDate, page, limit)` | Paginated referrer list with visit counts and last-seen timestamps. |
| `getReferrersForPage(pagePath, startDate, endDate, page, limit)` | Drill-down: referrers that drove traffic to a specific page. |
| `getPagesFromReferrer(domain, startDate, endDate, page, limit)` | Drill-down: pages visited by traffic from a specific referrer domain. |

### BigInt Handling

PostgreSQL `COUNT()` aggregates return `bigint`, which Knex exposes as JavaScript `BigInt`. A `toNumber()` helper converts these safely:

```typescript
function toNumber(value: unknown, defaultValue = 0): number {
  if (typeof value === 'bigint') return Number(value);
  // ...
}
```

---

## 6. Admin Dashboard API

**File:** [src/app/api/analytics/route.ts](src/app/api/analytics/route.ts)

**Route:** `GET /api/analytics`  
**Authentication:** Requires a valid NextAuth session (admin only).

### Query Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `action` | string | `summary` | Which data to fetch (see table below) |
| `days` | number | `30` | Date range in days back from today |
| `page` | number | `1` | Pagination page |
| `limit` | number | `50` | Results per page |
| `pagePath` | string | — | Page path filter (for `page-trends`, `page-referrers`) |
| `domain` | string | — | Referrer domain filter (for `referrer-details`, `referrer-pages`) |

### Actions

| `action` Value | Calls | Response Shape |
|---|---|---|
| `summary` | `getAnalyticsSummary()` | `AnalyticsSummary` |
| `referrers` | `getReferrerStats()` | `{ referrers: ReferrerStats[] }` |
| `page-trends` | `getPageTrends()` | `{ trends: { date, views }[] }` |
| `referrer-details` | `getReferrerDetails()` | `{ details: { pagePath, visits, lastVisit }[] }` |
| `all-pages` | `getAllPages()` | `PaginatedPages` |
| `all-404s` | `getAll404s()` | `Paginated404s` |
| `all-referrers` | `getAllReferrers()` | `PaginatedReferrers` |
| `page-referrers` | `getReferrersForPage()` | `PageReferrers` |
| `referrer-pages` | `getPagesFromReferrer()` | `ReferrerPages` |

### `summary` Response Structure

```typescript
interface AnalyticsSummary {
  totalPageViews: number;
  uniqueVisitors: number;
  total404s: number;
  topPages: Array<{
    path: string;
    views: number;
    uniqueVisitors: number;
  }>;
  topReferrers: Array<{
    domain: string;
    visits: number;
    uniqueVisitors: number;
  }>;
  recentReferrers: Array<{
    domain: string;
    url: string | null;
    visitedAt: Date;
  }>;
  viewsByDay: Array<{
    date: string;
    views: number;
    visitors: number;
  }>;
  trafficSources: Array<{
    source: string;
    visits: number;
  }>;
  top404s: Array<{
    path: string;
    hits: number;
    lastHit: Date;
  }>;
}
```

---

## 7. Admin Dashboard UI

**File:** [src/app/admin/analytics/AnalyticsDashboard.tsx](src/app/admin/analytics/AnalyticsDashboard.tsx)  
**Route:** `/admin/analytics`

The dashboard is a client component that fetches from `/api/analytics` and renders a multi-panel view with drill-down capabilities.

### Summary Cards (top row)

| Card | Metric |
|---|---|
| Total Page Views | Aggregate views for selected period |
| Unique Visitors | Distinct session IDs for selected period |
| Top Referrer | Domain + visit count (highest traffic source) |
| Pages per Visit | Average (totalPageViews / uniqueVisitors) |

### Date Range Selector

Buttons to select: **7 days**, **30 days** (default), **90 days**, **365 days**. All queries and charts update when the range changes.

### Views Over Time Chart

- Bar chart for the last 14 days of data.
- Shows daily page views and visitor trends.
- Data from `viewsByDay` in the summary response.

### Traffic Sources Chart

- Horizontal bar chart showing top 5 traffic sources.
- Sources are derived from UTM parameters or referrer domains.
- Shows percentage share per source.

### Top Pages Table

| Column | Description |
|---|---|
| Page Path | Clickable path that opens the live page in a new tab |
| Views | Total page views |
| Unique Visitors | Distinct sessions |

- "View All" opens the **All Pages** drill-down (paginated, 50 per page).
- Clicking a row in All Pages navigates to the **Page Referrers** drill-down.

### Top Referrers Table

| Column | Description |
|---|---|
| Referrer Domain | Domain with favicon icon |
| Visits | Total visits from this domain |
| Unique Visitors | Distinct sessions |
| Last Visit | Relative timestamp (e.g. "2 days ago") |

- "View All" opens the **All Referrers** drill-down (paginated).
- Clicking a row navigates to the **Referrer Pages** drill-down.

### 404 Errors Table

| Column | Description |
|---|---|
| Requested URL | Monospace, error-colored path |
| Hits | Number of times this 404 was triggered |
| Last Hit | Timestamp of most recent occurrence |

- Shows count badge with total 404s.
- "View All" opens the **All 404s** drill-down, which includes the referrer that caused each 404.

### Drill-Down Navigation

The dashboard implements a navigation stack with breadcrumbs:

```
Dashboard
  └── All Pages
        └── [page path] → Page Referrers
  └── All Referrers
        └── [domain] → Referrer Pages
  └── All 404s
```

Back navigation is available at each level via a breadcrumb bar.

### Privacy Notice

A visible notice on the dashboard states: no IP addresses stored, no cookies used, no personally identifiable information collected.

---

## 8. Type Definitions

**File:** [src/types/index.ts](src/types/index.ts)

```typescript
// Raw event record (matches analytics_page_views table)
interface PageView {
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
  statusCode: number | null;
  createdAt: Date;
}

// Input shape for recordPageView()
interface PageViewInput {
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

// Pre-aggregated daily stats
interface DailyStats {
  date: string;
  pagePath: string;
  referrerDomain: string;
  pageViews: number;
  uniqueVisitors: number;
}

// All-time referrer aggregate
interface ReferrerStats {
  domain: string;
  urlSample: string | null;
  totalVisits: number;
  uniqueVisitors: number;
  firstSeen: Date;
  lastSeen: Date;
}

// Main dashboard summary (from getAnalyticsSummary)
interface AnalyticsSummary { /* see section 6 */ }

// Paginated response wrappers
interface PaginatedPages {
  pages: Array<{ path: string; views: number; uniqueVisitors: number }>;
  total: number;
  page: number;
  limit: number;
}

interface Paginated404s {
  pages: Array<{ path: string; hits: number; lastHit: Date; referrer: string | null }>;
  total: number;
  page: number;
  limit: number;
}

interface PaginatedReferrers {
  referrers: Array<{ domain: string; visits: number; uniqueVisitors: number; lastVisit: Date }>;
  total: number;
  page: number;
  limit: number;
}

// Drill-down types
interface PageReferrers {
  pagePath: string;
  referrers: Array<{ domain: string; visits: number; uniqueVisitors: number }>;
  total: number;
  page: number;
  limit: number;
}

interface ReferrerPages {
  domain: string;
  pages: Array<{ path: string; visits: number; uniqueVisitors: number }>;
  total: number;
  page: number;
  limit: number;
}
```

---

## 9. Privacy & Security

### Privacy Principles

| Principle | Implementation |
|---|---|
| No IP logging | IP is never read or stored. Country is derived from CDN headers only. |
| No cookies | Session ID is stored in `sessionStorage` (tab-scoped, not persistent). |
| No PII | No name, email, or identifiable data is collected at any point. |
| Admin exclusion | Authenticated users are automatically excluded from tracking. |
| Bot exclusion | Bot events are flagged and excluded from all dashboard queries. |

### Rate Limiting

The tracking endpoint uses an in-memory per-session rate limiter:

- **Limit:** 30 requests per 60-second window
- **Key:** `sessionId` from the request body
- **Storage:** `Map<string, { count: number; windowStart: number }>` (resets on server restart)
- **Response on exceed:** HTTP `429` with `Retry-After` header (seconds until window reset)

A separate general-purpose database-backed rate limiter exists in `src/lib/rate-limiter.ts` for other API routes.

### Bot Detection

The tracking API checks the `User-Agent` header against 24+ patterns (case-insensitive regex). Matched requests have `is_bot = true` set in the database — they are stored but excluded from all dashboard queries. Patterns include:

- **Generic crawlers:** `bot`, `spider`, `crawl`, `slurp`, `mediapartners`
- **Search engines:** `googlebot`, `bingbot`, `yandex`, `baidu`, `duckduckbot`
- **Social scrapers:** `facebookexternalhit`, `twitterbot`, `linkedinbot`, `discordbot`, `slackbot`, `whatsapp`, `telegrambot`
- **Uptime monitors:** `pingdom`, `uptimerobot`
- **Headless browsers/testing:** `headless`, `phantom`, `selenium`, `puppeteer`, `lighthouse`, `pagespeed`

### Input Sanitization

All string inputs from the tracking payload are sanitized before database insertion:

```typescript
function sanitizeString(str: string | undefined, maxLength: number): string | null {
  if (!str || typeof str !== 'string') return null;
  return str.slice(0, maxLength).trim() || null;
}
```

This prevents excessively long strings and trims whitespace. Combined with Knex parameterized queries, SQL injection is not possible.

### Dashboard Authentication

The read API (`GET /api/analytics`) requires a valid NextAuth session. Without authentication, requests are rejected with `401 Unauthorized`.

> **Note:** A TODO exists in the codebase to add role-based access control (RBAC) to restrict the analytics API to admin-role users only, rather than any authenticated session.

---

## 10. Data Retention

Raw page view events (`analytics_page_views`) are subject to cleanup via:

```typescript
await cleanupOldPageViews(90); // Delete events older than 90 days
```

- Default retention: **90 days** of raw events.
- Aggregated tables (`analytics_daily_stats`, `analytics_referrers`) are **never deleted** — they accumulate all-time statistics indefinitely.
- The cleanup function is not currently scheduled automatically; it must be called manually or wired into a cron job.

---

## 11. Telemetry Ping Script

**File:** [scripts/telemetry-ping.sh](scripts/telemetry-ping.sh)

This script is entirely separate from the user-facing analytics system. It is a project-level adoption tracking ping — used to optionally report that the project has been installed or started up.

**What is sent:**
- Domain / hostname
- Project version
- Event type (`install` or `startup`)
- Timestamp

**What is NOT sent:**
- IP addresses
- Database contents
- Environment variables
- Any personal information

**Opt-out:**
```bash
export TELEMETRY_DISABLED=true
```

**Behavior:**
- Uses `curl` with a 5-second connect timeout and 10-second max time.
- Fails silently — does not interrupt build or startup if the endpoint is unavailable.
- Target endpoint: `https://chrishacia.com/api/telemetry` (configurable via env var).

---

## 12. Flow Diagrams

### Page View Tracking Flow

```
Browser (AnalyticsTracker)
  │
  │  1. Check sessionStorage for session ID (create if missing)
  │  2. Check useSession() → skip if admin is logged in
  │  3. Extract pathname, title, referrer, UTM params from DOM/router
  │  4. Debounce check (500ms min between same-path events)
  │
  └──► POST /api/analytics/track
         │
         │  1. Parse & validate JSON body
         │  2. Rate limit by sessionId (30/min in-memory)
         │  3. Detect bots from User-Agent
         │  4. Parse device / browser / OS from User-Agent
         │  5. Extract country from CDN headers or Accept-Language
         │
         └──► recordPageView() [src/db/analytics.ts]
                │
                ├──► INSERT analytics_page_views (raw event)
                ├──► UPSERT analytics_referrers (by domain)
                └──► UPSERT analytics_daily_stats (by date+path+domain)
```

### Admin Dashboard Read Flow

```
Admin Browser
  │
  └──► GET /api/analytics?action=summary&days=30
         │
         │  1. Verify NextAuth session → 401 if unauthenticated
         │  2. Parse query parameters (action, days, page, limit, etc.)
         │  3. Calculate startDate / endDate from `days`
         │  4. Dispatch to appropriate query function
         │
         └──► src/db/analytics.ts query functions
                │
                ├── analytics_page_views  (raw queries, bots excluded)
                ├── analytics_daily_stats (aggregated daily queries)
                └── analytics_referrers   (all-time referrer queries)
```

### Data Storage Strategy

```
Every page view event
  │
  ├── analytics_page_views      ← Full detail, kept for 90 days
  │   Used for: 404 drill-downs, country/device breakdowns,
  │             per-session analysis, raw data access
  │
  ├── analytics_daily_stats     ← Aggregated by day/path/referrer, kept forever
  │   Used for: fast time-series queries, trends, date-range summaries
  │
  └── analytics_referrers       ← All-time per-domain totals, kept forever
      Used for: top referrers list, all-time traffic source history
```

---

*Last updated: June 2026*
