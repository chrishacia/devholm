/**
 * Public route dispatcher - production wrapper
 *
 * Supplies real dependencies to the testable core dispatcher.
 * Tests can inject mock dependencies via dispatchPublicRoute directly.
 */

import type { NextRequest } from 'next/server';
import { publicRouteExtensions } from '@user/extensions/public-routes';
import { getReservedRoutes } from '@core/lib/reserved-routes.server';
import type { ExtensionHelpers } from '@core/types/extensions.server';
import {
  dispatchPublicRoute,
  type PublicRouteDispatcherDependencies,
  type PublicRouteResolution,
} from '@core/lib/public-route-dispatcher-core.server';
import {
  evaluatePluginSandboxAccess,
  recordPluginSandboxDecision,
} from '@core/lib/plugin-capability-sandbox.server';

/**
 * Export factory for testing
 * Creates fully-wired dispatcher dependencies
 */
export function createPublicRouteDispatcherDependencies(): PublicRouteDispatcherDependencies {
  // Proxy/interception path must remain DB-free. Enablement, settings, and
  // redirect/storage logic are validated and enforced in Node route handlers.
  const edgeSafeHelpers = {} as ExtensionHelpers;

  return {
    extensions: publicRouteExtensions,
    isPluginEnabled: async () => true,
    authorizeExtension: async (extension) => {
      const decision = await evaluatePluginSandboxAccess({
        pluginId: extension.pluginId,
        surface: 'public-route',
        resourceId: extension.id,
        accessPolicy: extension.accessPolicy,
      });
      recordPluginSandboxDecision(decision);
      return decision.allowed;
    },
    getReservedRoutes,
    getHelpers: async () => edgeSafeHelpers,
    createMatchContext: (reservedRoutes: ReadonlySet<string>) => ({
      reservedRoutes,
      settings: {
        get: async () => null,
        getMany: async () => ({}),
      },
    }),
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
