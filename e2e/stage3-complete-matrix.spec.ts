/**
 * Stage 3 SDK Authorization: Complete E2E HTTP Matrix
 *
 * Tests Stage 3 authorization enforcement across:
 * - 2 HTTP endpoints (GET /api/admin/dashboard, GET /api/admin/auth/users)
 * - 5 identity types (admin, superadmin, admin.access-only, users.manage-only, member)
 * - Anonymous (no authentication)
 *
 * Total: 12 authorization-result test cases
 *
 * Each test:
 * 1. Creates a test identity
 * 2. Encodes an Auth.js session token
 * 3. Sends the HTTP request with the session cookie header
 * 4. Verifies the expected authorization result
 */

import { test, expect } from '@playwright/test';
import {
  createTestIdentity,
  createSessionCookieHeader,
  verifySessionTokenRoundTrip,
  decodeSessionToken,
} from './fixtures/auth-jwt';

test.describe('Stage 3 Authorization: Complete E2E HTTP Matrix', () => {
  // =========================================================================
  // Fixture Verification: Auth.js Token Encode/Decode Round-Trip
  // =========================================================================

  test.describe('Auth.js token fixture verification', () => {
    test('admin-role token encodes and decodes correctly', async () => {
      const identity = createTestIdentity('admin');
      const token = await (async () => {
        const h = await import('./fixtures/auth-jwt');
        return h.createSessionToken(identity);
      })();
      const decoded = await decodeSessionToken(token);
      expect(decoded).toBeDefined();
      expect(decoded?.id).toBe(identity.id);
      expect(decoded?.email).toBe(identity.email);
      expect(decoded?.role).toBe('admin');
      expect(decoded?.roles).toEqual(['admin']);
      expect(decoded?.isAdmin).toBe(true);
    });

    test('superadmin-role token encodes and decodes correctly', async () => {
      const identity = createTestIdentity('superadmin');
      const token = await (async () => {
        const h = await import('./fixtures/auth-jwt');
        return h.createSessionToken(identity);
      })();
      const decoded = await decodeSessionToken(token);
      expect(decoded).toBeDefined();
      expect(decoded?.id).toBe(identity.id);
      expect(decoded?.email).toBe(identity.email);
      expect(decoded?.role).toBe('superadmin');
      expect(decoded?.roles).toEqual(['superadmin']);
      expect(decoded?.isAdmin).toBe(true);
    });

    test('admin.access permission-only token encodes and decodes correctly', async () => {
      const identity = createTestIdentity('admin-access-only');
      const token = await (async () => {
        const h = await import('./fixtures/auth-jwt');
        return h.createSessionToken(identity);
      })();
      const decoded = await decodeSessionToken(token);
      expect(decoded).toBeDefined();
      expect(decoded?.id).toBe(identity.id);
      expect(decoded?.email).toBe(identity.email);
      expect(decoded?.role).toBe('member');
      expect(decoded?.roles).toEqual(['member']);
      expect(decoded?.permissions).toContain('admin.access');
      expect(decoded?.isAdmin).toBe(true);
    });

    test('users.manage permission-only token encodes and decodes correctly', async () => {
      const identity = createTestIdentity('users-manage-only');
      const token = await (async () => {
        const h = await import('./fixtures/auth-jwt');
        return h.createSessionToken(identity);
      })();
      const decoded = await decodeSessionToken(token);
      expect(decoded).toBeDefined();
      expect(decoded?.id).toBe(identity.id);
      expect(decoded?.email).toBe(identity.email);
      expect(decoded?.role).toBe('member');
      expect(decoded?.roles).toEqual(['member']);
      expect(decoded?.permissions).toContain('users.manage');
      expect(decoded?.isAdmin).toBe(false);
    });

    test('member token encodes and decodes correctly', async () => {
      const identity = createTestIdentity('member');
      const roundTripValid = await verifySessionTokenRoundTrip(identity);
      expect(roundTripValid).toBe(true);
      const token = await (async () => {
        const h = await import('./fixtures/auth-jwt');
        return h.createSessionToken(identity);
      })();
      const decoded = await decodeSessionToken(token);
      expect(decoded).toBeDefined();
      expect(decoded?.id).toBe(identity.id);
      expect(decoded?.email).toBe(identity.email);
      expect(decoded?.role).toBe('member');
      expect(decoded?.roles).toEqual(['member']);
      expect(decoded?.permissions).toEqual([]);
      expect(decoded?.isAdmin).toBe(false);
    });
  });

  // =========================================================================
  // Anonymous Access (no authentication)
  // =========================================================================

  test.describe('Anonymous (unauthenticated)', () => {
    test('GET /api/admin/dashboard returns 401', async ({ request }) => {
      const response = await request.get('/api/admin/dashboard');
      expect(response.status()).toBe(401);
    });

    test('GET /api/admin/auth/users returns 401', async ({ request }) => {
      const response = await request.get('/api/admin/auth/users');
      expect(response.status()).toBe(401);
    });
  });

  // =========================================================================
  // Admin-role identity (2 tests: 12-case matrix part 1-2)
  // =========================================================================

  test('admin-role: GET /api/admin/dashboard returns 200', async ({ request }) => {
    const identity = createTestIdentity('admin');
    const cookie = await createSessionCookieHeader(identity);

    const response = await request.get('/api/admin/dashboard', {
      headers: { Cookie: cookie },
    });

    expect(response.status()).toBe(200);
  });

  test('admin-role: GET /api/admin/auth/users returns 200', async ({ request }) => {
    const identity = createTestIdentity('admin');
    const cookie = await createSessionCookieHeader(identity);

    const response = await request.get('/api/admin/auth/users', {
      headers: { Cookie: cookie },
    });

    expect(response.status()).toBe(200);
  });

  // =========================================================================
  // Superadmin-role identity (2 tests: 12-case matrix part 3-4)
  // =========================================================================

  test('superadmin-role: GET /api/admin/dashboard returns 200', async ({ request }) => {
    const identity = createTestIdentity('superadmin');
    const cookie = await createSessionCookieHeader(identity);

    const response = await request.get('/api/admin/dashboard', {
      headers: { Cookie: cookie },
    });

    expect(response.status()).toBe(200);
  });

  test('superadmin-role: GET /api/admin/auth/users returns 200', async ({ request }) => {
    const identity = createTestIdentity('superadmin');
    const cookie = await createSessionCookieHeader(identity);

    const response = await request.get('/api/admin/auth/users', {
      headers: { Cookie: cookie },
    });

    expect(response.status()).toBe(200);
  });

  // =========================================================================
  // admin.access permission-only (2 tests: 12-case matrix part 5-6)
  // =========================================================================

  test('admin.access permission only: GET /api/admin/dashboard returns 200', async ({
    request,
  }) => {
    const identity = createTestIdentity('admin-access-only');
    const cookie = await createSessionCookieHeader(identity);

    const response = await request.get('/api/admin/dashboard', {
      headers: { Cookie: cookie },
    });

    expect(response.status()).toBe(200);
  });

  test('admin.access permission only: GET /api/admin/auth/users returns 200', async ({
    request,
  }) => {
    const identity = createTestIdentity('admin-access-only');
    const cookie = await createSessionCookieHeader(identity);

    const response = await request.get('/api/admin/auth/users', {
      headers: { Cookie: cookie },
    });

    expect(response.status()).toBe(200);
  });

  // =========================================================================
  // users.manage permission-only (2 tests: 12-case matrix part 7-8)
  // =========================================================================

  test('users.manage permission only: GET /api/admin/dashboard returns 403', async ({
    request,
  }) => {
    const identity = createTestIdentity('users-manage-only');
    const cookie = await createSessionCookieHeader(identity);

    const response = await request.get('/api/admin/dashboard', {
      headers: { Cookie: cookie },
    });

    expect(response.status()).toBe(403);
  });

  test('users.manage permission only: GET /api/admin/auth/users returns 200', async ({
    request,
  }) => {
    const identity = createTestIdentity('users-manage-only');
    const cookie = await createSessionCookieHeader(identity);

    const response = await request.get('/api/admin/auth/users', {
      headers: { Cookie: cookie },
    });

    expect(response.status()).toBe(200);
  });

  // =========================================================================
  // Ordinary member (2 tests: 12-case matrix part 9-10)
  // =========================================================================

  test('ordinary member: GET /api/admin/dashboard returns 403', async ({ request }) => {
    const identity = createTestIdentity('member');
    const cookie = await createSessionCookieHeader(identity);

    const response = await request.get('/api/admin/dashboard', {
      headers: { Cookie: cookie },
    });

    expect(response.status()).toBe(403);
  });

  test('ordinary member: GET /api/admin/auth/users returns 403', async ({ request }) => {
    const identity = createTestIdentity('member');
    const cookie = await createSessionCookieHeader(identity);

    const response = await request.get('/api/admin/auth/users', {
      headers: { Cookie: cookie },
    });

    expect(response.status()).toBe(403);
  });
});
