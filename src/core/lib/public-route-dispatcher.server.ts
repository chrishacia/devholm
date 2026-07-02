/**
 * Public route dispatcher - production wrapper
 *
 * Supplies real dependencies to the testable core dispatcher.
 * Tests can inject mock dependencies via dispatchPublicRoute directly.
 */

import type { NextRequest } from 'next/server';
import { isPluginEnabled } from '@/db/plugins';
import { getSetting, getSettings } from '@/db/settings';
import { getExtensionHelpers } from '@core/lib/extension-helpers.server';
import { publicRouteExtensions } from '@user/extensions/public-routes';
import { getReservedRoutes } from '@core/lib/reserved-routes.server';
import { createReadOnlySettingsAccessor } from '@core/lib/public-route-adapters.server';
import {
  dispatchPublicRoute,
  type PublicRouteDispatcherDependencies,
  type PublicRouteResolution,
} from '@core/lib/public-route-dispatcher-core.server';

/**
 * Export factory for testing
 * Creates fully-wired dispatcher dependencies
 */
export function createPublicRouteDispatcherDependencies(): PublicRouteDispatcherDependencies {
  const helpers = getExtensionHelpers();

  return {
    extensions: publicRouteExtensions,
    isPluginEnabled,
    getReservedRoutes,
    getHelpers: () => helpers,
    createMatchContext: (reservedRoutes: ReadonlySet<string>) => {
      const settingsAccessor = createReadOnlySettingsAccessor(getSetting, getSettings);

      return {
        reservedRoutes,
        settings: settingsAccessor,
      };
    },
  };
}

/**
 * Production wrapper for dispatcher
 * Supplies real registry and dependencies
 */
export async function resolvePublicRouteExtension(
  pathname: string,
  request: NextRequest
): Promise<PublicRouteResolution> {
  const dependencies = createPublicRouteDispatcherDependencies();
  return dispatchPublicRoute(pathname, request, dependencies);
}

// Re-export types for backward compatibility
export type { PublicRouteResolution };
