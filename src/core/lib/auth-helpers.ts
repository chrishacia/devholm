/**
 * Authentication Helpers
 * ======================
 *
 * Helper functions for authentication in API routes.
 * Centralizes getToken configuration to match NextAuth cookie settings.
 */

import { getToken as nextAuthGetToken, JWT } from 'next-auth/jwt';
import { NextRequest } from 'next/server';
import { auth } from '@/config/env';

const ADMIN_ROLE_SLUGS = new Set(['superadmin', 'admin']);

interface AuthTokenShape {
  role?: string;
  roles?: string[];
  permissions?: string[];
}

/**
 * Cookie name used by NextAuth - must match auth.ts configuration
 */
const COOKIE_NAME =
  process.env.NODE_ENV === 'production' ? '__Secure-authjs.session-token' : 'authjs.session-token';

/**
 * Get the authentication token from a request.
 * This wrapper ensures the correct cookie name and secret are used.
 *
 * @param request - The NextRequest object
 * @returns The JWT token or null if not authenticated
 */
export async function getAdminToken(request: NextRequest): Promise<JWT | null> {
  return nextAuthGetToken({
    req: request,
    secret: auth.secret,
    cookieName: COOKIE_NAME,
  });
}

export function hasRole(subject: AuthTokenShape | null | undefined, role: string): boolean {
  if (!subject) {
    return false;
  }

  return subject.role === role || Boolean(subject.roles?.includes(role));
}

export function hasPermission(
  subject: AuthTokenShape | null | undefined,
  permission: string
): boolean {
  return Boolean(subject?.permissions?.includes(permission));
}

export function hasAdminAccess(subject: AuthTokenShape | null | undefined): boolean {
  if (!subject) {
    return false;
  }

  return (
    (subject.roles ?? []).some((role) => ADMIN_ROLE_SLUGS.has(role)) ||
    (subject.role ? ADMIN_ROLE_SLUGS.has(subject.role) : false) ||
    hasPermission(subject, 'admin.access')
  );
}

export async function verifyAuthenticated(request: NextRequest): Promise<JWT | null> {
  const token = await getAdminToken(request);
  return token ?? null;
}

export async function verifyPermission(
  request: NextRequest,
  permission: string
): Promise<JWT | null> {
  const token = await getAdminToken(request);
  if (!token) {
    return null;
  }

  // Compatibility path: role-based admins can still access admin APIs while
  // permission grants are being rolled out across migrated environments.
  if (!hasPermission(token, permission) && !hasAdminAccess(token)) {
    return null;
  }

  return token;
}

/**
 * Verify that a request is from an authenticated admin user.
 *
 * @param request - The NextRequest object
 * @returns The JWT token if authenticated as admin, null otherwise
 */
export async function verifyAdmin(request: NextRequest): Promise<JWT | null> {
  const token = await getAdminToken(request);
  if (!token || !hasAdminAccess(token)) {
    return null;
  }
  return token;
}
