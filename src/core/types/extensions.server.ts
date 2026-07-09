import type { Metadata } from 'next';
import type { NextRequest } from 'next/server';
import type React from 'react';
import type { PublicRouteMatchContext } from '@core/lib/public-route-match-context.server';

// Re-export for convenience
export type { PublicRouteMatchContext };

export interface ExtensionHelpers {
  auth: typeof import('@/auth').auth;
  getDb: typeof import('@/db').getDb;
  verifyAdmin: typeof import('@/lib/auth-helpers').verifyAdmin;
}

export type ExtensionAccessScope =
  | 'admin'
  | 'public'
  | 'authenticated'
  | 'policy-scoped'
  | 'future';

export interface ExtensionAccessPolicyMetadata {
  scope: ExtensionAccessScope;
  permissionKeys?: readonly string[];
  capability?: string;
  runtimeOwner?: 'core-filesystem' | 'plugin-extension';
  notes?: string;
}

export interface AdminPageExtension {
  pluginId?: string;
  /** Route href, e.g. '/admin/telemetry' */
  href: `/admin/${string}`;
  /** Optional metadata-only access policy declaration */
  accessPolicy?: ExtensionAccessPolicyMetadata;
  /** Dynamic import for the page component */
  loadPage: () => Promise<{ default: React.ComponentType } | React.ComponentType>;
  /** Optional metadata for the dynamic admin page */
  getMetadata?: () => Promise<Metadata> | Metadata;
}

export type ApiExtensionMethod = 'DELETE' | 'GET' | 'HEAD' | 'OPTIONS' | 'PATCH' | 'POST' | 'PUT';

export interface ApiExtensionContext {
  params: {
    path: string[];
  };
  helpers: ExtensionHelpers;
}

export type ApiExtensionHandler = (
  request: NextRequest,
  context: ApiExtensionContext
) => Promise<Response> | Response;

export interface ApiExtension {
  pluginId?: string;
  /** Route path, e.g. '/api/telemetry' */
  path: `/api/${string}`;
  /** Optional metadata-only access policy declaration */
  accessPolicy?: ExtensionAccessPolicyMetadata;
  handlers: Partial<Record<ApiExtensionMethod, ApiExtensionHandler>>;
}

export interface SitemapEntryExtension {
  url: string;
  lastModified?: Date | string;
}

export interface MetadataExtension {
  pluginId?: string;
  /** Public route path, e.g. '/docs' */
  path: `/${string}`;
  getMetadata: (helpers: ExtensionHelpers) => Promise<Metadata> | Metadata;
}

export interface StructuredDataExtension {
  pluginId?: string;
  /** Public route path, e.g. '/docs' */
  path: `/${string}`;
  getData: (
    helpers: ExtensionHelpers
  ) =>
    | Promise<Record<string, unknown> | Record<string, unknown>[]>
    | Record<string, unknown>
    | Record<string, unknown>[];
}

export interface SitemapExtension {
  id: string;
  pluginId?: string;
  getEntries: (
    helpers: ExtensionHelpers
  ) => Promise<SitemapEntryExtension[]> | SitemapEntryExtension[];
}

export interface RobotsExtension {
  id: string;
  pluginId?: string;
  getRules: (helpers: ExtensionHelpers) => Promise<string[]> | string[];
}

/**
 * Match result from PublicRouteExtension.match()
 * Opaque type - the extension stores what it needs to handle later
 */
export type PublicRouteMatch<TExtension = unknown> = TExtension;

/**
 * Two-phase public route extension contract
 *
 * Phase 1: Matching (side-effect-free)
 * - match() called for each extension
 * - Must not mutate state: no analytics, counters, records, etc.
 * - Returns match state or null if not claimed
 *
 * Phase 2: Handling (after conflict detection)
 * - If exactly one match: handle() called with match state
 * - If zero matches: returns no-match
 * - If multiple matches: returns conflict with extensions list
 * - If matcher or handler throws: returns error
 *
 * Route precedence (in order):
 * 1. Next.js specific routes (api, admin, assets, etc.)
 * 2. Reserved routes (protected dev pages, admin, API, framework routes)
 * 3. Plugin public routes (matched in registration order)
 * 4. CMS pages (single-segment slugs only)
 * 5. 404
 */
export interface PublicRouteExtension<TMatch = unknown> {
  pluginId?: string;
  /** Unique ID for this route extension (e.g., 'url-shortener-redirect') */
  id: string;
  /** Optional metadata-only access policy declaration */
  accessPolicy?: ExtensionAccessPolicyMetadata;

  /**
   * Phase 1: Side-effect-free matching
   *
   * Determines if this extension claims the given pathname.
   * May read runtime settings from database or config.
   * Must NOT write analytics, increment counters, create records, or mutate any state.
   *
   * Called for every matching extension to collect all potential matches.
   * Exceptions during match produce an error result.
   *
   * @param pathname - The request pathname (e.g., '/abc123')
   * @param request - The NextRequest for access to headers, cookies, etc.
   * @param context - Match context with reserved routes and helpers
   * @returns Promise<TMatch | null> | TMatch | null
   *   - TMatch (truthy): Claims this path; returns match state for handle() phase
   *   - null/undefined: Does not claim this path; try next extension
   *   - Throws: Returns error result; does not continue
   */
  match(
    pathname: string,
    request: NextRequest,
    context: PublicRouteMatchContext
  ): Promise<TMatch | null> | TMatch | null;

  /**
   * Phase 2: Handle request after conflict detection
   *
   * Called exactly once if match() returned truthy AND no other extension matched.
   * This is where side effects are safe: analytics, redirects, data fetches, etc.
   *
   * Exceptions during handle produce an error result.
   *
   * @param match - The match state returned from match()
   * @param request - The NextRequest
   * @param helpers - ExtensionHelpers for database, auth, config access
   * @returns Promise<Response> | Response
   *   - Response: The response to send to the client
   *   - Throws: Returns error result with 503 status
   */
  handle(
    match: TMatch,
    request: NextRequest,
    helpers: ExtensionHelpers
  ): Promise<Response> | Response;
}

/**
 * Embed extension for shortcode/markdown rendering in content.
 * Supports custom embed types like galleries, calendars, forms, etc.
 *
 * Example:
 * - Shortcode: [gallery slug="my-gallery"]
 * - Pattern: /\[gallery\s+([^\]]+)\]/g
 * - render: async (match, helpers) => <html for gallery>
 */
export interface EmbedExtensionConfig {
  pluginId?: string;
  /** Unique ID for this embed type (e.g., 'calendar-embed', 'gallery-embed') */
  id: string;
  /** Shortcode name/identifier (e.g., 'calendar', 'gallery') for conflict detection */
  shortcode: string;
  /** Regex to match the shortcode pattern, e.g., /\[gallery\s+([^\]]+)\]/g */
  pattern: RegExp;
  /**
   * Async function to render the embed shortcode.
   *
   * @param match - The regex match result (array with full match + groups)
   * @param content - The full markdown content (for context)
   * @param helpers - ExtensionHelpers for database, auth, config access
   * @returns Promise<string | null>
   *   - string: HTML to render (will be inserted as-is)
   *   - null: Render shortcode as-is (fallback for rendering error)
   */
  render: (
    match: RegExpExecArray,
    content: string,
    helpers: ExtensionHelpers
  ) => Promise<string | null> | string | null;
}
