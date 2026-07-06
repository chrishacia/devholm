/**
 * E2E JWT Authentication Fixture
 *
 * Provides Auth.js-compatible JWT token signing for E2E tests.
 * This enables testing of Stage 3 authorization with different identities
 * without going through credential login (which auto-promotes to superadmin).
 *
 * Usage:
 *   const token = await signSessionToken(testIdentity);
 *   await page.context().addCookies([{ name: 'authjs.session-token', value: token, ... }]);
 */

import { SignJWT } from 'jose';

// E2E test auth secret (must match environment variable or fallback)
const AUTH_SECRET = process.env.AUTH_SECRET || 'dev-secret-change-in-production';
const SECRET_KEY = new TextEncoder().encode(AUTH_SECRET.padEnd(32, ' ').slice(0, 32));

export interface TestIdentity {
  id: string;
  email: string;
  role: string;
  roles: string[];
  permissions: string[];
  isAdmin: boolean;
}

/**
 * Create a test identity for Stage 3 authorization testing
 */
export function createTestIdentity(
  type: 'admin' | 'superadmin' | 'admin-access-only' | 'users-manage-only' | 'member'
): TestIdentity {
  const baseId = `e2e-${type}-${Date.now()}`;

  switch (type) {
    case 'admin':
      return {
        id: baseId,
        email: `${type}@example.test`,
        role: 'admin',
        roles: ['admin'],
        permissions: [],
        isAdmin: true,
      };

    case 'superadmin':
      return {
        id: baseId,
        email: `${type}@example.test`,
        role: 'superadmin',
        roles: ['superadmin'],
        permissions: [],
        isAdmin: true,
      };

    case 'admin-access-only':
      return {
        id: baseId,
        email: `${type}@example.test`,
        role: 'member',
        roles: ['member'],
        permissions: ['admin.access'],
        isAdmin: false,
      };

    case 'users-manage-only':
      return {
        id: baseId,
        email: `${type}@example.test`,
        role: 'member',
        roles: ['member'],
        permissions: ['users.manage'],
        isAdmin: false,
      };

    case 'member':
      return {
        id: baseId,
        email: `${type}@example.test`,
        role: 'member',
        roles: ['member'],
        permissions: [],
        isAdmin: false,
      };
  }
}

/**
 * Sign an Auth.js-compatible JWT session token
 */
export async function signSessionToken(identity: TestIdentity): Promise<string> {
  const now = Date.now();
  const expiresAt = now + 30 * 24 * 60 * 60 * 1000; // 30 days

  const token = await new SignJWT({
    id: identity.id,
    email: identity.email,
    role: identity.role,
    roles: identity.roles,
    permissions: identity.permissions,
    isAdmin: identity.isAdmin,
    installCompleted: true,
    iat: Math.floor(now / 1000),
    exp: Math.floor(expiresAt / 1000),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .sign(SECRET_KEY);

  return token;
}

/**
 * Format token as a browser cookie for Playwright
 */
export function formatSessionCookie(token: string, cookieName = 'authjs.session-token') {
  return {
    name: cookieName,
    value: token,
    domain: 'localhost',
    path: '/',
    secure: false,
    httpOnly: true,
    sameSite: 'Lax' as const,
    expires: Date.now() + 30 * 24 * 60 * 60 * 1000,
  };
}

/**
 * Set a test identity's session in the browser context
 */
export async function setTestIdentitySession(
  context: import('@playwright/test').BrowserContext,
  identity: TestIdentity,
  cookieName = 'authjs.session-token'
): Promise<void> {
  const token = await signSessionToken(identity);
  const cookie = formatSessionCookie(token, cookieName);
  await context.addCookies([cookie]);
}
