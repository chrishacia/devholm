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

const EDGE_SAFE_HELPERS = {} as ExtensionHelpers;

const ISOLATED_EXTENSION_NOT_FOUND_ERROR_PATTERNS = [
  /^isolated public-route match failed: extension-not-found: /,
  /^isolated public-route handler failed: extension-not-found: /,
] as const;

function isIsolatedExtensionNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return ISOLATED_EXTENSION_NOT_FOUND_ERROR_PATTERNS.some((pattern) => pattern.test(error.message));
}

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

      let result: Awaited<ReturnType<typeof runIsolatedPublicRouteMatch>>;
      try {
        result = await runIsolatedPublicRouteMatch({
          pluginId: extension.pluginId!,
          extensionId: extension.id,
          pathname,
          request,
        });
      } catch (error) {
        if (isIsolatedExtensionNotFoundError(error)) {
          // If isolated worker cannot resolve this extension, keep routing behavior
          // deterministic by using the successful in-process preflight claim.
          return preflightMatch;
        }

        throw error;
      }

      if (!result.matched) {
        return null;
      }

      return result.match;
    },
    handle: async (match: unknown, request: NextRequest) => {
      let result: Awaited<ReturnType<typeof runIsolatedPublicRouteHandle>>;
      try {
        result = await runIsolatedPublicRouteHandle({
          pluginId: extension.pluginId!,
          extensionId: extension.id,
          match,
          request,
        });
      } catch (error) {
        if (isIsolatedExtensionNotFoundError(error)) {
          return extension.handle(match, request, EDGE_SAFE_HELPERS);
        }

        throw error;
      }

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
    getHelpers: async () => EDGE_SAFE_HELPERS,
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
