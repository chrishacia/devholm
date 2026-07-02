import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { auth as authConfig } from '@/config/env';
import { resolvePublicRouteExtension } from '@core/lib/public-route-dispatcher.server';
import { responseForPublicRouteResolution } from '@core/lib/public-route-resolution-response.server';
import { shouldResolvePublicRoute } from '@core/lib/request-eligibility.server';
import { isAdminPath } from '@core/lib/path-boundaries.server';

// Cookie name must match auth.ts configuration
const COOKIE_NAME =
  process.env.NODE_ENV === 'production' ? '__Secure-authjs.session-token' : 'authjs.session-token';

/**
 * Middleware Control Flow
 *
 * Requests flow through middleware in this order:
 *
 * 1. BEFORE middleware:
 *    - Excluded paths (Next.js internals, media, metadata)
 *    - API routes (handled by /api/[...path]/route.ts)
 *
 * 2. MIDDLEWARE execution (this function):
 *    A. Public route extension check
 *       - If eligible (see shouldResolvePublicRoute), ask plugins to claim path
 *       - If a plugin claims it, return the plugin's response (200)
 *       - If conflict (multiple plugins claim), return conflict (409)
 *       - If dispatcher error, return error (503)
 *       - If no plugin claims, continue to step 2B
 *    B. Admin route protection (if path is within /admin)
 *       - Auth check
 *       - Role check
 *       - Setup completion check
 *
 * 3. AFTER middleware:
 *    - Next.js App Router evaluates routes
 *    - Exact dev pages (higher specificity)
 *    - Catch-all [...slug] for CMS pages
 *    - 404 if no match
 *
 * IMPORTANT: Public route extensions run at middleware level, which is
 * BEFORE the App Router. This means:
 * - Extensions can claim any eligible path (GET/HEAD, not reserved, not prefetch)
 * - Dev pages and CMS pages only run if no extension claims the path
 * - Exceptions in extensions return 503 to client
 * - Multiple extensions claiming same path return 409 conflict
 *
 * Requests that skip plugin resolution:
 * - POST/PUT/DELETE/etc (only GET/HEAD eligible)
 * - /api/*, /admin/*, /static/* (reserved paths)
 * - RSC internal requests (rsc=1, next-action headers)
 * - Router prefetch requests (purpose=prefetch, next-router-prefetch)
 * - Public asset files (.svg, .png, .woff2, .webmanifest, etc.)
 *
 * Database Availability:
 * - If extension calls helpers.getDb() and database is down, dispatcher catches it
 * - Returns error resolution (503 to client)
 * - App Router proceeds normally if response not needed
 * - Core DevHolm functionality is not blocked by plugin errors
 */

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  /**
   * Phase 1: Check public route extensions (if eligible)
   *
   * Uses shouldResolvePublicRoute to determine eligibility
   */
  if (shouldResolvePublicRoute(request)) {
    try {
      const resolution = await resolvePublicRouteExtension(pathname, request);

      // Handle the resolution using the production response builder
      const response = responseForPublicRouteResolution(pathname, resolution);

      if (response !== null) {
        // Log errors and conflicts for debugging
        if (resolution.type === 'conflict') {
          console.error('Public route conflict detected:', {
            pathname,
            conflictingExtensions: resolution.conflictingExtensions,
            error: resolution.error.message,
          });
        } else if (resolution.type === 'error') {
          console.error('Public route dispatcher error:', resolution.error);
        }

        return response;
      }
      // If response is null (no-match), continue to Phase 2
    } catch (error) {
      /**
       * Unexpected dispatcher exception (fallback):
       * - Should not happen with proper error handling in dispatcher
       * - Return 503 Service Unavailable to client
       * - Log error for debugging
       */
      console.error('Unexpected public route extension error:', error);
      return NextResponse.json(
        {
          error: 'Service Unavailable',
          message: 'An unexpected error occurred while processing this request',
          timestamp: new Date().toISOString(),
        },
        { status: 503 }
      );
    }
  }

  /**
   * Phase 2: Admin route protection
   *
   * Protect all /admin/* routes with authentication and authorization
   */

  // Skip auth check for login page
  if (pathname === '/admin/login') {
    return NextResponse.next();
  }

  // Protect all admin routes (using boundary-safe helper)
  if (isAdminPath(pathname)) {
    const token = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
      cookieName: COOKIE_NAME,
    });

    // Not logged in - redirect to login
    if (!token) {
      const url = new URL('/admin/login', request.url);
      url.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(url);
    }

    // Not admin - redirect to home
    const adminRoles = Array.isArray(token.roles) ? token.roles : [];
    const hasAdminAccess =
      token.isAdmin === true ||
      token.role === 'admin' ||
      token.role === 'superadmin' ||
      adminRoles.includes('admin') ||
      adminRoles.includes('superadmin');

    if (!hasAdminAccess) {
      return NextResponse.redirect(new URL('/', request.url));
    }

    const installCompleted = token.installCompleted === true || authConfig.setupBypassEnabled;
    if (!installCompleted && pathname !== '/admin/setup') {
      return NextResponse.redirect(new URL('/admin/setup', request.url));
    }

    if (installCompleted && pathname === '/admin/setup' && !authConfig.setupBypassEnabled) {
      return NextResponse.redirect(new URL('/admin', request.url));
    }
  }

  return NextResponse.next();
}

