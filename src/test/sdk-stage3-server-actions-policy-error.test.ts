/**
 * @vitest-environment node
 * Stage 3 Server Action Authorization Policy-Error Layer Tests
 *
 * Tests the policy-error handling at the authorization layer by mocking
 * auth() and authorizeSessionAction to inject failure scenarios and verify
 * that infrastructure failures are sanitized and never exposed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Session } from 'next-auth';
import {
  stage3AdminAccessAuthorizationProofAction,
  stage3UsersManageAuthorizationProofAction,
} from '@/app/admin/actions/sdk-authorization-proof';

// Mock auth to control its behavior
vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

// Mock authorizeSessionAction to inject policy-error scenarios
vi.mock('@/lib/sdk-authorization', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/sdk-authorization')>();

  return {
    ...actual,
    authorizeSessionAction: vi.fn(),
  };
});

import { auth } from '@/auth';
import { authorizeSessionAction } from '@/lib/sdk-authorization';
import type { ServerActionAuthorizationResult } from '@devholm/sdk/server';
import { AuthorizationTransportResult, AuthenticationStatus } from '@devholm/sdk/server';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockAuth = auth as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockAuthorizeSessionAction = authorizeSessionAction as any;

/**
 * Valid admin session for test defaults
 */
const adminSession: Session = {
  user: {
    id: 'user-123',
    email: 'admin@example.test',
    name: 'Admin User',
    role: 'admin',
    roles: ['admin'],
    permissions: [],
    isAdmin: true,
    installCompleted: true,
  },
  expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
};

describe('Stage 3 Server Actions: Authorization-Layer Policy-Error', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(adminSession);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('auth() failure handling', () => {
    it('auth() rejection returns sanitized policy-error', async () => {
      mockAuth.mockRejectedValueOnce(new Error('Auth service connection failed'));

      const result = await stage3AdminAccessAuthorizationProofAction();

      expect(result.success).toBe(false);
      expect(result.result).toBe('policy-error');
      expect(result.error).toBe('Authorization service unavailable');
      expect(result.data).toBeUndefined();
    });
  });

  describe('authorizeSessionAction() policy-error results', () => {
    it('returns policy-error with SDK message from authorizeSessionAction', async () => {
      const policyErrorResult: ServerActionAuthorizationResult = {
        allowed: false,
        result: AuthorizationTransportResult.POLICY_ERROR,
        subject: {
          status: AuthenticationStatus.AUTHENTICATED,
          userId: 'user-123',
          email: 'admin@example.test',
          role: 'admin',
          roles: ['admin'],
          permissions: [],
          isAdmin: true,
        },
        errorMessage: 'Authorization policy evaluation failed',
      };
      mockAuthorizeSessionAction.mockResolvedValueOnce(policyErrorResult);

      const result = await stage3AdminAccessAuthorizationProofAction();

      expect(result.success).toBe(false);
      expect(result.result).toBe('policy-error');
      expect(result.error).toBe('Authorization policy evaluation failed');
      expect(result.data).toBeUndefined();
    });

    it('authorizeSessionAction exception returns sanitized policy-error', async () => {
      mockAuthorizeSessionAction.mockRejectedValueOnce(
        new Error('Database connection timeout to auth cache')
      );

      const result = await stage3AdminAccessAuthorizationProofAction();

      expect(result.success).toBe(false);
      expect(result.result).toBe('policy-error');
      expect(result.error).toBe('Authorization service unavailable');
      expect(result.error).not.toContain('Database');
      expect(result.error).not.toContain('timeout');
      expect(result.data).toBeUndefined();
    });

    it('distinguishes policy-error from forbidden', async () => {
      const forbiddenResult: ServerActionAuthorizationResult = {
        allowed: false,
        result: AuthorizationTransportResult.FORBIDDEN,
        subject: {
          status: AuthenticationStatus.AUTHENTICATED,
          userId: 'user-456',
          email: 'member@example.test',
          role: 'member',
          roles: ['member'],
          permissions: [],
          isAdmin: false,
        },
      };
      mockAuthorizeSessionAction.mockResolvedValueOnce(forbiddenResult);

      const result = await stage3AdminAccessAuthorizationProofAction();

      expect(result.success).toBe(false);
      expect(result.result).toBe('forbidden');
      expect(result.error).toBe('Not authorized');
    });
  });

  describe('users-manage action policy-error', () => {
    it('returns policy-error from authorizeSessionAction', async () => {
      const policyErrorResult: ServerActionAuthorizationResult = {
        allowed: false,
        result: AuthorizationTransportResult.POLICY_ERROR,
        subject: {
          status: AuthenticationStatus.AUTHENTICATED,
          userId: 'user-456',
          email: 'user@example.test',
          role: 'member',
          roles: ['member'],
          permissions: ['users.manage'],
          isAdmin: false,
        },
        errorMessage: 'Authorization policy evaluation failed',
      };
      mockAuthorizeSessionAction.mockResolvedValueOnce(policyErrorResult);

      const result = await stage3UsersManageAuthorizationProofAction();

      expect(result.success).toBe(false);
      expect(result.result).toBe('policy-error');
      expect(result.error).toBe('Authorization policy evaluation failed');
    });

    it('auth() exception returns sanitized policy-error', async () => {
      mockAuth.mockRejectedValueOnce(new Error('Auth service unavailable'));

      const result = await stage3UsersManageAuthorizationProofAction();

      expect(result.success).toBe(false);
      expect(result.result).toBe('policy-error');
      expect(result.error).toBe('Authorization service unavailable');
      expect(result.error).not.toContain('Auth service');
    });
  });

  describe('JSON serialization of policy-error', () => {
    it('policy-error result is JSON serializable', async () => {
      mockAuth.mockRejectedValueOnce(new Error('Service error'));

      const result = await stage3AdminAccessAuthorizationProofAction();

      const jsonStr = JSON.stringify(result);
      expect(jsonStr).toBeDefined();
      const parsed = JSON.parse(jsonStr);
      expect(parsed.success).toBe(false);
      expect(parsed.result).toBe('policy-error');
      expect(parsed.error).toBe('Authorization service unavailable');
      expect(parsed.data).toBeUndefined();
    });
  });
});
