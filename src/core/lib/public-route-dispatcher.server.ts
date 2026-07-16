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
import type { PublicRouteMatchContext } from '@core/lib/public-route-match-context.server';
import {
  dispatchPublicRoute,
  type PublicRouteDispatcherDependencies,
  type PublicRouteResolution,
} from '@core/lib/public-route-dispatcher-core.server';
import {
  evaluatePluginSandboxAccess,
  recordPluginSandboxDecision,
} from '@core/lib/plugin-capability-sandbox.server';
import {
  runIsolatedPublicRouteHandle,
  runIsolatedPublicRouteMatch,
  shouldUseIsolatedRuntimeForExtension,
} from '@core/lib/plugin-isolation-runtime.server';

function withIsolationBoundary(extension: (typeof publicRouteExtensions)[number]) {
  if (
    !shouldUseIsolatedRuntimeForExtension({
      pluginId: extension.pluginId,
      accessPolicy: extension.accessPolicy,
    })
  ) {
    return extension;
  }

  return {
    ...extension,
    match: async (pathname: string, request: NextRequest, context: PublicRouteMatchContext) => {
      // Run a cheap in-process matcher preflight first so clearly unrelated
      // paths avoid isolated runtime overhead and failure surfaces.
      const preflightMatch = await extension.match(pathname, request, context);
      if (preflightMatch === null || preflightMatch === undefined) {
        return null;
      }

      const result = await runIsolatedPublicRouteMatch({
        pluginId: extension.pluginId!,
        extensionId: extension.id,
        pathname,
        request,
      });

      if (!result.matched) {
        return null;
      }

      return result.match;
    },
    handle: async (match: unknown, request: NextRequest) => {
      const result = await runIsolatedPublicRouteHandle({
        pluginId: extension.pluginId!,
        extensionId: extension.id,
        match,
        request,
      });

      console.info('plugin runtime isolated public-route execution', {
        pluginId: extension.pluginId,
        extensionId: extension.id,
        executionId: result.meta.executionId,
        childPid: result.meta.childPid,
      });

      return result.response;
    },
  };
}

/**
 * Export factory for testing
 * Creates fully-wired dispatcher dependencies
 */
export function createPublicRouteDispatcherDependencies(): PublicRouteDispatcherDependencies {
  // Proxy/interception path must remain DB-free. Enablement, settings, and
  // redirect/storage logic are validated and enforced in Node route handlers.
  const edgeSafeHelpers = {} as ExtensionHelpers;

  return {
    extensions: publicRouteExtensions.map(withIsolationBoundary),
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