/**
 * Middleware matcher configuration
 *
 * The matcher determines which requests reach middleware.
 * - `matcher: ['/:path*']` = all paths (most restrictive first)
 * - But only if not excluded by Next.js internally
 *
 * Paths that NEVER reach middleware (excluded by Next.js):
 * - `/_next/*` (Next.js internal resources)
 * - `/favicon.ico`, `/robots.txt`, `/sitemap.xml` (metadata routes)
 * - Static files in `public/` directory
 * - `.well-known/*` (HTTPS/security metadata)
 * - Image optimization routes (`_next/image`)
 * - Font optimization routes
 *
 * Paths that REACH middleware but are excluded by code:
 * - `/api/*` - Public route check skipped (handled by /api/[...path]/route.ts)
 * - `/admin/*` - Public route check skipped (handled by auth middleware)
 * - `/static/*` - Public route check skipped (direct file serving)
 * - RSC requests (`rsc=1` or `next-action` header) - Server component requests
 * - Prefetch requests (`purpose=prefetch` or `next-router-prefetch: 1`) - Router prefetch
 * - Public asset files (.svg, .png, .woff2, .webmanifest, etc.) - Static assets
 *
 * All other paths are checked for public route extensions.
 * This includes:
 * - `/blog/*` - CMS blog posts
 * - `/calendar/*` - Calendar collections
 * - `/gallery/*` - Gallery collections
 * - `/contact` - Contact form
 * - `/about` - About page
 * - `/projects`, `/uses`, `/resume` - Dev pages
 * - Catch-all `/[...slug]` for custom CMS pages
 */
export const config = {
  /**
   * Middleware matcher: which paths trigger middleware execution
   *
   * Explicit path-boundary matcher that only includes paths where middleware is needed:
   * - Plugin public routes (all paths except reserved)
   * - Admin routes (authentication + authorization)
   *
   * Exclude using path boundaries to prevent false positives:
   * - /api/* (exact path boundary with /)
   * - /_next/static/* and /_next/image/* (exact boundaries)
   * - /uploads/* (exact boundary)
   * - /.well-known/* (exact boundary)
   * - Static files: /favicon.ico, /robots.txt, /sitemap.xml (exact matches)
   * - Public asset files by extension (.svg, .png, .webp, .woff2, .webmanifest)
   * - RSC and prefetch requests (handled by Next.js before middleware, but also handled in code)
   *
   * This ensures paths like /apiary or /admin-panel are not incorrectly excluded.
   */
  matcher: [
    /**
     * Match all paths EXCEPT:
     * 1. Exact static files: favicon.ico, robots.txt, sitemap.xml
     * 2. Framework paths with boundaries: _next/static, _next/image
     * 3. Paths with explicit boundaries: /api/*, /uploads/*, /.well-known/*
     * 4. Public asset extensions: .svg, .png, .jpg, .webp, .woff2, .webmanifest, etc.
     */
    '/((?!(?:favicon\\.ico|robots\\.txt|sitemap\\.xml|api/|uploads/|\\.well-known/|_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff|woff2|ttf|eot|otf|webmanifest|ico)(?:\\?.*)?$))[^?]*)',
  ],
};
