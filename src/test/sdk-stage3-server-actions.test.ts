/**
 * @vitest-environment node
 * Stage 3 Server Action Authorization Tests
 *
 * Tests the actual exported Server Actions with real authorization wrappers.
 * Only the auth seam is mocked; the Stage 3 authorization logic is tested end-to-end.
 *
 * NOTE: These tests run in Node environment to support server-only module imports.
 *
 * These tests verify:
 * 1. Server Actions import and execute properly
 * 2. Authorization declarations are evaluated correctly
 * 3. Action bodies execute only when authorization succeeds
 * 4. Results are serializable across the server/client boundary
 * 5. Different identity types receive correct authorization decisions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Session } from 'next-auth';
import {
  stage3AdminAccessAuthorizationProofAction,
  stage3UsersManageAuthorizationProofAction,
  type ServerActionResult,
} from '@/app/admin/actions/sdk-authorization-proof';

// Mock the auth module
vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

import { auth } from '@/auth';

const mockAuth = auth as ReturnType<typeof vi.fn>;

/**
 * Helper: Create a mock session with specified role and permissions
 */
function createMockSession(
  userId: string,
  role: string,
  permissions: string[] = [],
  isAdmin = false
): Session {
  return {
    user: {
      id: userId,
      email: `${role}@example.test`,
      name: `Test ${role}`,
      role,
      roles: [role],
      permissions,
      isAdmin,
      installCompleted: true,
    },
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

describe('Stage 3 Server Action Authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // =========================================================================
  // stage3AdminAccessAuthorizationProofAction Tests
  // =========================================================================

  describe('stage3AdminAccessAuthorizationProofAction', () => {
    it('should allow admin-role identity', async () => {
      const session = createMockSession('admin-123', 'admin', [], true);
      mockAuth.mockResolvedValueOnce(session);

      const result = await stage3AdminAccessAuthorizationProofAction();

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.result).toBe('allow');
      expect(result.data).toBeDefined();
      expect(result.data?.proof).toBe('admin-access-authorized');
      expect(result.data?.authorizedUserId).toBe('admin-123');
    });

    it('should allow superadmin-role identity', async () => {
      const session = createMockSession('superadmin-456', 'superadmin', [], true);
      mockAuth.mockResolvedValueOnce(session);

      const result = await stage3AdminAccessAuthorizationProofAction();

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.result).toBe('allow');
      expect(result.data).toBeDefined();
      expect(result.data?.proof).toBe('admin-access-authorized');
      expect(result.data?.authorizedUserId).toBe('superadmin-456');
    });

    it('should allow member with admin.access permission', async () => {
      const session = createMockSession('member-789', 'member', ['admin.access'], false);
      mockAuth.mockResolvedValueOnce(session);

      const result = await stage3AdminAccessAuthorizationProofAction();

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.result).toBe('allow');
      expect(result.data).toBeDefined();
      expect(result.data?.proof).toBe('admin-access-authorized');
      expect(result.data?.authorizedUserId).toBe('member-789');
    });

    it('should deny member with users.manage permission (insufficient)', async () => {
      const session = createMockSession('member-users', 'member', ['users.manage'], false);
      mockAuth.mockResolvedValueOnce(session);

      const result = await stage3AdminAccessAuthorizationProofAction();

      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.result).toBe('forbidden');
      expect(result.data).toBeUndefined();
    });

    it('should deny ordinary member', async () => {
      const session = createMockSession('member-ordinary', 'member', [], false);
      mockAuth.mockResolvedValueOnce(session);

      const result = await stage3AdminAccessAuthorizationProofAction();

      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.result).toBe('forbidden');
      expect(result.data).toBeUndefined();
    });

    it('should reject unauthenticated (null session)', async () => {
      mockAuth.mockResolvedValueOnce(null);

      const result = await stage3AdminAccessAuthorizationProofAction();

      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.result).toBe('unauthenticated');
      expect(result.data).toBeUndefined();
    });

    it('should return serializable result', async () => {
      const session = createMockSession('admin-123', 'admin', [], true);
      mockAuth.mockResolvedValueOnce(session);

      const result = await stage3AdminAccessAuthorizationProofAction();

      // Result should be JSON-serializable
      const serialized = JSON.stringify(result);
      expect(serialized).toBeDefined();
      const deserialized = JSON.parse(serialized) as ServerActionResult;
      expect(deserialized.success).toBe(result.success);
      expect(deserialized.result).toBe(result.result);
    });
  });

  // =========================================================================
  // stage3UsersManageAuthorizationProofAction Tests
  // =========================================================================

  describe('stage3UsersManageAuthorizationProofAction', () => {
    it('should allow admin-role identity', async () => {
      const session = createMockSession('admin-123', 'admin', [], true);
      mockAuth.mockResolvedValueOnce(session);

      const result = await stage3UsersManageAuthorizationProofAction();

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.result).toBe('allow');
      expect(result.data).toBeDefined();
      expect(result.data?.proof).toBe('users-manage-authorized');
      expect(result.data?.authorizedUserId).toBe('admin-123');
    });

    it('should allow superadmin-role identity', async () => {
      const session = createMockSession('superadmin-456', 'superadmin', [], true);
      mockAuth.mockResolvedValueOnce(session);

      const result = await stage3UsersManageAuthorizationProofAction();

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.result).toBe('allow');
      expect(result.data).toBeDefined();
      expect(result.data?.proof).toBe('users-manage-authorized');
      expect(result.data?.authorizedUserId).toBe('superadmin-456');
    });

    it('should allow member with users.manage permission', async () => {
      const session = createMockSession('member-manage', 'member', ['users.manage'], false);
      mockAuth.mockResolvedValueOnce(session);

      const result = await stage3UsersManageAuthorizationProofAction();

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.result).toBe('allow');
      expect(result.data).toBeDefined();
      expect(result.data?.proof).toBe('users-manage-authorized');
      expect(result.data?.authorizedUserId).toBe('member-manage');
    });

    it('should allow member with admin.access permission (via anyOf branch)', async () => {
      const session = createMockSession('member-access', 'member', ['admin.access'], false);
      mockAuth.mockResolvedValueOnce(session);

      const result = await stage3UsersManageAuthorizationProofAction();

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.result).toBe('allow');
      expect(result.data).toBeDefined();
      expect(result.data?.proof).toBe('users-manage-authorized');
      expect(result.data?.authorizedUserId).toBe('member-access');
    });

    it('should deny ordinary member', async () => {
      const session = createMockSession('member-ordinary', 'member', [], false);
      mockAuth.mockResolvedValueOnce(session);

      const result = await stage3UsersManageAuthorizationProofAction();

      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.result).toBe('forbidden');
      expect(result.data).toBeUndefined();
    });

    it('should reject unauthenticated (null session)', async () => {
      mockAuth.mockResolvedValueOnce(null);

      const result = await stage3UsersManageAuthorizationProofAction();

      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.result).toBe('unauthenticated');
      expect(result.data).toBeUndefined();
    });

    it('should return serializable result', async () => {
      const session = createMockSession('admin-123', 'admin', [], true);
      mockAuth.mockResolvedValueOnce(session);

      const result = await stage3UsersManageAuthorizationProofAction();

      // Result should be JSON-serializable
      const serialized = JSON.stringify(result);
      expect(serialized).toBeDefined();
      const deserialized = JSON.parse(serialized) as ServerActionResult;
      expect(deserialized.success).toBe(result.success);
      expect(deserialized.result).toBe(result.result);
    });
  });

  // =========================================================================
  // Failure scenario tests
  // =========================================================================

  describe('Failure scenarios and edge cases', () => {
    it('should handle malformed session (no userId)', async () => {
      const session: Session = {
        user: {
          id: '',
          email: 'test@example.test',
          name: 'Test User',
          role: 'member',
          roles: ['member'],
          permissions: [],
          isAdmin: false,
          installCompleted: true,
        },
        expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };
      mockAuth.mockResolvedValueOnce(session);

      const result = await stage3AdminAccessAuthorizationProofAction();

      expect(result.success).toBe(false);
      expect(result.data).toBeUndefined();
    });

    it('should handle session with empty roles array', async () => {
      const session: Session = {
        user: {
          id: 'user-123',
          email: 'test@example.test',
          name: 'Test User',
          role: 'member',
          roles: [],
          permissions: [],
          isAdmin: false,
          installCompleted: true,
        },
        expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };
      mockAuth.mockResolvedValueOnce(session);

      const result = await stage3AdminAccessAuthorizationProofAction();

      expect(result.success).toBe(false);
      expect(result.result).toBe('forbidden');
      expect(result.data).toBeUndefined();
    });

    it('successful admin action returns proof payload with authorizedUserId', async () => {
      const session = createMockSession('admin-123', 'admin', [], true);
      mockAuth.mockResolvedValueOnce(session);

      const result = await stage3AdminAccessAuthorizationProofAction();

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.proof).toBe('admin-access-authorized');
      expect(result.data?.authorizedUserId).toBe('admin-123');
      expect(typeof result.data?.proof).toBe('string');
      expect(typeof result.data?.authorizedUserId).toBe('string');
    });

    it('successful users-manage action returns proof payload with authorizedUserId', async () => {
      const session = createMockSession('member-123', 'member', ['users.manage'], false);
      mockAuth.mockResolvedValueOnce(session);

      const result = await stage3UsersManageAuthorizationProofAction();

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.proof).toBe('users-manage-authorized');
      expect(result.data?.authorizedUserId).toBe('member-123');
      expect(typeof result.data?.proof).toBe('string');
      expect(typeof result.data?.authorizedUserId).toBe('string');
    });

    it('error message should not expose internal implementation details', async () => {
      mockAuth.mockResolvedValueOnce(null);

      const result = await stage3AdminAccessAuthorizationProofAction();

      expect(result.error).toBeDefined();
      expect(result.error).not.toMatch(/Error:|thrown|exception|internal|stack/i);
      expect(result.error?.length).toBeGreaterThan(0);
      expect(result.error?.length).toBeLessThan(500); // Reasonable length
    });

    it('denied access should not include data field', async () => {
      const session = createMockSession('member-ordinary', 'member', [], false);
      mockAuth.mockResolvedValueOnce(session);

      const result = await stage3AdminAccessAuthorizationProofAction();

      expect(result.success).toBe(false);
      expect(result.data).toBeUndefined();
      expect(result.data?.authorizedUserId).toBeUndefined();
    });
  });

  // =========================================================================
  // Cross-action consistency tests
  // =========================================================================

  describe('Authorization consistency across actions', () => {
    it('admin-role should be allowed on both actions', async () => {
      const session = createMockSession('admin-123', 'admin', [], true);

      mockAuth.mockResolvedValueOnce(session);
      const adminAccessResult = await stage3AdminAccessAuthorizationProofAction();

      mockAuth.mockResolvedValueOnce(session);
      const usersManageResult = await stage3UsersManageAuthorizationProofAction();

      expect(adminAccessResult.success).toBe(true);
      expect(usersManageResult.success).toBe(true);
    });

    it('ordinary member should be denied on both actions', async () => {
      const session = createMockSession('member-123', 'member', [], false);

      mockAuth.mockResolvedValueOnce(session);
      const adminAccessResult = await stage3AdminAccessAuthorizationProofAction();

      mockAuth.mockResolvedValueOnce(session);
      const usersManageResult = await stage3UsersManageAuthorizationProofAction();

      expect(adminAccessResult.success).toBe(false);
      expect(usersManageResult.success).toBe(false);
    });

    it('users.manage permission should allow users action but deny admin action', async () => {
      const session = createMockSession('member-123', 'member', ['users.manage'], false);

      mockAuth.mockResolvedValueOnce(session);
      const adminAccessResult = await stage3AdminAccessAuthorizationProofAction();

      mockAuth.mockResolvedValueOnce(session);
      const usersManageResult = await stage3UsersManageAuthorizationProofAction();

      expect(adminAccessResult.success).toBe(false); // users.manage ≠ admin.access
      expect(usersManageResult.success).toBe(true); // users.manage ✓
    });

    it('admin.access permission should allow both actions', async () => {
      const session = createMockSession('member-123', 'member', ['admin.access'], false);

      mockAuth.mockResolvedValueOnce(session);
      const adminAccessResult = await stage3AdminAccessAuthorizationProofAction();

      mockAuth.mockResolvedValueOnce(session);
      const usersManageResult = await stage3UsersManageAuthorizationProofAction();

      expect(adminAccessResult.success).toBe(true);
      expect(usersManageResult.success).toBe(true);
    });
  });

  // =========================================================================
  // Authentication Service Failure Tests
  // =========================================================================

  describe('Authentication service failure handling', () => {
    it('auth() exception in admin action returns policy-error', async () => {
      const error = new Error('Database connection failed');
      mockAuth.mockRejectedValueOnce(error);

      const result = await stage3AdminAccessAuthorizationProofAction();

      expect(result.success).toBe(false);
      expect(result.result).toBe('policy-error');
      expect(result.error).toBe('Authorization service unavailable');
      expect(result.data).toBeUndefined();
      // Verify raw error message is not exposed
      expect(result.error).not.toContain('Database connection failed');
      expect(result.error).not.toContain(error.message);
    });

    it('auth() exception in users-manage action returns policy-error', async () => {
      const error = new Error('Session cache expired');
      mockAuth.mockRejectedValueOnce(error);

      const result = await stage3UsersManageAuthorizationProofAction();

      expect(result.success).toBe(false);
      expect(result.result).toBe('policy-error');
      expect(result.error).toBe('Authorization service unavailable');
      expect(result.data).toBeUndefined();
      // Verify raw error message is not exposed
      expect(result.error).not.toContain('Session cache expired');
      expect(result.error).not.toContain(error.message);
    });

    it('policy-error result is distinguishable from ordinary forbidden', async () => {
      // First test: ordinary forbidden (session exists but permission denied)
      const deniedSession = createMockSession('member-123', 'member', [], false);
      mockAuth.mockResolvedValueOnce(deniedSession);
      const forbiddenResult = await stage3AdminAccessAuthorizationProofAction();

      // Second test: policy-error (auth service failed)
      mockAuth.mockRejectedValueOnce(new Error('Service unavailable'));
      const policyErrorResult = await stage3AdminAccessAuthorizationProofAction();

      // Both have success: false, but different result codes
      expect(forbiddenResult.success).toBe(false);
      expect(policyErrorResult.success).toBe(false);
      expect(forbiddenResult.result).toBe('forbidden');
      expect(policyErrorResult.result).toBe('policy-error');
      expect(forbiddenResult.error).not.toBe(policyErrorResult.error);
    });
  });

  // =========================================================================
  // Malformed Session Tests
  // =========================================================================

  describe('Malformed session handling', () => {
    it('session with empty userId returns unauthenticated', async () => {
      const malformedSession: Session = {
        user: {
          id: '',
          email: 'test@example.test',
          name: 'Test User',
          role: 'member',
          roles: ['member'],
          permissions: [],
          isAdmin: false,
          installCompleted: true,
        },
        expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };
      mockAuth.mockResolvedValueOnce(malformedSession);

      const result = await stage3AdminAccessAuthorizationProofAction();

      expect(result.success).toBe(false);
      expect(result.result).toBe('unauthenticated');
      expect(result.data).toBeUndefined();
    });

    it('session with null userId fails safely', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const malformedSession: any = {
        user: {
          id: null,
          email: 'test@example.test',
          name: 'Test User',
          role: 'member',
          roles: ['member'],
          permissions: [],
          isAdmin: false,
          installCompleted: true,
        },
        expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };
      mockAuth.mockResolvedValueOnce(malformedSession);

      const result = await stage3AdminAccessAuthorizationProofAction();

      expect(result.success).toBe(false);
      // Should fail safely with unauthenticated or forbidden, not crash
      expect(['unauthenticated', 'forbidden']).toContain(result.result);
      expect(result.data).toBeUndefined();
    });

    it('session with empty roles array fails closed', async () => {
      const malformedSession: Session = {
        user: {
          id: 'user-123',
          email: 'test@example.test',
          name: 'Test User',
          role: 'admin',
          roles: [],
          permissions: [],
          isAdmin: true,
          installCompleted: true,
        },
        expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };
      mockAuth.mockResolvedValueOnce(malformedSession);

      const result = await stage3AdminAccessAuthorizationProofAction();

      // Empty roles array means no matching role, so should be denied
      expect(result.success).toBe(false);
      expect(result.result).toBe('forbidden');
      expect(result.data).toBeUndefined();
    });

    it('session with null permissions array fails closed', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const malformedSession: any = {
        user: {
          id: 'user-123',
          email: 'test@example.test',
          name: 'Test User',
          role: 'member',
          roles: ['member'],
          permissions: null,
          isAdmin: false,
          installCompleted: true,
        },
        expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };
      mockAuth.mockResolvedValueOnce(malformedSession);

      const result = await stage3AdminAccessAuthorizationProofAction();

      // Null permissions means no permissions, so should be denied
      expect(result.success).toBe(false);
      expect(result.result).toBe('forbidden');
      expect(result.data).toBeUndefined();
    });
  });

  // =========================================================================
  // Proof Payload Tests
  // =========================================================================

  describe('Proof payload structure and sanitization', () => {
    it('successful admin action contains exact proof identifier', async () => {
      const session = createMockSession('admin-123', 'admin', [], true);
      mockAuth.mockResolvedValueOnce(session);

      const result = await stage3AdminAccessAuthorizationProofAction();

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.proof).toBe('admin-access-authorized');
      expect(typeof result.data?.proof).toBe('string');
    });

    it('successful users-manage action contains exact proof identifier', async () => {
      const session = createMockSession('member-123', 'member', ['users.manage'], false);
      mockAuth.mockResolvedValueOnce(session);

      const result = await stage3UsersManageAuthorizationProofAction();

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.proof).toBe('users-manage-authorized');
      expect(typeof result.data?.proof).toBe('string');
    });

    it('denied access does not include data field', async () => {
      const session = createMockSession('member-123', 'member', [], false);
      mockAuth.mockResolvedValueOnce(session);

      const result = await stage3AdminAccessAuthorizationProofAction();

      expect(result.success).toBe(false);
      expect(result.data).toBeUndefined();
    });

    it('error message does not expose internal details', async () => {
      mockAuth.mockRejectedValueOnce(new Error('Secret database error details'));

      const result = await stage3AdminAccessAuthorizationProofAction();

      expect(result.error).toBeDefined();
      expect(result.error).not.toContain('Secret database error details');
      expect(result.error).not.toContain('Error:');
      expect(result.error).not.toMatch(/at \w+/); // No stack traces
    });

    it('successful result is JSON serializable', async () => {
      const session = createMockSession('admin-123', 'admin', [], true);
      mockAuth.mockResolvedValueOnce(session);

      const result = await stage3AdminAccessAuthorizationProofAction();

      // Should not throw
      const serialized = JSON.stringify(result);
      expect(serialized).toBeDefined();
      const deserialized = JSON.parse(serialized);
      expect(deserialized.success).toBe(result.success);
      expect(deserialized.result).toBe(result.result);
      expect(deserialized.data?.proof).toBe('admin-access-authorized');
    });
  });
});
