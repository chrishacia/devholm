/**
 * Public route dispatcher - two-phase matching and handling
 *
 * Phase 1: Matching (side-effect-free)
 * - Call match() on all extensions
 * - Collect all matches
 * - Check for conflicts
 *
 * Phase 2: Handling (after conflict detection)
 * - If exactly one match: call handle()
 * - If zero matches: return no-match
 * - If multiple matches: return conflict
 * - If any exception: return error
 *
 * No handler may execute before conflict detection completes.
 * Matching must be side-effect-free (read-only).
 */

import type { NextRequest } from 'next/server';
import type { PublicRouteExtension, PublicRouteMatchContext } from '@core/types/extensions.server';
import { isPluginEnabled } from '@/db/plugins';
import { getExtensionHelpers } from '@core/lib/extension-helpers.server';
import { publicRouteExtensions } from '@user/extensions/public-routes';
import { getReservedRoutes } from '@core/lib/reserved-routes.server';

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
 * 1. Collect all matching extensions (side-effect free, read-only)
 * 2. Handle exactly one match; fail closed on conflicts or errors
 */
export async function resolvePublicRouteExtension(
  pathname: string,
  request: NextRequest
): Promise<PublicRouteResolution> {
  // Check if reserved route
  const reservedRoutes = getReservedRoutes();
  const isReserved = isReservedRoute(pathname, reservedRoutes);

  if (isReserved) {
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
  const matchContext: PublicRouteMatchContext = {
    reservedRoutes,
    helpers,
  };

  // Phase 1: Collect all matches (side-effect free matching)
  const collectedMatches: Array<{
    extension: PublicRouteExtension;
    match: unknown;
  }> = [];

  for (const extension of publicRouteExtensions) {
    // Skip disabled plugins
    if (extension.pluginId && !(await isPluginEnabled(extension.pluginId).catch(() => false))) {
      continue;
    }

    try {
      // Call match() - must be side-effect-free
      const matchResult = await extension.match(pathname, request, matchContext);

      if (matchResult !== null && matchResult !== undefined) {
        collectedMatches.push({
          extension,
          match: matchResult,
        });
        // Continue collecting all matches to detect conflicts
      }
    } catch (error) {
      // Matcher exception
      const errorMessage =
        `Public route matcher failed for extension ${extension.id} ` +
        `(plugin: ${extension.pluginId || 'core'}) at path ${pathname}: ${error instanceof Error ? error.message : String(error)}`;

      console.error(errorMessage);

      return {
        type: 'error',
        error: new Error(errorMessage),
      };
    }
  }

  // Phase 2: Conflict detection (before any handler executes)
  if (collectedMatches.length > 1) {
    const conflictIds = collectedMatches.map(
      (m) => `${m.extension.id} (plugin: ${m.extension.pluginId || 'core'})`
    );
    const errorMessage =
      `Public route conflict at ${pathname}: ` +
      `multiple extensions claim this path: ${conflictIds.join(', ')}. ` +
      `Plugin routes must be mutually exclusive. ` +
      `Disable one plugin or refactor route patterns.`;

    console.error(errorMessage);

    return {
      type: 'conflict',
      conflictingExtensions: conflictIds,
      error: new Error(errorMessage),
    };
  }

  // Phase 3: Handle exactly one match or return no-match
  if (collectedMatches.length === 1) {
    const { extension, match } = collectedMatches[0];

    try {
      // Phase 2: Call handle() - side effects allowed here
      const response = await extension.handle(match, request, helpers);

      return {
        type: 'match',
        response,
      };
    } catch (error) {
      // Handler exception
      const errorMessage =
        `Public route handler failed for extension ${extension.id} ` +
        `(plugin: ${extension.pluginId || 'core'}) at path ${pathname}: ${error instanceof Error ? error.message : String(error)}`;

      console.error(errorMessage);

      return {
        type: 'error',
        error: new Error(errorMessage),
      };
    }
  }

  // No match found
  return {
    type: 'no-match',
  };
}

/**
 * Check if pathname is reserved (exact or prefix match)
 */
function isReservedRoute(pathname: string, reservedRoutes: Set<string>): boolean {
  // Check exact match first
  if (reservedRoutes.has(pathname)) {
    return true;
  }

  // Check prefix matches (e.g., /admin/settings matches /admin)
  for (const reserved of reservedRoutes) {
    if (pathname.startsWith(reserved + '/')) {
      return true;
    }
  }

  return false;
}
