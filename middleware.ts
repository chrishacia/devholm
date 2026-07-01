import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { auth as authConfig } from '@/config/env';
import { resolvePublicRouteExtension } from '@core/lib/extensions.server';

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
 *    A. Public route extension check (if path is NOT /admin, /api, /static)
 *       - Async plugins can claim path with Response
 *       - If claimed, response returned immediately
 *       - If not claimed, continue to step 2B
 *       - If error (conflict, exception), log and continue
 *    B. Admin route protection (if path starts with /admin)
 *       - Auth check
 *       - Role check
 *       - Setup completion check
 *
 * 3. AFTER middleware:
 *    - Next.js App Router evaluates routes
 *    - Exact dev pages (higher specificity)
 *    - Catch-all [...]slug] for CMS pages
 *    - 404 if no match
 *
 * IMPORTANT: Public route extensions run at middleware level, which is
 * BEFORE the App Router. This means:
 * - Extensions can claim any path (except /admin, /api, /static)
 * - Dev pages and CMS pages only run if no extension claims the path
 * - Exceptions in extensions don't break page rendering (logged and skipped)
 * - Multiple extensions claiming same path = conflict (error logged, no response)
 *
 * Database Availability:
 * - If extension calls helpers.getDb() and database is down, exception is caught
 * - Middleware continues with NextResponse.next()
 * - App Router proceeds normally, dev pages load without plugin data
 * - Core DevHolm functionality is not blocked by plugin errors
 */

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  /**
   * Phase 1: Check public route extensions
   *
   * Only check paths that are NOT admin/api/static.
   * These paths would normally go to App Router (dev pages or CMS).
   * Extensions get a chance to claim them first.
   */
  if (
    !pathname.startsWith('/admin') &&
    !pathname.startsWith('/api') &&
    !pathname.startsWith('/static')
  ) {
    try {
      const response = await resolvePublicRouteExtension(pathname, request);
      if (response) {
        return response;
      }
    } catch (error) {
      /**
       * Error handling:
       * - Conflict (multiple extensions claimed): log error, DON'T return response
       * - Extension threw exception: log error, continue
       * - Database unavailable: caught by extension, logged, continue
       *
       * In all error cases, middleware continues with NextResponse.next()
       * so App Router can still serve dev pages or CMS content.
       */
      console.error('Public route extension error:', error);
      // Continue to regular routing - do NOT return error response
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

  // Protect all admin routes
  if (pathname.startsWith('/admin')) {
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
 *
 * Note: RSC (React Server Component) requests and prefetch requests
 * are handled by Next.js request rewriting before middleware.
 * The middleware sees the original URL, not the RSC fetch suffix.
 */
export const config = {
  matcher: [
    /**
     * Match all paths
     * Next.js excludes metadata routes automatically
     */
    '/:path*',
  ],
};
