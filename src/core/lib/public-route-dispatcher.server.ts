import type { NextRequest } from 'next/server';
import type { PublicRouteExtension } from '@core/types/extensions.server';
import { isPluginEnabled } from '@/db/plugins';
import { getExtensionHelpers } from '@core/lib/extensions.server';
import { publicRouteExtensions } from '@user/extensions/public-routes';

/**
 * Reserved routes that plugins CANNOT claim
 * These are core DevHolm pages that must remain under application control
 */
const RESERVED_ROUTES = new Set([
  '/blog',
  '/calendar',
  '/gallery',
  '/about',
  '/projects',
  '/resume',
  '/contact',
  '/admin',
  '/api',
  '/static',
  '/_next',
  '/public',
  '/.well-known',
]);

function isReservedRoute(pathname: string): boolean {
  // Check if pathname matches any reserved route (exact or prefix match)
  for (const reserved of RESERVED_ROUTES) {
    if (pathname === reserved || pathname.startsWith(reserved + '/')) {
      return true;
    }
  }
  return false;
}

export type PublicRouteResolution =
  | {
      type: 'no-match';
    }
  | {
      type: 'match';
      response: Response;
    }
  | {
      type: 'conflict';
      conflictingExtensions: string[];
      error: Error;
    }
  | {
      type: 'error';
      error: Error;
    };

/**
 * Resolve public route extensions for a given request
 *
 * Two-phase dispatch:
 * 1. Collect all matching extensions (side-effect free)
 * 2. Handle exactly one match; fail closed on conflicts or errors
 *
 * Reserved routes cannot be claimed by plugins
 */
export async function resolvePublicRouteExtension(
  pathname: string,
  request: NextRequest
): Promise<PublicRouteResolution> {
  // Phase 0: Block reserved routes
  if (isReservedRoute(pathname)) {
    return {
      type: 'no-match',
    };
  }

  // Only handle GET and HEAD requests for plugin routes
  // Prevent plugins from intercepting POST, PUT, DELETE, etc.
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return {
      type: 'no-match',
    };
  }

  const helpers = getExtensionHelpers();
  const matches: {
    extension: PublicRouteExtension;
    response: Response;
  }[] = [];

  // Phase 1: Collect all matches (side-effect free, check enablement)
  for (const extension of publicRouteExtensions) {
    // Skip disabled plugins (if pluginId is set, must be enabled)
    if (extension.pluginId && !(await isPluginEnabled(extension.pluginId).catch(() => false))) {
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

  // Phase 2: Conflict detection
  if (matches.length > 1) {
    const conflictIds = matches.map(
      (m) => `${m.extension.id} (plugin: ${m.extension.pluginId || 'core'})`
    );
    const errorMessage =
      `Public route conflict at ${pathname}: multiple extensions claimed this path: ${conflictIds.join(', ')}. ` +
      `Plugin extensions must be mutually exclusive. ` +
      `Disable one extension or refactor patterns to avoid overlap.`;

    console.error(errorMessage);

    return {
      type: 'conflict',
      conflictingExtensions: conflictIds,
      error: new Error(errorMessage),
    };
  }

  // Phase 3: Return exactly one match or no match
  if (matches.length === 1) {
    return {
      type: 'match',
      response: matches[0].response,
    };
  }

  // No match found
  return {
    type: 'no-match',
  };
}
