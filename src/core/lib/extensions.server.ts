import type React from 'react';
import type { Metadata } from 'next';
import type { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { getDb } from '@/db';
import { verifyAdmin } from '@/lib/auth-helpers';
import type {
  AdminPageExtension,
  ApiExtension,
  ApiExtensionMethod,
  ExtensionHelpers,
  MetadataExtension,
  PublicRouteExtension,
  RobotsExtension,
  SitemapExtension,
  StructuredDataExtension,
} from '@core/types/extensions.server';
import { adminPageExtensions } from '@user/extensions/admin/pages';
import { apiExtensions } from '@user/extensions/api';
import { publicRouteExtensions } from '@user/extensions/public-routes';
import {
  metadataExtensions,
  robotsExtensions,
  sitemapExtensions,
  structuredDataExtensions,
} from '@user/extensions/seo';
import { isPluginEnabled } from '@/db/plugins';

function normalizePath(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  return '/' + segments.join('/');
}

function resolveByPath<T extends { href?: string; path?: string }>(
  extensions: T[],
  candidatePath: string
): T | undefined {
  const normalizedCandidate = normalizePath(candidatePath);
  return extensions.find((extension) => {
    const extensionPath = 'href' in extension ? extension.href : extension.path;
    return extensionPath ? normalizePath(extensionPath) === normalizedCandidate : false;
  });
}

function hasDefaultExport(
  module: Awaited<ReturnType<AdminPageExtension['loadPage']>>
): module is { default: React.ComponentType } {
  return typeof module === 'object' && module !== null && 'default' in module;
}

export function getExtensionHelpers(): ExtensionHelpers {
  return {
    auth,
    getDb,
    verifyAdmin,
  };
}

async function isExtensionEnabled(pluginId?: string): Promise<boolean> {
  if (!pluginId) {
    return true;
  }

  return isPluginEnabled(pluginId);
}

export function resolveAdminPageExtension(slug: string[]): AdminPageExtension | undefined {
  return resolveByPath(adminPageExtensions, `/admin/${slug.join('/')}`);
}

export async function getAdminPageComponent(slug: string[]): Promise<React.ComponentType | null> {
  const extension = resolveAdminPageExtension(slug);
  if (!extension) {
    return null;
  }

  // Enforce plugin enablement check
  if (!(await isExtensionEnabled(extension.pluginId))) {
    return null;
  }

  const loadedModule = await extension.loadPage();
  return hasDefaultExport(loadedModule) ? loadedModule.default : loadedModule;
}

export async function getAdminPageMetadata(slug: string[]): Promise<Metadata | undefined> {
  const extension = resolveAdminPageExtension(slug);
  if (!extension) {
    return undefined;
  }

  // Enforce plugin enablement check
  if (!(await isExtensionEnabled(extension.pluginId))) {
    return undefined;
  }

  return extension?.getMetadata ? extension.getMetadata() : undefined;
}

export function resolveMetadataExtensions(path: string): MetadataExtension[] {
  const normalizedCandidate = normalizePath(path);
  return metadataExtensions.filter(
    (extension) => normalizePath(extension.path) === normalizedCandidate
  );
}

export async function getMetadataExtensionData(path: string): Promise<Metadata[]> {
  const helpers = getExtensionHelpers();
  const extensions = await Promise.all(
    resolveMetadataExtensions(path).map(async (extension) => {
      if (!(await isExtensionEnabled(extension.pluginId))) {
        return null;
      }

      return extension;
    })
  );

  return Promise.all(
    extensions
      .filter((extension): extension is MetadataExtension => extension !== null)
      .map((extension) => extension.getMetadata(helpers))
  );
}

export function resolveStructuredDataExtensions(path: string): StructuredDataExtension[] {
  const normalizedCandidate = normalizePath(path);
  return structuredDataExtensions.filter(
    (extension) => normalizePath(extension.path) === normalizedCandidate
  );
}

export async function getStructuredDataExtensionData(
  path: string
): Promise<Record<string, unknown>[]> {
  const helpers = getExtensionHelpers();
  const extensions = await Promise.all(
    resolveStructuredDataExtensions(path).map(async (extension) => {
      if (!(await isExtensionEnabled(extension.pluginId))) {
        return null;
      }

      return extension;
    })
  );
  const resolved = await Promise.all(
    extensions
      .filter((extension): extension is StructuredDataExtension => extension !== null)
      .map((extension) => extension.getData(helpers))
  );
  return resolved.flatMap((entry) => (Array.isArray(entry) ? entry : [entry]));
}

export async function getSitemapExtensionEntries() {
  const helpers = getExtensionHelpers();
  const enabledExtensions = await Promise.all(
    sitemapExtensions.map(async (extension: SitemapExtension) => {
      if (!(await isExtensionEnabled(extension.pluginId))) {
        return null;
      }

      return extension;
    })
  );
  const resolved = await Promise.all(
    enabledExtensions
      .filter((extension): extension is SitemapExtension => extension !== null)
      .map((extension) => extension.getEntries(helpers))
  );
  return resolved.flat();
}

export async function getRobotsExtensionRules() {
  const helpers = getExtensionHelpers();
  const enabledExtensions = await Promise.all(
    robotsExtensions.map(async (extension: RobotsExtension) => {
      if (!(await isExtensionEnabled(extension.pluginId))) {
        return null;
      }

      return extension;
    })
  );
  const resolved = await Promise.all(
    enabledExtensions
      .filter((extension): extension is RobotsExtension => extension !== null)
      .map((extension) => extension.getRules(helpers))
  );
  return resolved.flat();
}

export function resolveApiExtension(path: string[]): ApiExtension | undefined {
  return resolveByPath(apiExtensions, `/api/${path.join('/')}`);
}

export async function runApiExtension(
  method: ApiExtensionMethod,
  request: NextRequest,
  path: string[]
): Promise<Response | null> {
  const extension = resolveApiExtension(path);
  if (!extension) {
    return null;
  }

  if (!(await isExtensionEnabled(extension.pluginId))) {
    return null;
  }

  const handler = extension.handlers[method];
  if (!handler) {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  return handler(request, {
    params: { path },
    helpers: getExtensionHelpers(),
  });
}

/**
 * Resolve a public route extension for the given pathname.
 * Checks extensions in order and detects conflicts (multiple successful claims).
 *
 * IMPORTANT: This function runs at MIDDLEWARE LEVEL.
 * Control flow (enforced in middleware.ts):
 *
 * 1. Middleware receives request
 * 2. Public route resolution (this function) for non-admin/api/static paths
 *    - If extension claims path (returns Response): return it immediately
 *    - If extension throws: log error, try next extension (graceful error handling)
 *    - If multiple extensions claim: detect conflict, throw error (fail closed)
 *    - If no extension claims: return null, continue to App Router
 * 3. Middleware calls NextResponse.next() -> App Router
 * 4. App Router evaluates dev pages, CMS catch-all, 404
 *
 * Error handling:
 * - Single extension throws during claimPath(): logged, next extension tried
 * - Multiple extensions successfully claim same path: throws conflict error
 * - Conflict error not caught by middleware: logged, NextResponse.next() called
 * - Result: page 404 (app router finds no match either)
 *
 * Database availability:
 * - If extension calls helpers.getDb() and database is down:
 *   - Exception thrown during claimPath()
 *   - Caught here, logged, next extension tried
 *   - If no extension claims path, App Router proceeds
 *   - Dev pages load without plugin data (graceful degradation)
 *
 * @throws Error only if multiple extensions successfully claim the same path
 * @returns Response from claiming extension, or null if no extension claims path
 */
export async function resolvePublicRouteExtension(
  pathname: string,
  request: NextRequest
): Promise<Response | null> {
  const helpers = getExtensionHelpers();
  const matches: {
    extension: PublicRouteExtension;
    response: Response;
  }[] = [];

  // Check each enabled extension in order
  for (const extension of publicRouteExtensions) {
    // Skip disabled plugins
    if (!(await isExtensionEnabled(extension.pluginId))) {
      continue;
    }

    try {
      const response = await extension.claimPath(pathname, request, helpers);
      if (response) {
        matches.push({ extension, response });
        // Don't break - collect all matches to detect conflicts
      }
    } catch (error) {
      /**
       * Extension error handling:
       * - Extension threw during claimPath()
       * - This is not a conflict - extension failed, didn't claim path
       * - Log error for debugging, continue to next extension
       * - Examples: database error, validation error, etc.
       */
      console.error(
        `Extension ${extension.id} (plugin ${extension.pluginId || 'core'}) failed to claim path ${pathname}:`,
        error
      );
      // Continue to next extension on error
    }
  }

  /**
   * CONFLICT DETECTION: Multiple extensions claimed same path
   * This is a critical error - routing is ambiguous
   * Fail closed: throw error instead of returning either response
   */
  if (matches.length > 1) {
    const conflictIds = matches
      .map((m) => `${m.extension.id} (${m.extension.pluginId || 'core'})`)
      .join(', ');
    const errorMessage =
      `Public route conflict at ${pathname}: multiple extensions claimed this path: ${conflictIds}. ` +
      `Plugin extensions must be mutually exclusive. ` +
      `Disable one extension or refactor patterns to avoid overlap.`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }

  // Exactly one extension claimed the path
  if (matches.length === 1) {
    return matches[0].response;
  }

  // No extension claimed the path - continue to App Router
  return null;
}
