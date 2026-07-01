/**
 * Public route dispatcher core - dependency-injectable for testing
 *
 * This is the core dispatcher logic extracted with all dependencies
 * injected, making it fully testable without mocking production imports.
 *
 * Production wrapper (resolvePublicRouteExtension) supplies real dependencies.
 */

import type { NextRequest } from 'next/server';
import type { PublicRouteExtension } from '@core/types/extensions.server';
import type { ExtensionHelpers } from '@core/types/extensions.server';
import type {
  PublicRouteMatchContext,
  ReadOnlyDatabaseAccessor,
  ReadOnlySettingsAccessor,
} from '@core/lib/public-route-match-context.server';

export interface PublicRouteDispatcherDependencies {
  extensions: PublicRouteExtension[];
  isPluginEnabled: (pluginId: string | undefined) => Promise<boolean>;
  getReservedRoutes: () => Set<string>;
  getHelpers: () => ExtensionHelpers;
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
 * Check if pathname is reserved (exact or prefix match)
 */
function isReservedRoute(pathname: string, reservedRoutes: Set<string>): boolean {
  if (reservedRoutes.has(pathname)) {
    return true;
  }

  for (const reserved of reservedRoutes) {
    if (pathname.startsWith(reserved + '/')) {
      return true;
    }
  }

  return false;
}

/**
 * Core dispatcher logic - fully dependency-injectable
 *
 * Two-phase dispatch:
 * 1. Collect all matching extensions (side-effect free, read-only)
 * 2. Handle exactly one match; fail closed on conflicts or errors
 */
export async function dispatchPublicRoute(
  pathname: string,
  request: NextRequest,
  dependencies: PublicRouteDispatcherDependencies
): Promise<PublicRouteResolution> {
  // Check if reserved route
  const reservedRoutes = dependencies.getReservedRoutes();
  const isReserved = isReservedRoute(pathname, reservedRoutes);

  if (isReserved) {
    return {
      type: 'no-match',
    };
  }

  // Only handle GET and HEAD requests for plugin routes
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return {
      type: 'no-match',
    };
  }

  const helpers = dependencies.getHelpers();

  // Create read-only accessors from helpers
  // These provide limited, read-only interfaces to prevent accidental writes during match phase
  const db = helpers.getDb() as unknown as ReadOnlyDatabaseAccessor;
  const settings = {} as unknown as ReadOnlySettingsAccessor;

  const matchContext: PublicRouteMatchContext = {
    reservedRoutes: reservedRoutes as ReadonlySet<string>,
    db,
    settings,
  };

  // Phase 1: Collect all matches (side-effect free matching)
  const collectedMatches: Array<{
    extension: PublicRouteExtension;
    match: unknown;
  }> = [];

  for (const extension of dependencies.extensions) {
    // Skip disabled plugins
    if (extension.pluginId && !(await dependencies.isPluginEnabled(extension.pluginId))) {
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
