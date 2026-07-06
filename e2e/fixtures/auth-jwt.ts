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

/**
 * Deterministic UUID-format IDs for E2E-only fixture identities.
 *
 * These are stable across all test runs. They MUST remain valid UUIDs because
 * the dashboard route calls getAuthOnboardingStatus(userId) → getLinkedAccountsForUser(userId)
 * which queries auth_provider_accounts WHERE user_id = userId. That column is typed
 * uuid in PostgreSQL (migration 20260604000000_add_auth_foundation.ts), so passing a
 * non-UUID string (e.g. Date.now()) causes:
 *   ERROR: invalid input syntax for type uuid
 * which propagates as an unhandled exception → HTTP 500.
 *
 * A valid UUID with no matching rows in auth_provider_accounts returns an empty
 * array — no persisted site_users row is required for the query to succeed.
 * These IDs are signed session-claim fixtures for HTTP authorization testing only.
 *
 * Do NOT use these IDs in production code.
 */
export const E2E_FIXTURE_IDS = {
  admin: 'e2e00000-0000-4000-8000-00000000a001',
  superadmin: 'e2e00000-0000-4000-8000-00000000a002',
  'admin-access-only': 'e2e00000-0000-4000-8000-00000000a003',
  'users-manage-only': 'e2e00000-0000-4000-8000-00000000a004',
  member: 'e2e00000-0000-4000-8000-00000000a005',
} as const;

export interface TestIdentity {
  id: string;
  email: string;
  role: string;
  roles: string[];
  permissions: string[];
  isAdmin: boolean;
}

/**
 * Create a test identity for Stage 3 authorization testing.
 *
 * Each identity type has a deterministic UUID-format ID that is stable across
 * test runs and corresponds to a seeded site_users record (002_e2e_fixture_users.ts).
 */
export function createTestIdentity(
  type: 'admin' | 'superadmin' | 'admin-access-only' | 'users-manage-only' | 'member'
): TestIdentity {
  const baseId = E2E_FIXTURE_IDS[type];

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
        isAdmin: true,
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
