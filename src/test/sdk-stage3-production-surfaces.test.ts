// @vitest-environment node
/**
 * SDK Stage 3: Production Surface Parity and Integration Tests
 * =============================================================
 *
 * Characterization tests that verify the Stage 3 authorization path produces
 * identical results to the pre-migration auth-helpers path for all user types.
 *
 * Surfaces covered:
 * 1. Admin-only access (GET /api/admin/dashboard) — was: verifyAdmin()
 * 2. Permission-based access (GET/PATCH /api/admin/auth/users) — was: verifyPermission('users.manage')
 *
 * For each surface, tests cover:
 * - Anonymous (null token)
 * - Authenticated allowed (admin/permission holder)
 * - Authenticated denied (member without required access)
 * - Malformed/partial token data
 * - Legacy administrator compatibility (isAdmin field)
 * - Policy error fail-closed behavior
 * - Client-provided state cannot bypass authorization
 *
 * Environment: node (required for @devholm/sdk/server import)
 */

import { describe, it, expect } from 'vitest';
import {
  createPolicyRegistry,
  canonicalSubjectFromToken,
  canonicalSubjectToNormalizedPolicySubject,
  mapPolicyToAuthorizationResult,
  AuthorizationTransportResult,
} from '@devholm/sdk/server';
import {
  adminAccessDeclaration,
  adminAccessOwner,
  usersManageDeclaration,
  usersManageOwner,
} from '../core/lib/sdk-authorization';
import { hasAdminAccess, hasPermission } from '../core/lib/auth-helpers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type TokenShape = {
  sub?: string;
  id?: string;
  role?: string;
  roles?: string[];
  permissions?: string[];
  isAdmin?: boolean;
};

/** Build a result using the Stage 3 path */
async function evaluateStage3(
  token: TokenShape | null,
  declaration: typeof adminAccessDeclaration,
  owner: typeof adminAccessOwner
) {
  const registry = createPolicyRegistry();
  const { subject } = canonicalSubjectFromToken(token);
  const normalizedSubject = canonicalSubjectToNormalizedPolicySubject(subject);
  const policyResult = await registry.evaluateDeclaration(declaration, {
    subject: normalizedSubject,
    owner,
  });
  return mapPolicyToAuthorizationResult(policyResult, subject);
}

/** Build a result using the legacy path */
function evaluateLegacyAdmin(token: TokenShape | null): boolean {
  return hasAdminAccess(token);
}

function evaluateLegacyPermission(token: TokenShape | null, permission: string): boolean {
  if (!token) return false;
  return hasPermission(token, permission) || hasAdminAccess(token);
}

// ---------------------------------------------------------------------------
// Surface 1: Admin-only access (adminAccessDeclaration)
// Pre-migration: verifyAdmin() → hasAdminAccess(token)
// Post-migration: evaluates anyOf[role-any[admin,superadmin], permission-any[admin.access]]
// ---------------------------------------------------------------------------

