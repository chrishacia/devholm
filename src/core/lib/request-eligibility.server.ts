/**
 * Request eligibility checks for public route resolution
 *
 * Determines whether a request should go through plugin public-route resolution
 * before falling through to the App Router.
 */

import type { NextRequest } from 'next/server';
import { isApiPath, isAdminPath, isStaticPath } from '@core/lib/path-boundaries.server';

/**
 * Determine if a request is eligible for public route extension resolution
 *
 * A request is eligible if:
 * - Request method is GET or HEAD (not POST, PUT, DELETE, etc.)
 * - Pathname is not reserved (/api, /admin, /static)
 * - Pathname does not end with a public asset extension
 * - Request is not an RSC request (internal Next.js server component fetch)
 * - Request is not a prefetch request (router speculation)
 *
 * @param request - The Next.js request object
 * @returns true if the request should go through plugin resolution, false to skip
 */
export function shouldResolvePublicRoute(request: NextRequest): boolean {
  const { pathname } = request.nextUrl;
  const method = request.method;

  // Only GET and HEAD requests can trigger plugin routes
  if (method !== 'GET' && method !== 'HEAD') {
    return false;
  }

  // Reserved paths: /api, /admin, /static
  if (isApiPath(pathname) || isAdminPath(pathname) || isStaticPath(pathname)) {
    return false;
  }

  // RSC (React Server Component) internal requests
  // - rsc=1 header indicates RSC fetch
  // - next-action header indicates server action call
  if (request.headers.get('rsc') === '1' || request.headers.has('next-action')) {
    return false;
  }

  // Prefetch requests (router speculation, should not trigger side effects)
  // - purpose: prefetch = Next.js fetch API prefetch mode
  // - next-router-prefetch = Next.js router prefetch
  if (
    request.headers.get('purpose') === 'prefetch' ||
    request.headers.get('next-router-prefetch') === '1'
  ) {
    return false;
  }

  // Public asset extensions (should be served directly, not routed through plugins)
  const publicAssetExtensions = [
    '.svg',
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.woff',
    '.woff2',
    '.ttf',
    '.eot',
    '.otf',
    '.webmanifest',
    '.ico',
  ];
  if (publicAssetExtensions.some((ext) => pathname.endsWith(ext))) {
    return false;
  }

  // Request is eligible
  return true;
}
