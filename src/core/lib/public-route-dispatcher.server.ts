/**
 * Public route dispatcher - production wrapper
 *
 * Supplies real dependencies to the testable core dispatcher.
 * Tests can inject mock dependencies via dispatchPublicRoute directly.
 */

import type { NextRequest } from 'next/server';
import { isPluginEnabled } from '@/db/plugins';
import { getExtensionHelpers } from '@core/lib/extension-helpers.server';
import { publicRouteExtensions } from '@user/extensions/public-routes';
import { getReservedRoutes } from '@core/lib/reserved-routes.server';
import {
  dispatchPublicRoute,
  type PublicRouteResolution,
} from '@core/lib/public-route-dispatcher-core.server';

/**
 * Production wrapper for dispatcher
 * Supplies real registry and dependencies
 */
export async function resolvePublicRouteExtension(
  pathname: string,
  request: NextRequest
): Promise<PublicRouteResolution> {
  return dispatchPublicRoute(pathname, request, {
    extensions: publicRouteExtensions,
    isPluginEnabled,
    getReservedRoutes,
    getHelpers: getExtensionHelpers,
  });
}

// Re-export types for backward compatibility
export type { PublicRouteResolution };