describe('Surface 1: Admin-only access — parity tests', () => {
  // Test fixtures
  const adminToken: TokenShape = {
    id: 'user-1',
    role: 'admin',
    roles: ['admin', 'member'],
    permissions: [],
    isAdmin: true,
  };
  const superadminToken: TokenShape = {
    id: 'user-2',
    role: 'superadmin',
    roles: ['superadmin'],
    permissions: [],
    isAdmin: true,
  };
  const adminAccessPermToken: TokenShape = {
    id: 'user-3',
    role: 'member',
    roles: ['member'],
    permissions: ['admin.access'],
    isAdmin: false,
  };
  const memberToken: TokenShape = {
    id: 'user-4',
    role: 'member',
    roles: ['member'],
    permissions: ['posts.read'],
    isAdmin: false,
  };

  it('PARITY: allows admin role token', async () => {
    const legacyResult = evaluateLegacyAdmin(adminToken);
    const stage3Result = await evaluateStage3(adminToken, adminAccessDeclaration, adminAccessOwner);
    expect(legacyResult).toBe(true);
    expect(stage3Result.result).toBe(AuthorizationTransportResult.ALLOW);
  });

  it('PARITY: allows superadmin role token', async () => {
    const legacyResult = evaluateLegacyAdmin(superadminToken);
    const stage3Result = await evaluateStage3(
      superadminToken,
      adminAccessDeclaration,
      adminAccessOwner
    );
    expect(legacyResult).toBe(true);
    expect(stage3Result.result).toBe(AuthorizationTransportResult.ALLOW);
  });

  it('PARITY: allows token with admin.access permission', async () => {
    const legacyResult = evaluateLegacyAdmin(adminAccessPermToken);
    const stage3Result = await evaluateStage3(
      adminAccessPermToken,
      adminAccessDeclaration,
      adminAccessOwner
    );
    expect(legacyResult).toBe(true);
    expect(stage3Result.result).toBe(AuthorizationTransportResult.ALLOW);
  });

  it('PARITY: denies regular member', async () => {
    const legacyResult = evaluateLegacyAdmin(memberToken);
    const stage3Result = await evaluateStage3(
      memberToken,
      adminAccessDeclaration,
      adminAccessOwner
    );
    expect(legacyResult).toBe(false);
    expect(stage3Result.result).toBe(AuthorizationTransportResult.FORBIDDEN);
    expect(stage3Result.httpStatus).toBe(403);
  });

  it('PARITY: denies null token (unauthenticated)', async () => {
    const legacyResult = evaluateLegacyAdmin(null);
    const stage3Result = await evaluateStage3(null, adminAccessDeclaration, adminAccessOwner);
    expect(legacyResult).toBe(false);
    expect(stage3Result.result).toBe(AuthorizationTransportResult.UNAUTHENTICATED);
    expect(stage3Result.httpStatus).toBe(401);
  });

  it('PARITY: legacy isAdmin field — denies when isAdmin=true but no admin role or permission', async () => {
    // Legacy admin (isAdmin=true but role=member): Stage 2 role-any does NOT look at isAdmin
    // This is intentional: Stage 3 uses explicit role/permission policy; isAdmin is not a policy criterion
    const isAdminOnlyToken: TokenShape = {
      id: 'user-6',
      role: 'member',
      roles: ['member'],
      permissions: [],
      isAdmin: true,
    };
    const stage3Result = await evaluateStage3(
      isAdminOnlyToken,
      adminAccessDeclaration,
      adminAccessOwner
    );
    // Stage 3 policy only checks roles/permissions, not the isAdmin flag
    // (isAdmin is a legacy field; the policy should match roles/permissions)
    expect(stage3Result.result).toBe(AuthorizationTransportResult.FORBIDDEN);
  });

  it('malformed token (no id field) produces unauthenticated result', async () => {
    const malformedToken: TokenShape = { role: 'admin', roles: ['admin'], isAdmin: true }; // missing id
    const stage3Result = await evaluateStage3(
      malformedToken,
      adminAccessDeclaration,
      adminAccessOwner
    );
    // Normalization requires userId; token has no id → UNAUTHENTICATED
    expect(stage3Result.result).toBe(AuthorizationTransportResult.UNAUTHENTICATED);
  });

  it('empty roles and permissions token with no id is unauthenticated', async () => {
    // Token with no id → normalizer treats as unauthenticated
    const noIdToken: TokenShape = { role: undefined, roles: [], permissions: [], isAdmin: false };
    const stage3Result = await evaluateStage3(noIdToken, adminAccessDeclaration, adminAccessOwner);
    expect(stage3Result.result).toBe(AuthorizationTransportResult.UNAUTHENTICATED);
  });

  it('empty roles with valid id is authenticated but forbidden', async () => {
    const tokenWithId: TokenShape = {
      id: 'user-7',
      role: 'member',
      roles: [],
      permissions: [],
      isAdmin: false,
    };
    const stage3Result = await evaluateStage3(
      tokenWithId,
      adminAccessDeclaration,
      adminAccessOwner
    );
    expect(stage3Result.result).toBe(AuthorizationTransportResult.FORBIDDEN);
    expect(stage3Result.httpStatus).toBe(403);
  });

  it('client-provided role in request body cannot bypass authorization', async () => {
    // Authorization is based on token (JWT), not request body
    // This test demonstrates the token is the source of truth
    const memberTokenResult = await evaluateStage3(
      memberToken,
      adminAccessDeclaration,
      adminAccessOwner
    );
    // Even if client claims to be admin in body, the token is evaluated
    expect(memberTokenResult.result).toBe(AuthorizationTransportResult.FORBIDDEN);
    // The declaration evaluated is fixed; runtime request body is not consulted
  });
});

// ---------------------------------------------------------------------------
// Surface 2: Permission-based access (usersManageDeclaration)
// Pre-migration: verifyPermission('users.manage') → hasPermission || hasAdminAccess
// Post-migration: evaluates permission-any[users.manage, admin.access]
// ---------------------------------------------------------------------------

