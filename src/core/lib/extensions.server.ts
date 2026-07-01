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
 * Checks extensions in order and detects conflicts (multiple matches).
 *
 * Route precedence (enforced in the caller):
 * 1. Next.js specific routes (api, admin, assets, etc.)
 * 2. DevHolm dev pages (from devPageDefinitions)
 * 3. Plugin public routes (matched in registration order) <- This function
 * 4. CMS pages (single-segment slugs only)
 * 5. 404
 *
 * @throws Error if multiple extensions claim the same path (conflict detection)
 * @returns Response from claiming extension, or null if no match
 */
export async function resolvePublicRouteExtension(
  pathname: string,
  request: NextRequest
): Promise<Response | null> {
  const helpers = getExtensionHelpers();
  const matches: PublicRouteExtension[] = [];

  // Check each enabled extension in order
  for (const extension of publicRouteExtensions) {
    if (!(await isExtensionEnabled(extension.pluginId))) {
      continue;
    }

    try {
      const response = await extension.claimPath(pathname, request, helpers);
      if (response) {
        matches.push(extension);
      }
    } catch (error) {
      console.error(
        `Extension ${extension.id} (plugin ${extension.pluginId || 'core'}) failed to claim path ${pathname}:`,
        error
      );
      // Continue to next extension on error
    }
  }

  // Detect conflicts: multiple extensions claimed the same path
  if (matches.length > 1) {
    const matchIds = matches.map((m) => `${m.id} (${m.pluginId || 'core'})`).join(', ');
    console.error(
      `Public route conflict detected at ${pathname}: multiple extensions matched: ${matchIds}`
    );
    throw new Error(`Route conflict at ${pathname}: ${matchIds}`);
  }

  if (matches.length === 1) {
    // Return response from the claiming extension
    return (
      (await publicRouteExtensions
        .find((e) => e === matches[0])
        ?.claimPath(pathname, request, helpers)) ?? null
    );
  }

  return null;
}
