import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { auth as authConfig } from '@/config/env';
import { resolvePublicRouteExtension } from '@core/lib/public-route-dispatcher.server';
import { responseForPublicRouteResolution } from '@core/lib/public-route-resolution-response.server';
import { shouldResolvePublicRoute } from '@core/lib/request-eligibility.server';
import { isAdminPath } from '@core/lib/path-boundaries.server';

const COOKIE_NAME =
  process.env.NODE_ENV === 'production' ? '__Secure-authjs.session-token' : 'authjs.session-token';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (shouldResolvePublicRoute(request)) {
    try {
      const resolution = await resolvePublicRouteExtension(pathname, request);
      const response = responseForPublicRouteResolution(pathname, resolution);

      if (response !== null) {
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
    } catch (error) {
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

  if (pathname === '/admin/login') {
    return NextResponse.next();
  }

  if (isAdminPath(pathname)) {
    const token = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
      cookieName: COOKIE_NAME,
    });

    if (!token) {
      const url = new URL('/admin/login', request.url);
      url.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(url);
    }

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

export const config = {
  matcher: [
    '/((?!(?:favicon\\.ico|robots\\.txt|sitemap\\.xml|api/|uploads/|\\.well-known/|_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff|woff2|ttf|eot|otf|webmanifest|ico)(?:\\?.*)?$))[^?]*)',
  ],
};
