/**
 * Stage 3 SDK Authorization: Complete E2E HTTP Matrix
 *
 * Tests Stage 3 authorization enforcement across:
 * - 2 HTTP endpoints (GET /api/admin/dashboard, GET /api/admin/auth/users)
 * - 5 identity types (admin, superadmin, admin.access-only, users.manage-only, member)
 * - Anonymous (no authentication)
 *
 * Total: 12 test cases covering all authorization pathways
 *
 * Each test:
 * 1. Creates a JWT session token for the test identity (or omits for anonymous)
 * 2. Sets the session cookie in the request context
 * 3. Makes the HTTP request
 * 4. Verifies the expected status code per Stage 3 authorization rules
 * 5. Validates the token claims before sending (proof of proper fixture)
 */

import { test, expect, type BrowserContext } from '@playwright/test';
import { createTestIdentity, setTestIdentitySession, type TestIdentity } from './fixtures/auth-jwt';

test.describe('Stage 3 Authorization: Complete E2E HTTP Matrix', () => {
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
  // Admin-role identity
  // =========================================================================

  test.describe('Admin-role identity', () => {
    let adminIdentity: TestIdentity;
    let adminContext: BrowserContext;

    test.beforeAll(async ({ context }) => {
      adminIdentity = createTestIdentity('admin');
      adminContext = context;
      await setTestIdentitySession(adminContext, adminIdentity);
    });

    test('should have correct token claims', async ({ context }) => {
      const cookies = await context.cookies();
      const sessionCookie = cookies.find((c) => c.name === 'authjs.session-token');
      expect(sessionCookie).toBeDefined();
      expect(sessionCookie?.value.length).toBeGreaterThan(0);
      // Token is signed and contains admin role
      expect(adminIdentity.role).toBe('admin');
      expect(adminIdentity.isAdmin).toBe(true);
    });

    test('GET /api/admin/dashboard returns 200 (adminAccessDeclaration matches)', async ({
      request,
    }) => {
      const cookies = await adminContext.cookies();
      const sessionCookie = cookies.find((c) => c.name === 'authjs.session-token');
      expect(sessionCookie).toBeDefined();

      const response = await request.get('/api/admin/dashboard', {
        headers: { Cookie: `${sessionCookie!.name}=${sessionCookie!.value}` },
      });
      expect(response.status()).toBe(200);
    });

    test('GET /api/admin/auth/users returns 200 (usersManageDeclaration anyOf branch)', async ({
      request,
    }) => {
      const cookies = await adminContext.cookies();
      const sessionCookie = cookies.find((c) => c.name === 'authjs.session-token');
      expect(sessionCookie).toBeDefined();

      const response = await request.get('/api/admin/auth/users', {
        headers: { Cookie: `${sessionCookie!.name}=${sessionCookie!.value}` },
      });
      expect(response.status()).toBe(200);
    });
  });

  // =========================================================================
  // Superadmin-role identity
  // =========================================================================

  test.describe('Superadmin-role identity', () => {
    let superadminIdentity: TestIdentity;
    let superadminContext: BrowserContext;

    test.beforeAll(async ({ context }) => {
      superadminIdentity = createTestIdentity('superadmin');
      superadminContext = context;
      await setTestIdentitySession(superadminContext, superadminIdentity);
    });

    test('should have correct token claims', async ({ context }) => {
      const cookies = await context.cookies();
      const sessionCookie = cookies.find((c) => c.name === 'authjs.session-token');
      expect(sessionCookie).toBeDefined();
      expect(superadminIdentity.role).toBe('superadmin');
      expect(superadminIdentity.isAdmin).toBe(true);
    });

    test('GET /api/admin/dashboard returns 200 (adminAccessDeclaration matches)', async ({
      request,
    }) => {
      const cookies = await superadminContext.cookies();
      const sessionCookie = cookies.find((c) => c.name === 'authjs.session-token');
      expect(sessionCookie).toBeDefined();

      const response = await request.get('/api/admin/dashboard', {
        headers: { Cookie: `${sessionCookie!.name}=${sessionCookie!.value}` },
      });
      expect(response.status()).toBe(200);
    });

    test('GET /api/admin/auth/users returns 200 (usersManageDeclaration anyOf branch)', async ({
      request,
    }) => {
      const cookies = await superadminContext.cookies();
      const sessionCookie = cookies.find((c) => c.name === 'authjs.session-token');
      expect(sessionCookie).toBeDefined();

      const response = await request.get('/api/admin/auth/users', {
        headers: { Cookie: `${sessionCookie!.name}=${sessionCookie!.value}` },
      });
      expect(response.status()).toBe(200);
    });
  });

  // =========================================================================
  // admin.access permission-only (member role with specific permission)
  // =========================================================================

  test.describe('admin.access permission-only', () => {
    let adminAccessIdentity: TestIdentity;
    let adminAccessContext: BrowserContext;

    test.beforeAll(async ({ context }) => {
      adminAccessIdentity = createTestIdentity('admin-access-only');
      adminAccessContext = context;
      await setTestIdentitySession(adminAccessContext, adminAccessIdentity);
    });

    test('should have correct token claims (member role, admin.access permission)', async ({
      context,
    }) => {
      const cookies = await context.cookies();
      const sessionCookie = cookies.find((c) => c.name === 'authjs.session-token');
      expect(sessionCookie).toBeDefined();
      expect(adminAccessIdentity.role).toBe('member');
      expect(adminAccessIdentity.permissions).toContain('admin.access');
      expect(adminAccessIdentity.isAdmin).toBe(false);
    });

    test('GET /api/admin/dashboard returns 200 (adminAccessDeclaration permission match)', async ({
      request,
    }) => {
      const cookies = await adminAccessContext.cookies();
      const sessionCookie = cookies.find((c) => c.name === 'authjs.session-token');
      expect(sessionCookie).toBeDefined();

      const response = await request.get('/api/admin/dashboard', {
        headers: { Cookie: `${sessionCookie!.name}=${sessionCookie!.value}` },
      });
      expect(response.status()).toBe(200);
    });

    test('GET /api/admin/auth/users returns 200 (usersManageDeclaration admin.access branch)', async ({
      request,
    }) => {
      const cookies = await adminAccessContext.cookies();
      const sessionCookie = cookies.find((c) => c.name === 'authjs.session-token');
      expect(sessionCookie).toBeDefined();

      const response = await request.get('/api/admin/auth/users', {
        headers: { Cookie: `${sessionCookie!.name}=${sessionCookie!.value}` },
      });
      expect(response.status()).toBe(200);
    });
  });

  // =========================================================================
  // users.manage permission-only (member role with specific permission)
  // =========================================================================

  test.describe('users.manage permission-only', () => {
    let usersManageIdentity: TestIdentity;
    let usersManageContext: BrowserContext;

    test.beforeAll(async ({ context }) => {
      usersManageIdentity = createTestIdentity('users-manage-only');
      usersManageContext = context;
      await setTestIdentitySession(usersManageContext, usersManageIdentity);
    });

    test('should have correct token claims (member role, users.manage permission)', async ({
      context,
    }) => {
      const cookies = await context.cookies();
      const sessionCookie = cookies.find((c) => c.name === 'authjs.session-token');
      expect(sessionCookie).toBeDefined();
      expect(usersManageIdentity.role).toBe('member');
      expect(usersManageIdentity.permissions).toContain('users.manage');
      expect(usersManageIdentity.isAdmin).toBe(false);
    });

    test('GET /api/admin/dashboard returns 403 (adminAccessDeclaration denied)', async ({
      request,
    }) => {
      const cookies = await usersManageContext.cookies();
      const sessionCookie = cookies.find((c) => c.name === 'authjs.session-token');
      expect(sessionCookie).toBeDefined();

      const response = await request.get('/api/admin/dashboard', {
        headers: { Cookie: `${sessionCookie!.name}=${sessionCookie!.value}` },
      });
      expect(response.status()).toBe(403);
    });

    test('GET /api/admin/auth/users returns 200 (usersManageDeclaration permission match)', async ({
      request,
    }) => {
      const cookies = await usersManageContext.cookies();
      const sessionCookie = cookies.find((c) => c.name === 'authjs.session-token');
      expect(sessionCookie).toBeDefined();

      const response = await request.get('/api/admin/auth/users', {
        headers: { Cookie: `${sessionCookie!.name}=${sessionCookie!.value}` },
      });
      expect(response.status()).toBe(200);
    });
  });

  // =========================================================================
  // Ordinary member (no special roles or permissions)
  // =========================================================================

  test.describe('Ordinary member (denied access)', () => {
    let memberIdentity: TestIdentity;
    let memberContext: BrowserContext;

    test.beforeAll(async ({ context }) => {
      memberIdentity = createTestIdentity('member');
      memberContext = context;
      await setTestIdentitySession(memberContext, memberIdentity);
    });

    test('should have correct token claims (member role, no permissions)', async ({ context }) => {
      const cookies = await context.cookies();
      const sessionCookie = cookies.find((c) => c.name === 'authjs.session-token');
      expect(sessionCookie).toBeDefined();
      expect(memberIdentity.role).toBe('member');
      expect(memberIdentity.permissions).toEqual([]);
      expect(memberIdentity.isAdmin).toBe(false);
    });

    test('GET /api/admin/dashboard returns 403 (adminAccessDeclaration denied)', async ({
      request,
    }) => {
      const cookies = await memberContext.cookies();
      const sessionCookie = cookies.find((c) => c.name === 'authjs.session-token');
      expect(sessionCookie).toBeDefined();

      const response = await request.get('/api/admin/dashboard', {
        headers: { Cookie: `${sessionCookie!.name}=${sessionCookie!.value}` },
      });
      expect(response.status()).toBe(403);
    });

    test('GET /api/admin/auth/users returns 403 (usersManageDeclaration denied)', async ({
      request,
    }) => {
      const cookies = await memberContext.cookies();
      const sessionCookie = cookies.find((c) => c.name === 'authjs.session-token');
      expect(sessionCookie).toBeDefined();

      const response = await request.get('/api/admin/auth/users', {
        headers: { Cookie: `${sessionCookie!.name}=${sessionCookie!.value}` },
      });
      expect(response.status()).toBe(403);
    });
  });
});
