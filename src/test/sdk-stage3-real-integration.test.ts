// @vitest-environment node
/**
 * SDK Stage 3: Real Stage 2 Policy Engine Integration
 * ====================================================
 *
 * Tests that prove Stage 3 authorization wrappers call the REAL Stage 2 policy
 * engine and do not use any mock or placeholder.
 *
 * Environment: node (required to avoid the @devholm/sdk/server browser guard)
 *
 * Key invariants verified:
 * - evaluateApiAuthorization calls real PolicyRegistry.evaluateDeclaration()
 * - NormalizedPolicySubject is correctly mapped from CanonicalAuthorizationSubject
 * - All PolicyResult kinds map to correct HTTP results
 * - policy-error fails closed (never 403 or 200)
 * - No cross-test registry state leakage (each test uses its own registry)
 * - Duplicate registration is rejected
 * - Owner mismatch is rejected
 * - Plugin isolation: a plugin cannot reference another owner's evaluator
 */

import { describe, it, expect } from 'vitest';
import {
  createPolicyRegistry,
  evaluateApiAuthorization,
  mapPolicyToAuthorizationResult,
  canonicalSubjectToNormalizedPolicySubject,
  AuthorizationTransportResult,
  type CanonicalAuthorizationSubject,
  AuthenticationStatus,
} from '@devholm/sdk/server';
import {
  policyEvaluatorId,
  defineAccessDeclaration,
  permissionId,
  defineNormalizedPolicySubject,
  type PolicyEvaluationContext,
  type PolicyResult,
} from '@devholm/sdk';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession(
  overrides: {
    id?: string;
    role?: string;
    roles?: string[];
    permissions?: string[];
    isAdmin?: boolean;
  } = {}
) {
  return {
    user: {
      id: overrides.id ?? 'user-001',
      email: 'user@example.com',
      role: overrides.role ?? 'member',
      roles: overrides.roles ?? ['member'],
      permissions: overrides.permissions ?? [],
      isAdmin: overrides.isAdmin ?? false,
    },
  };
}

// ---------------------------------------------------------------------------
// Test 1: Real engine invoked — allow path
// ---------------------------------------------------------------------------

