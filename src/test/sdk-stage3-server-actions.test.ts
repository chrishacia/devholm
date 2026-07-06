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
});
