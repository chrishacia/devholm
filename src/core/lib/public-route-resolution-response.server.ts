/**
 * Middleware response builder - converts public route resolution to Response
 *
 * This extracts the response generation logic from middleware.ts
 * so it can be tested independently and reused consistently.
 */

import type { PublicRouteResolution } from '@core/lib/public-route-dispatcher.server';

/**
 * Convert a public route resolution to a middleware Response
 *
 * - Match: Returns the extension's response
 * - Conflict: Returns 409 Conflict with explanation
 * - Error: Returns 503 Service Unavailable
 * - No-match: Returns null (let App Router handle it)
 */
export function responseForPublicRouteResolution(
  pathname: string,
  resolution: PublicRouteResolution
): Response | null {
  switch (resolution.type) {
    case 'match':
      // Extension claimed the path successfully - return its response
      return resolution.response;

    case 'conflict':
      // Multiple extensions claimed same path - fail closed with explicit error
      // This is a server configuration error, not a 404
      return new Response(
        JSON.stringify({
          error: 'Route Configuration Conflict',
          message: `Multiple plugin routes claimed the same path: ${pathname}. This is a server configuration error.`,
          conflictingExtensions: resolution.conflictingExtensions,
        }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        }
      );

    case 'error':
      // Dispatcher encountered an error during dispatch (e.g., database failure)
      // Return 503 Service Unavailable
      return new Response(
        JSON.stringify({
          error: 'Service Unavailable',
          message: 'Route resolution service temporarily unavailable',
        }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }
      );

    case 'no-match':
      // No extension claimed this path, continue to App Router
      return null;

    default:
      // Exhaustiveness check - should never reach here
      const _exhaustive: never = resolution;
      return _exhaustive;
  }
}
