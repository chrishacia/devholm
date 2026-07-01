import type { Metadata } from 'next';
import type { NextRequest } from 'next/server';
import type React from 'react';

export interface ExtensionHelpers {
  auth: typeof import('@/auth').auth;
  getDb: typeof import('@/db').getDb;
  verifyAdmin: typeof import('@/lib/auth-helpers').verifyAdmin;
}

export interface AdminPageExtension {
  pluginId?: string;
  /** Route href, e.g. '/admin/telemetry' */
  href: `/admin/${string}`;
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
 * Public route extension for plugins to claim and handle specific URL paths.
 * Supports dynamic, async path matching based on runtime settings.
 *
 * Route precedence (in order):
 * 1. Next.js specific routes (api, admin, assets, etc.)
 * 2. DevHolm dev pages (from devPageDefinitions)
 * 3. Plugin public routes (matched in registration order)
 * 4. CMS pages (single-segment slugs only)
 * 5. 404
 *
 * Conflicts: If multiple extensions claim the same path, route resolution fails.
 * All matches must return false or null to avoid conflicts.
 */
export interface PublicRouteExtension {
  pluginId?: string;
  /** Unique ID for this route extension (e.g., 'url-shortener-redirect') */
  id: string;
  /**
   * Async function to determine if this extension claims the given pathname.
   * Called for each request; supports runtime settings checks.
   *
   * @param pathname - The request pathname (e.g., '/abc123')
   * @param request - The NextRequest for access to headers, cookies, etc.
   * @param helpers - ExtensionHelpers for database, auth, config access
   * @returns Promise<Response | null>
   *   - Response: Claims this path and returns the response (e.g., redirect)
   *   - null/undefined: Does not claim this path; continue to next extension
   */
  claimPath: (
    pathname: string,
    request: NextRequest,
    helpers: ExtensionHelpers
  ) => Promise<Response | null> | Response | null;
}

/**
 * Embed extension for shortcode/markdown rendering in content.
 * Supports custom embed types like galleries, calendars, forms, etc.
 *
 * Example:
 * - Shortcode: [gallery:my-gallery]
 * - Pattern match: /^\[gallery:([^\]]+)\]$/
 * - render: async (match, helpers) => <html for gallery>
 */
export interface EmbedExtensionConfig {
  pluginId?: string;
  /** Unique ID for this embed type (e.g., 'calendar-embed', 'gallery-embed') */
  id: string;
  /** Regex to match the shortcode pattern, e.g., /^\[gallery:([^\]]+)\]$/ */
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
