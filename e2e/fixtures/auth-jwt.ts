/**
 * E2E Auth.js Session Token Fixture
 *
 * Provides Auth.js-compatible session tokens for E2E tests.
 * Uses the official Auth.js encode/decode functions to ensure tokens
 * are compatible with production authentication.
 *
 * This enables testing Stage 3 authorization with different identities
 * without going through credential login (which auto-promotes to superadmin).
 */

import { encode, decode } from 'next-auth/jwt';

// Use production-compatible configuration
const COOKIE_NAME =
  process.env.NODE_ENV === 'production' ? '__Secure-authjs.session-token' : 'authjs.session-token';

const SECRET =
  process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || 'dev-secret-change-in-production';

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
 * Sign an Auth.js-compatible JWE session token
 * Uses the official encode function to ensure production compatibility
 */
export async function createSessionToken(identity: TestIdentity): Promise<string> {
  const token = await encode({
    token: {
      id: identity.id,
      email: identity.email,
      role: identity.role,
      roles: identity.roles,
      permissions: identity.permissions,
      isAdmin: identity.isAdmin,
      installCompleted: true,
    },
    secret: SECRET,
    salt: COOKIE_NAME,
    maxAge: 30 * 24 * 60 * 60,
  });

  return token;
}

/**
 * Decode an Auth.js session token for verification
 * Tests use this to prove the encoded token contains the expected claims
 */
export async function decodeSessionToken(token: string) {
  return decode({
    token,
    secret: SECRET,
    salt: COOKIE_NAME,
  });
}

/**
 * Create a session cookie header for direct HTTP requests
 * This is the preferred approach for E2E tests
 */
export async function createSessionCookieHeader(identity: TestIdentity): Promise<string> {
  const token = await createSessionToken(identity);
  return `${COOKIE_NAME}=${encodeURIComponent(token)}`;
}

/**
 * Regression test: verify encode/decode round-trip
 * This test should be called in the test suite to prove the fixture is working
 */
export async function verifySessionTokenRoundTrip(identity: TestIdentity): Promise<boolean> {
  const token = await createSessionToken(identity);
  const decoded = await decodeSessionToken(token);

  if (!decoded) {
    return false;
  }

  // Verify all critical claims are present and correct
  return (
    decoded.id === identity.id &&
    decoded.email === identity.email &&
    decoded.role === identity.role &&
    JSON.stringify(decoded.roles) === JSON.stringify(identity.roles) &&
    JSON.stringify(decoded.permissions) === JSON.stringify(identity.permissions) &&
    decoded.isAdmin === identity.isAdmin
  );
}