describe('evaluateApiAuthorization: real Stage 2 engine', () => {
  it('calls real evaluateDeclaration and returns ALLOW', async () => {
    const registry = createPolicyRegistry();
    registry.registerEvaluator({
      id: policyEvaluatorId('framework:evaluator:allow-all'),
      owner: 'framework',
      evaluate: async () => ({ kind: 'allow' as const }),
    });

    const result = await evaluateApiAuthorization(
      makeSession(),
      defineAccessDeclaration({
        kind: 'custom',
        evaluatorId: policyEvaluatorId('framework:evaluator:allow-all'),
      }),
      'framework',
      registry
    );

    expect(result.result).toBe(AuthorizationTransportResult.ALLOW);
    expect(result.httpStatus).toBe(200);
  });

  it('enforces authentication through real Stage 2 authenticated evaluator', async () => {
    const registry = createPolicyRegistry();
    // Use built-in 'authenticated' declaration kind — no custom evaluator needed
    const result = await evaluateApiAuthorization(
      null, // unauthenticated
      defineAccessDeclaration({ kind: 'authenticated' }),
      'framework',
      registry
    );

    expect(result.result).toBe(AuthorizationTransportResult.UNAUTHENTICATED);
    expect(result.httpStatus).toBe(401);
  });

  it('returns ALLOW for authenticated session with built-in authenticated declaration', async () => {
    const registry = createPolicyRegistry();
    const result = await evaluateApiAuthorization(
      makeSession({ id: 'user-002', role: 'member' }),
      defineAccessDeclaration({ kind: 'authenticated' }),
      'framework',
      registry
    );

    expect(result.result).toBe(AuthorizationTransportResult.ALLOW);
    expect(result.httpStatus).toBe(200);
  });

  it('returns FORBIDDEN for member with role-any requiring admin', async () => {
    const registry = createPolicyRegistry();
    const result = await evaluateApiAuthorization(
      makeSession({ role: 'member', roles: ['member'] }),
      defineAccessDeclaration({ kind: 'role-any', roles: ['admin', 'superadmin'] }),
      'framework',
      registry
    );

    expect(result.result).toBe(AuthorizationTransportResult.FORBIDDEN);
    expect(result.httpStatus).toBe(403);
  });

  it('returns ALLOW for admin with role-any requiring admin', async () => {
    const registry = createPolicyRegistry();
    const result = await evaluateApiAuthorization(
      makeSession({ role: 'admin', roles: ['admin'], isAdmin: true }),
      defineAccessDeclaration({ kind: 'role-any', roles: ['admin', 'superadmin'] }),
      'framework',
      registry
    );

    expect(result.result).toBe(AuthorizationTransportResult.ALLOW);
    expect(result.httpStatus).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Test 2: Subject mapping — canonical → normalized
// ---------------------------------------------------------------------------

describe('canonicalSubjectToNormalizedPolicySubject mapping', () => {
  it('maps authenticated canonical subject to normalized subject', async () => {
    const registry = createPolicyRegistry();
    let capturedContext: PolicyEvaluationContext | null = null;

    registry.registerEvaluator({
      id: policyEvaluatorId('framework:evaluator:capture'),
      owner: 'framework',
      evaluate: async (ctx) => {
        capturedContext = ctx;
        return { kind: 'allow' as const };
      },
    });

    await evaluateApiAuthorization(
      makeSession({
        id: 'user-005',
        role: 'admin',
        roles: ['admin', 'member'],
        permissions: ['users.read', 'users.write'],
        isAdmin: true,
      }),
      defineAccessDeclaration({
        kind: 'custom',
        evaluatorId: policyEvaluatorId('framework:evaluator:capture'),
      }),
      'framework',
      registry
    );

    expect(capturedContext).not.toBeNull();
    const subject = capturedContext!.subject;
    expect(subject.authenticated).toBe(true);
    expect(subject.subjectId).toBe('user-005');
    expect(subject.roles).toContain('admin');
    expect(subject.roles).toContain('member');
    // Permissions are PermissionId branded — check values
    expect(subject.permissions.map(String)).toContain('users.read');
    expect(subject.permissions.map(String)).toContain('users.write');
  });

  it('maps unauthenticated canonical subject to normalized subject', () => {
    const canonical: CanonicalAuthorizationSubject = {
      status: AuthenticationStatus.UNAUTHENTICATED,
      userId: null,
      email: null,
      role: null,
      roles: [],
      permissions: [],
      isAdmin: false,
    };
    const normalized = canonicalSubjectToNormalizedPolicySubject(canonical);
    expect(normalized.authenticated).toBe(false);
    expect(normalized.subjectId).toBeUndefined();
    expect(normalized.roles).toEqual([]);
    expect(normalized.permissions).toEqual([]);
  });

  it('brands permission strings correctly via permissionId()', () => {
    const canonical: CanonicalAuthorizationSubject = {
      status: AuthenticationStatus.AUTHENTICATED,
      userId: 'user-1',
      email: null,
      role: null,
      roles: [],
      permissions: ['users.read', 'admin.access'],
      isAdmin: false,
    };
    const normalized = canonicalSubjectToNormalizedPolicySubject(canonical);
    // Verify permissions are branded PermissionId values
    const expected = defineNormalizedPolicySubject({
      authenticated: true,
      subjectId: 'user-1',
      roles: [],
      permissions: [permissionId('users.read'), permissionId('admin.access')],
    });
    expect(normalized.permissions).toEqual(expected.permissions);
  });
});

// ---------------------------------------------------------------------------
// Test 3: Fail-closed on policy-error (critical security test)
// ---------------------------------------------------------------------------

describe('Fail-closed on policy-error', () => {
  it('fails closed with 500 when evaluator throws (never 403)', async () => {
    const registry = createPolicyRegistry();
    registry.registerEvaluator({
      id: policyEvaluatorId('framework:evaluator:throws'),
      owner: 'framework',
      evaluate: async () => {
        throw new Error('Simulated evaluator failure');
      },
    });

    const result = await evaluateApiAuthorization(
      makeSession(),
      defineAccessDeclaration({
        kind: 'custom',
        evaluatorId: policyEvaluatorId('framework:evaluator:throws'),
      }),
      'framework',
      registry
    );

    expect(result.result).toBe(AuthorizationTransportResult.POLICY_ERROR);
    expect(result.httpStatus).toBe(500);
    expect(result.result).not.toBe(AuthorizationTransportResult.FORBIDDEN);
  });

  it('maps all PolicyResult kinds to correct HTTP statuses', () => {
    const subject: CanonicalAuthorizationSubject = {
      status: AuthenticationStatus.AUTHENTICATED,
      userId: 'test-user',
      email: null,
      role: 'member',
      roles: [],
      permissions: [],
      isAdmin: false,
    };

    const cases: Array<[PolicyResult, AuthorizationTransportResult, number]> = [
      [{ kind: 'allow' }, AuthorizationTransportResult.ALLOW, 200],
      [{ kind: 'forbidden' }, AuthorizationTransportResult.FORBIDDEN, 403],
      [{ kind: 'unauthenticated' }, AuthorizationTransportResult.UNAUTHENTICATED, 401],
      [{ kind: 'not-found' }, AuthorizationTransportResult.CONCEALED, 404],
      [
        { kind: 'policy-error', error: { code: 'evaluator-failed' } },
        AuthorizationTransportResult.POLICY_ERROR,
        500,
      ],
      [
        { kind: 'policy-error', error: { code: 'missing-runtime-reference' } },
        AuthorizationTransportResult.POLICY_ERROR,
        503,
      ],
      [
        { kind: 'policy-error', error: { code: 'composition-failed' } },
        AuthorizationTransportResult.POLICY_ERROR,
        500,
      ],
      [
        { kind: 'policy-error', error: { code: 'resolver-failed' } },
        AuthorizationTransportResult.POLICY_ERROR,
        500,
      ],
    ];

    for (const [policyResult, expectedResult, expectedStatus] of cases) {
      const authResult = mapPolicyToAuthorizationResult(policyResult, subject);
      expect(authResult.result).toBe(expectedResult);
      expect(authResult.httpStatus).toBe(expectedStatus);
    }
  });
});

// ---------------------------------------------------------------------------
// Test 4: Registry isolation (no cross-test leakage)
// ---------------------------------------------------------------------------

describe('Registry isolation (no cross-test leakage)', () => {
  it('each test uses its own registry instance with independent evaluator state', async () => {
    const registry1 = createPolicyRegistry();
    registry1.registerEvaluator({
      id: policyEvaluatorId('site:evaluator:test-isolated-a'),
      owner: 'site',
      evaluate: async () => ({ kind: 'allow' as const }),
    });

    const registry2 = createPolicyRegistry();
    registry2.registerEvaluator({
      id: policyEvaluatorId('site:evaluator:test-isolated-b'),
      owner: 'site',
      evaluate: async () => ({ kind: 'forbidden' as const }),
    });

    const r1 = await evaluateApiAuthorization(
      makeSession(),
      defineAccessDeclaration({
        kind: 'custom',
        evaluatorId: policyEvaluatorId('site:evaluator:test-isolated-a'),
      }),
      'site',
      registry1
    );
    const r2 = await evaluateApiAuthorization(
      makeSession(),
      defineAccessDeclaration({
        kind: 'custom',
        evaluatorId: policyEvaluatorId('site:evaluator:test-isolated-b'),
      }),
      'site',
      registry2
    );

    expect(r1.result).toBe(AuthorizationTransportResult.ALLOW);
    expect(r2.result).toBe(AuthorizationTransportResult.FORBIDDEN);
  });

  it('rejects duplicate evaluator registration', () => {
    const registry = createPolicyRegistry();
    registry.registerEvaluator({
      id: policyEvaluatorId('framework:evaluator:dup-check'),
      owner: 'framework',
      evaluate: async () => ({ kind: 'allow' as const }),
    });
    expect(() => {
      registry.registerEvaluator({
        id: policyEvaluatorId('framework:evaluator:dup-check'),
        owner: 'framework',
        evaluate: async () => ({ kind: 'allow' as const }),
      });
    }).toThrow();
  });

  it('rejects owner mismatch: framework evaluator referenced from site', () => {
    const registry = createPolicyRegistry();
    registry.registerEvaluator({
      id: policyEvaluatorId('framework:evaluator:framework-only'),
      owner: 'framework',
      evaluate: async () => ({ kind: 'allow' as const }),
    });

    const declaration = defineAccessDeclaration({
      kind: 'custom',
      evaluatorId: policyEvaluatorId('framework:evaluator:framework-only'),
    });

    // Evaluating from 'site' owner referencing a 'framework' evaluator should fail
    // (owner namespace mismatch in Stage 2 validation)
    const result = registry.evaluateDeclaration(declaration, {
      subject: defineNormalizedPolicySubject({ authenticated: false, roles: [], permissions: [] }),
      owner: 'site', // mismatched owner
    });

    // Should fail closed — policy-error due to invalid owner reference
    return expect(result).resolves.toMatchObject({ kind: 'policy-error' });
  });

  it('plugin cannot reference another plugin owner evaluator', () => {
    const registry = createPolicyRegistry();
    registry.registerEvaluator({
      id: policyEvaluatorId('plugin:foo:evaluator:foo-check'),
      owner: 'plugin:foo',
      evaluate: async () => ({ kind: 'allow' as const }),
    });

    const declaration = defineAccessDeclaration({
      kind: 'custom',
      evaluatorId: policyEvaluatorId('plugin:foo:evaluator:foo-check'),
    });

    // plugin:bar tries to use plugin:foo's evaluator
    const result = registry.evaluateDeclaration(declaration, {
      subject: defineNormalizedPolicySubject({ authenticated: false, roles: [], permissions: [] }),
      owner: 'plugin:bar',
    });

    return expect(result).resolves.toMatchObject({ kind: 'policy-error' });
  });
});

// ---------------------------------------------------------------------------
// Test 5: Permission-based authorization
// ---------------------------------------------------------------------------

describe('Permission-based authorization with permission-any declaration', () => {
  it('allows user with required permission', async () => {
    const registry = createPolicyRegistry();
    const result = await evaluateApiAuthorization(
      makeSession({ permissions: ['users.manage', 'posts.read'] }),
      defineAccessDeclaration({
        kind: 'permission-any',
        permissions: [permissionId('users.manage')],
      }),
      'site',
      registry
    );
    expect(result.result).toBe(AuthorizationTransportResult.ALLOW);
    expect(result.httpStatus).toBe(200);
  });

  it('forbids user without required permission', async () => {
    const registry = createPolicyRegistry();
    const result = await evaluateApiAuthorization(
      makeSession({ permissions: ['posts.read'] }),
      defineAccessDeclaration({
        kind: 'permission-any',
        permissions: [permissionId('users.manage')],
      }),
      'site',
      registry
    );
    expect(result.result).toBe(AuthorizationTransportResult.FORBIDDEN);
    expect(result.httpStatus).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Test 6: allOf composition
// ---------------------------------------------------------------------------

describe('allOf composition', () => {
  it('allows when all conditions are satisfied', async () => {
    const registry = createPolicyRegistry();
    const result = await evaluateApiAuthorization(
      makeSession({ roles: ['admin'], permissions: ['users.manage'] }),
      defineAccessDeclaration({
        kind: 'allOf',
        policies: [
          { kind: 'role-any', roles: ['admin'] },
          { kind: 'permission-any', permissions: [permissionId('users.manage')] },
        ],
      }),
      'site',
      registry
    );
    expect(result.result).toBe(AuthorizationTransportResult.ALLOW);
  });

  it('forbids when any condition is not satisfied', async () => {
    const registry = createPolicyRegistry();
    const result = await evaluateApiAuthorization(
      makeSession({ roles: ['admin'], permissions: [] }), // has role but not permission
      defineAccessDeclaration({
        kind: 'allOf',
        policies: [
          { kind: 'role-any', roles: ['admin'] },
          { kind: 'permission-any', permissions: [permissionId('users.manage')] },
        ],
      }),
      'site',
      registry
    );
    expect(result.result).toBe(AuthorizationTransportResult.FORBIDDEN);
  });
});
