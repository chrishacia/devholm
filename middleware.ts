import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { auth as authConfig } from '@/config/env';

// Cookie name must match auth.ts configuration
const COOKIE_NAME =
  process.env.NODE_ENV === 'production' ? '__Secure-authjs.session-token' : 'authjs.session-token';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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

export const config = {
  matcher: ['/admin/:path*'],
};