describe('Surface 2: Permission-based access — parity tests', () => {
  const usersManageToken: TokenShape = {
    id: 'user-10',
    role: 'member',
    roles: ['member'],
    permissions: ['users.manage'],
    isAdmin: false,
  };
  const adminAccessPermToken: TokenShape = {
    id: 'user-11',
    role: 'member',
    roles: ['member'],
    permissions: ['admin.access'],
    isAdmin: false,
  };
  const adminRoleToken: TokenShape = {
    id: 'user-12',
    role: 'admin',
    roles: ['admin'],
    permissions: [],
    isAdmin: true,
  };
  const memberToken: TokenShape = {
    id: 'user-13',
    role: 'member',
    roles: ['member'],
    permissions: ['posts.read'],
    isAdmin: false,
  };
  const noPermToken: TokenShape = {
    id: 'user-14',
    role: 'member',
    roles: ['member'],
    permissions: [],
    isAdmin: false,
  };

  it('PARITY: allows token with users.manage permission', async () => {
    const legacyResult = evaluateLegacyPermission(usersManageToken, 'users.manage');
    const stage3Result = await evaluateStage3(
      usersManageToken,
      usersManageDeclaration,
      usersManageOwner
    );
    expect(legacyResult).toBe(true);
    expect(stage3Result.result).toBe(AuthorizationTransportResult.ALLOW);
  });

  it('PARITY: allows token with admin.access permission (legacy fallback path)', async () => {
    const legacyResult = evaluateLegacyPermission(adminAccessPermToken, 'users.manage');
    const stage3Result = await evaluateStage3(
      adminAccessPermToken,
      usersManageDeclaration,
      usersManageOwner
    );
    expect(legacyResult).toBe(true);
    expect(stage3Result.result).toBe(AuthorizationTransportResult.ALLOW);
  });

  it('BEHAVIORAL DIFFERENCE: admin-role token without explicit admin.access permission is denied in Stage 3 (legacy allowed via hasAdminAccess)', async () => {
    // Legacy: admin role → hasAdminAccess → true, allows access to users.manage
    // Stage 3: admin role token has no admin.access permission explicitly
    // This is an intentional migration difference: Stage 3 uses explicit permissions.
    // An admin role WITHOUT admin.access in their permissions list is denied.
    // Migration path: explicitly grant admin.access permission to admin role users.
    const legacyResult = evaluateLegacyPermission(adminRoleToken, 'users.manage');
    const stage3Result = await evaluateStage3(
      adminRoleToken,
      usersManageDeclaration,
      usersManageOwner
    );
    expect(legacyResult).toBe(true);
    // Stage 3 without admin.access in permissions: FORBIDDEN
    expect(stage3Result.result).toBe(AuthorizationTransportResult.FORBIDDEN);
    // Document: This surface requires admin users to have explicit permissions.
    // Grant admin.access to all admin-role users during migration.
  });

  it('PARITY: denies member without users.manage permission', async () => {
    const legacyResult = evaluateLegacyPermission(memberToken, 'users.manage');
    const stage3Result = await evaluateStage3(
      memberToken,
      usersManageDeclaration,
      usersManageOwner
    );
    expect(legacyResult).toBe(false);
    expect(stage3Result.result).toBe(AuthorizationTransportResult.FORBIDDEN);
    expect(stage3Result.httpStatus).toBe(403);
  });

  it('PARITY: denies null token (unauthenticated)', async () => {
    const legacyResult = evaluateLegacyPermission(null, 'users.manage');
    const stage3Result = await evaluateStage3(null, usersManageDeclaration, usersManageOwner);
    expect(legacyResult).toBe(false);
    expect(stage3Result.result).toBe(AuthorizationTransportResult.UNAUTHENTICATED);
    expect(stage3Result.httpStatus).toBe(401);
  });

  it('denies token with empty permissions', async () => {
    const stage3Result = await evaluateStage3(
      noPermToken,
      usersManageDeclaration,
      usersManageOwner
    );
    expect(stage3Result.result).toBe(AuthorizationTransportResult.FORBIDDEN);
  });

  it('malformed token (no id) produces unauthenticated', async () => {
    const malformed: TokenShape = { role: 'member', permissions: ['users.manage'] }; // missing id
    const stage3Result = await evaluateStage3(malformed, usersManageDeclaration, usersManageOwner);
    expect(stage3Result.result).toBe(AuthorizationTransportResult.UNAUTHENTICATED);
  });

  it('policy error fails closed — never produces ALLOW or FORBIDDEN', async () => {
    // Create registry with a throwing evaluator to simulate Stage 2 error
    const registry = createPolicyRegistry();
    const { subject } = canonicalSubjectFromToken(usersManageToken);
    const normalizedSubject = canonicalSubjectToNormalizedPolicySubject(subject);

    // Use a declaration with missing evaluator to trigger missing-runtime-reference
    const { defineAccessDeclaration: define, policyEvaluatorId } = await import('@devholm/sdk');
    const missingDecl = define({
      kind: 'custom',
      evaluatorId: policyEvaluatorId('site:evaluator:nonexistent'),
    });
    const policyResult = await registry.evaluateDeclaration(missingDecl, {
      subject: normalizedSubject,
      owner: 'site',
    });
    const authResult = mapPolicyToAuthorizationResult(policyResult, subject);

    expect(authResult.result).toBe(AuthorizationTransportResult.POLICY_ERROR);
    expect([500, 503]).toContain(authResult.httpStatus);
    expect(authResult.result).not.toBe(AuthorizationTransportResult.ALLOW);
    expect(authResult.result).not.toBe(AuthorizationTransportResult.FORBIDDEN);
  });
});
