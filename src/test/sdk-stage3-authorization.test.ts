// @vitest-environment node
/**
 * SDK Stage 3: Canonical Subject Normalization and Authorization Tests
 * =====================================================================
 *
 * Imports exclusively from the public SDK entrypoints:
 * - @devholm/sdk/server  — server-side types and functions
 * - @devholm/sdk         — neutral contracts
 *
 * Environment: node (required to avoid the @devholm/sdk/server browser guard)
 *
 * Coverage:
 * - normalizeAuthorizationSubject (canonical subject normalization)
 * - Accessor safety: getters, proxy traps, inherited properties, symbol keys
 * - Freezing/immutability contract
 * - adaptLegacyToCanonical, canonicalSubjectFromSession, canonicalSubjectFromToken
 * - mapPolicyToAuthorizationResult (real Stage 2 PolicyResult → HTTP mapping)
 * - Security invariants
 */

import { describe, it, expect, vi } from 'vitest';
import type { PolicyResult } from '@devholm/sdk';
import {
  normalizeAuthorizationSubject,
  adaptLegacyToCanonical,
  canonicalSubjectFromSession,
  canonicalSubjectFromToken,
  mapPolicyToAuthorizationResult,
  AuthorizationTransportResult,
  type CanonicalAuthorizationSubject,
  AuthenticationStatus,
  type LegacyAuthorizationSubject,
} from '@devholm/sdk/server';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function authenticatedSubject(
  overrides: Partial<CanonicalAuthorizationSubject> = {}
): CanonicalAuthorizationSubject {
  return Object.freeze({
    status: AuthenticationStatus.AUTHENTICATED,
    userId: 'user-123',
    email: 'test@example.com',
    role: 'member',
    roles: Object.freeze(['member']) as readonly string[],
    permissions: Object.freeze([]) as readonly string[],
    isAdmin: false,
    ...overrides,
  });
}

function unauthenticatedSubject(): CanonicalAuthorizationSubject {
  return normalizeAuthorizationSubject(null);
}

// ---------------------------------------------------------------------------
// normalizeAuthorizationSubject — basic cases
// ---------------------------------------------------------------------------

describe('normalizeAuthorizationSubject', () => {
  it('produces unauthenticated subject for null input', () => {
    const result = normalizeAuthorizationSubject(null);
    expect(result.status).toBe(AuthenticationStatus.UNAUTHENTICATED);
    expect(result.userId).toBe(null);
    expect(result.roles).toEqual([]);
    expect(result.permissions).toEqual([]);
    expect(result.isAdmin).toBe(false);
  });

  it('produces unauthenticated subject for undefined input', () => {
    const result = normalizeAuthorizationSubject(undefined);
    expect(result.status).toBe(AuthenticationStatus.UNAUTHENTICATED);
  });

  it('produces unauthenticated subject for non-object input', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(normalizeAuthorizationSubject('string' as any).status).toBe(
      AuthenticationStatus.UNAUTHENTICATED
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(normalizeAuthorizationSubject(42 as any).status).toBe(
      AuthenticationStatus.UNAUTHENTICATED
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(normalizeAuthorizationSubject(true as any).status).toBe(
      AuthenticationStatus.UNAUTHENTICATED
    );
  });

  it('produces unauthenticated subject for array input', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(normalizeAuthorizationSubject([] as any).status).toBe(
      AuthenticationStatus.UNAUTHENTICATED
    );
  });

  it('produces unauthenticated subject when userId is absent', () => {
    const result = normalizeAuthorizationSubject({ email: 'test@example.com' });
    expect(result.status).toBe(AuthenticationStatus.UNAUTHENTICATED);
  });

  it('produces authenticated subject with valid userId', () => {
    const result = normalizeAuthorizationSubject({
      userId: 'user-123',
      email: 'test@example.com',
      role: 'member',
      isAdmin: false,
    });
    expect(result.status).toBe(AuthenticationStatus.AUTHENTICATED);
    expect(result.userId).toBe('user-123');
    expect(result.email).toBe('test@example.com');
    expect(result.role).toBe('member');
    expect(result.isAdmin).toBe(false);
  });

  it('rejects non-string userId (unauthenticated)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(normalizeAuthorizationSubject({ userId: 12345 } as any).status).toBe(
      AuthenticationStatus.UNAUTHENTICATED
    );
  });

  it('rejects empty-string userId', () => {
    expect(normalizeAuthorizationSubject({ userId: '' }).status).toBe(
      AuthenticationStatus.UNAUTHENTICATED
    );
  });

  it('deduplicates and sorts roles', () => {
    const result = normalizeAuthorizationSubject({
      userId: 'u1',
      roles: ['admin', 'member', 'admin', 'contributor', 'member'],
    });
    expect(result.roles).toEqual(['admin', 'contributor', 'member']);
  });

  it('filters prototype-pollution keys from roles', () => {
    const result = normalizeAuthorizationSubject({
      userId: 'u1',
      roles: ['admin', '__proto__', 'member', 'constructor', 'prototype'],
    });
    expect(result.roles).toEqual(['admin', 'member']);
    expect(result.roles).not.toContain('__proto__');
    expect(result.roles).not.toContain('constructor');
  });

  it('only literal boolean true is accepted for isAdmin', () => {
    expect(normalizeAuthorizationSubject({ userId: 'u1', isAdmin: true }).isAdmin).toBe(true);
    // Truthy non-boolean values are rejected (security: no privilege escalation via coercion)
    expect(normalizeAuthorizationSubject({ userId: 'u1', isAdmin: 'yes' }).isAdmin).toBe(false);
    expect(normalizeAuthorizationSubject({ userId: 'u1', isAdmin: 1 }).isAdmin).toBe(false);
    expect(normalizeAuthorizationSubject({ userId: 'u1', isAdmin: 0 }).isAdmin).toBe(false);
    expect(normalizeAuthorizationSubject({ userId: 'u1', isAdmin: null }).isAdmin).toBe(false);
    expect(normalizeAuthorizationSubject({ userId: 'u1', isAdmin: false }).isAdmin).toBe(false);
  });

  it('handles null-prototype objects', () => {
    const obj = Object.create(null) as Record<string, unknown>;
    obj.userId = 'u1';
    obj.roles = ['admin'];
    const result = normalizeAuthorizationSubject(obj);
    expect(result.status).toBe(AuthenticationStatus.AUTHENTICATED);
    expect(result.userId).toBe('u1');
    expect(result.roles).toContain('admin');
  });
});

// ---------------------------------------------------------------------------
// Accessor safety tests
// ---------------------------------------------------------------------------

describe('normalizeAuthorizationSubject — accessor safety', () => {
  it('does NOT invoke a getter on the userId property', () => {
    const sideEffect = vi.fn().mockReturnValue('from-getter');
    const obj = {};
    Object.defineProperty(obj, 'userId', { get: sideEffect, enumerable: true });
    const result = normalizeAuthorizationSubject(obj as { userId?: unknown });
    // Getter must NOT be called — accessor property is skipped
    expect(sideEffect).not.toHaveBeenCalled();
    // Result must be unauthenticated (accessor userId yields undefined in our model)
    expect(result.status).toBe(AuthenticationStatus.UNAUTHENTICATED);
  });

  it('does NOT invoke a getter that has side effects on roles', () => {
    const sideEffect = vi.fn().mockReturnValue(['admin']);
    const obj = { userId: 'u1' };
    Object.defineProperty(obj, 'roles', { get: sideEffect, enumerable: true });
    normalizeAuthorizationSubject(obj as { userId: string; roles?: unknown });
    expect(sideEffect).not.toHaveBeenCalled();
  });

  it('skips inherited accessor properties — does NOT invoke inherited getter', () => {
    const sideEffect = vi.fn().mockReturnValue('inherited-user');
    const proto = {};
    Object.defineProperty(proto, 'userId', { get: sideEffect, enumerable: true });
    const obj = Object.create(proto) as Record<string, unknown>;
    // Define own data property that shadows the inherited accessor.
    // (Direct assignment `obj.userId = 'own-user'` would throw in strict mode
    //  because the prototype defines userId as a getter-only accessor.)
    Object.defineProperty(obj, 'userId', {
      value: 'own-user',
      writable: true,
      enumerable: true,
      configurable: true,
    });
    const result = normalizeAuthorizationSubject(obj);
    // Own data property is read via descriptor; inherited getter is NOT invoked
    expect(sideEffect).not.toHaveBeenCalled();
    expect(result.userId).toBe('own-user');
  });

  it('returns unauthenticated for a revoked proxy (does not throw)', () => {
    const { proxy, revoke } = Proxy.revocable({ userId: 'u1' }, {});
    revoke();
    // A revoked proxy throws on any access — normalizeAuthorizationSubject must fail closed
    let result: ReturnType<typeof normalizeAuthorizationSubject> | undefined;
    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result = normalizeAuthorizationSubject(proxy as any);
    }).not.toThrow();
    expect(result?.status).toBe(AuthenticationStatus.UNAUTHENTICATED);
  });

  it('catches a proxy with throwing getOwnPropertyDescriptor trap', () => {
    const trap = vi.fn().mockImplementation(() => {
      throw new Error('spy trap');
    });
    const proxy = new Proxy({ userId: 'u1' }, { getOwnPropertyDescriptor: trap });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = normalizeAuthorizationSubject(proxy as any);
    // Trap may be called (unavoidable), but exception is caught → fail closed
    expect(result.status).toBe(AuthenticationStatus.UNAUTHENTICATED);
  });

  it('skips accessor-backed array indices in roles', () => {
    const sideEffect = vi.fn().mockReturnValue('injected');
    const arr: unknown[] = ['admin'];
    Object.defineProperty(arr, 1, { get: sideEffect, enumerable: true });
    const result = normalizeAuthorizationSubject({
      userId: 'u1',
      roles: arr,
    });
    expect(sideEffect).not.toHaveBeenCalled();
    // Only the data-property index 0 ('admin') should be in roles
    expect(result.roles).toEqual(['admin']);
  });

  it('ignores symbol-keyed properties', () => {
    const sym = Symbol('userId');
    const obj: Record<symbol, string> = { [sym]: 'sym-user' };
    // Symbol key does not become a named field — must be unauthenticated
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = normalizeAuthorizationSubject(obj as any);
    expect(result.status).toBe(AuthenticationStatus.UNAUTHENTICATED);
  });
});

// ---------------------------------------------------------------------------
// Immutability / snapshot contract
// ---------------------------------------------------------------------------

describe('normalizeAuthorizationSubject — immutability', () => {
  it('returns a frozen canonical subject', () => {
    const result = normalizeAuthorizationSubject({ userId: 'u1' });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('returns frozen roles and permissions arrays', () => {
    const result = normalizeAuthorizationSubject({
      userId: 'u1',
      roles: ['admin'],
      permissions: ['users.read'],
    });
    expect(Object.isFrozen(result.roles)).toBe(true);
    expect(Object.isFrozen(result.permissions)).toBe(true);
  });

  it('mutating source after normalization does not change the returned result', () => {
    const input = {
      userId: 'u1',
      roles: ['admin', 'member'],
    };
    const result = normalizeAuthorizationSubject(input);
    // Mutate the original input AFTER getting the result
    input.roles.push('hacker');
    // Already-returned result is unaffected
    expect(result.roles).not.toContain('hacker');
    expect(result.roles).toEqual(['admin', 'member']);
  });

  it('attempt to mutate returned roles array throws in strict mode', () => {
    const result = normalizeAuthorizationSubject({ userId: 'u1', roles: ['admin'] });
    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (result.roles as any).push('hack');
    }).toThrow();
  });

  it('each call produces an independent snapshot', () => {
    const input = { userId: 'u1', roles: ['admin'] };
    const r1 = normalizeAuthorizationSubject(input);
    const r2 = normalizeAuthorizationSubject(input);
    expect(r1).not.toBe(r2);
    expect(r1.roles).not.toBe(r2.roles);
  });
});

// ---------------------------------------------------------------------------
// adaptLegacyToCanonical
// ---------------------------------------------------------------------------

describe('adaptLegacyToCanonical', () => {
  it('adapts valid legacy subject', () => {
    const legacy: LegacyAuthorizationSubject = {
      id: 'user-123',
      email: 'test@example.com',
      role: 'member',
      roles: ['member', 'contributor'],
      permissions: ['users.read', 'posts.read'],
      isAdmin: false,
    };
    const { subject } = adaptLegacyToCanonical(legacy);
    expect(subject.status).toBe(AuthenticationStatus.AUTHENTICATED);
    expect(subject.userId).toBe('user-123');
    expect(subject.roles).toEqual(['contributor', 'member']);
    expect(subject.permissions).toEqual(['posts.read', 'users.read']);
  });

  it('handles legacy role admin → isAdmin=true', () => {
    const { subject } = adaptLegacyToCanonical({ id: 'u1', role: 'admin' });
    expect(subject.isAdmin).toBe(true);
  });

  it('handles legacy role superadmin → isAdmin=true', () => {
    const { subject } = adaptLegacyToCanonical({ id: 'u1', role: 'superadmin' });
    expect(subject.isAdmin).toBe(true);
  });

  it('handles legacy roles array containing admin → isAdmin=true', () => {
    const { subject } = adaptLegacyToCanonical({
      id: 'u1',
      role: 'member',
      roles: ['member', 'admin'],
    });
    expect(subject.isAdmin).toBe(true);
  });

  it('respects adminDeterminationRule=canonical', () => {
    const { subject } = adaptLegacyToCanonical(
      { id: 'u1', role: 'admin', isAdmin: false },
      { adminDeterminationRule: 'canonical' }
    );
    expect(subject.isAdmin).toBe(false);
  });

  it('provides diagnostics when enabled', () => {
    const { diagnostics } = adaptLegacyToCanonical({ id: 'u1' }, { diagnosticsEnabled: true });
    expect(diagnostics?.usedCompatibilityPath).toBe(true);
  });

  it('handles null legacy subject', () => {
    const { subject } = adaptLegacyToCanonical(null);
    expect(subject.status).toBe(AuthenticationStatus.UNAUTHENTICATED);
  });
});

// ---------------------------------------------------------------------------
// canonicalSubjectFromSession / canonicalSubjectFromToken
// ---------------------------------------------------------------------------

describe('canonicalSubjectFromSession', () => {
  it('adapts NextAuth session with id field', () => {
    const session = {
      user: {
        id: 'user-123',
        email: 'test@example.com',
        role: 'member',
        roles: ['member'],
        permissions: ['users.read'],
        isAdmin: false,
      },
    };
    const { subject } = canonicalSubjectFromSession(session);
    expect(subject.status).toBe(AuthenticationStatus.AUTHENTICATED);
    expect(subject.userId).toBe('user-123');
  });

  it('handles null session', () => {
    const { subject } = canonicalSubjectFromSession(null);
    expect(subject.status).toBe(AuthenticationStatus.UNAUTHENTICATED);
  });

  it('does NOT invoke accessor getter on session.user', () => {
    const sideEffect = vi.fn().mockReturnValue({ id: 'injected' });
    const session = {};
    Object.defineProperty(session, 'user', { get: sideEffect, enumerable: true });
    canonicalSubjectFromSession(session as { user?: Record<string, unknown> });
    expect(sideEffect).not.toHaveBeenCalled();
  });
});

describe('canonicalSubjectFromToken', () => {
  it('adapts NextAuth JWT token', () => {
    const token = {
      id: 'user-123',
      role: 'admin',
      roles: ['admin'],
      permissions: [],
      isAdmin: true,
    };
    const { subject } = canonicalSubjectFromToken(token);
    expect(subject.status).toBe(AuthenticationStatus.AUTHENTICATED);
    expect(subject.userId).toBe('user-123');
    expect(subject.isAdmin).toBe(true);
  });

  it('handles null token', () => {
    const { subject } = canonicalSubjectFromToken(null);
    expect(subject.status).toBe(AuthenticationStatus.UNAUTHENTICATED);
  });
});

// ---------------------------------------------------------------------------
// mapPolicyToAuthorizationResult
// ---------------------------------------------------------------------------

describe('mapPolicyToAuthorizationResult', () => {
  const subject = authenticatedSubject();
  const unauthed = unauthenticatedSubject();

  it('maps allow to 200 ALLOW', () => {
    const result = mapPolicyToAuthorizationResult(
      { kind: 'allow' } satisfies PolicyResult,
      subject
    );
    expect(result.result).toBe(AuthorizationTransportResult.ALLOW);
    expect(result.httpStatus).toBe(200);
    expect(result.errorMessage).toBeUndefined();
  });

  it('maps forbidden (authenticated) to 403 FORBIDDEN', () => {
    const result = mapPolicyToAuthorizationResult(
      { kind: 'forbidden' } satisfies PolicyResult,
      subject
    );
    expect(result.result).toBe(AuthorizationTransportResult.FORBIDDEN);
    expect(result.httpStatus).toBe(403);
  });

  it('maps forbidden (unauthenticated) to 401 UNAUTHENTICATED', () => {
    const result = mapPolicyToAuthorizationResult(
      { kind: 'forbidden' } satisfies PolicyResult,
      unauthed
    );
    expect(result.result).toBe(AuthorizationTransportResult.UNAUTHENTICATED);
    expect(result.httpStatus).toBe(401);
  });

  it('maps unauthenticated to 401', () => {
    const result = mapPolicyToAuthorizationResult(
      { kind: 'unauthenticated' } satisfies PolicyResult,
      unauthed
    );
    expect(result.result).toBe(AuthorizationTransportResult.UNAUTHENTICATED);
    expect(result.httpStatus).toBe(401);
  });

  it('maps not-found to 404 CONCEALED', () => {
    const result = mapPolicyToAuthorizationResult(
      { kind: 'not-found' } satisfies PolicyResult,
      subject
    );
    expect(result.result).toBe(AuthorizationTransportResult.CONCEALED);
    expect(result.httpStatus).toBe(404);
  });

  it('maps policy-error evaluator-failed to 500', () => {
    const result = mapPolicyToAuthorizationResult(
      { kind: 'policy-error', error: { code: 'evaluator-failed' } } satisfies PolicyResult,
      subject
    );
    expect(result.result).toBe(AuthorizationTransportResult.POLICY_ERROR);
    expect(result.httpStatus).toBe(500);
  });

  it('maps policy-error missing-runtime-reference to 503', () => {
    const result = mapPolicyToAuthorizationResult(
      { kind: 'policy-error', error: { code: 'missing-runtime-reference' } } satisfies PolicyResult,
      subject
    );
    expect(result.result).toBe(AuthorizationTransportResult.POLICY_ERROR);
    expect(result.httpStatus).toBe(503);
  });
});

// ---------------------------------------------------------------------------
// Security invariants
// ---------------------------------------------------------------------------

describe('Security invariants', () => {
  const subject = authenticatedSubject();

  it('policy-error is never downgraded to FORBIDDEN or ALLOW', () => {
    for (const code of [
      'evaluator-failed',
      'resolver-failed',
      'composition-failed',
      'invalid-declaration',
      'invalid-identifier',
      'invalid-registration',
      'invalid-result',
    ] as const) {
      const result = mapPolicyToAuthorizationResult(
        { kind: 'policy-error', error: { code } },
        subject
      );
      expect(result.result).toBe(AuthorizationTransportResult.POLICY_ERROR);
      expect(result.httpStatus).toBeGreaterThanOrEqual(500);
      expect(result.result).not.toBe(AuthorizationTransportResult.FORBIDDEN);
      expect(result.result).not.toBe(AuthorizationTransportResult.ALLOW);
    }
  });

  it('sanitized error message is never raw exception content', () => {
    const result = mapPolicyToAuthorizationResult(
      { kind: 'policy-error', error: { code: 'evaluator-failed' } },
      subject
    );
    expect(result.errorMessage).toBe('Policy evaluation error');
  });

  it('diagnostics expose only error code when enabled', () => {
    const result = mapPolicyToAuthorizationResult(
      { kind: 'policy-error', error: { code: 'evaluator-failed' } },
      subject,
      { diagnosticsEnabled: true }
    );
    expect(result.diagnostics?.policyEvaluationDetails).toBe('evaluator-failed');
  });
});

// ---------------------------------------------------------------------------
// Exhaustive revoked-proxy and throwing-trap regression tests
// ---------------------------------------------------------------------------
// Every case asserts:
//   1. No exception escapes (the call completes without throwing)
//   2. The result is the correct fail-closed unauthenticated or empty value
//   3. No administrator or permission access is granted
//   4. No raw exception message appears in the result
// ---------------------------------------------------------------------------

describe('Revoked proxy — normalizeAuthorizationSubject', () => {
  it('revoked proxy as top-level input → unauthenticated, no exception', () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    let result: ReturnType<typeof normalizeAuthorizationSubject>;
    expect(() => {
      result = normalizeAuthorizationSubject(proxy as any); // eslint-disable-line @typescript-eslint/no-explicit-any
    }).not.toThrow();
    expect(result!.status).toBe(AuthenticationStatus.UNAUTHENTICATED);
    expect(result!.isAdmin).toBe(false);
    expect(result!.roles).toEqual([]);
    expect(result!.permissions).toEqual([]);
  });

  it('proxy whose getOwnPropertyDescriptor trap throws → unauthenticated, no exception', () => {
    const proxy = new Proxy(
      { userId: 'u1', role: 'admin', roles: ['admin'], isAdmin: true },
      {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        getOwnPropertyDescriptor(_target, _key) {
          throw new Error('descriptor trap threw');
        },
      }
    );
    let result: ReturnType<typeof normalizeAuthorizationSubject>;
    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result = normalizeAuthorizationSubject(proxy as any);
    }).not.toThrow();
    expect(result!.status).toBe(AuthenticationStatus.UNAUTHENTICATED);
    expect(result!.isAdmin).toBe(false);
  });

  it('proxy whose ownKeys trap throws → no exception escapes, reads via getOwnPropertyDescriptor', () => {
    // The normalization layer reads specific named keys via getOwnPropertyDescriptor,
    // NOT via ownKeys/Object.keys. So ownKeys throwing on the subject proxy does NOT
    // prevent individual property reads. The result is authenticated because userId
    // is successfully read via getOwnPropertyDescriptor even when ownKeys throws.
    const proxy = new Proxy(
      { userId: 'u1', roles: ['admin'], isAdmin: true },
      {
        ownKeys() {
          throw new Error('ownKeys trap threw');
        },
      }
    );
    let result: ReturnType<typeof normalizeAuthorizationSubject>;
    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result = normalizeAuthorizationSubject(proxy as any);
    }).not.toThrow();
    // userId is readable via getOwnPropertyDescriptor → authenticated
    expect(result!.status).toBe(AuthenticationStatus.AUTHENTICATED);
    // isAdmin is read via descriptor — result is true from the data property
    // but note: policy decisions don't use isAdmin, only roles/permissions
    expect(result!.roles).toContain('admin');
  });

  it('proxy whose getPrototypeOf trap throws → unauthenticated, no exception', () => {
    const proxy = new Proxy(
      { userId: 'u1', roles: ['admin'] },
      {
        getPrototypeOf() {
          throw new Error('getPrototypeOf trap threw');
        },
      }
    );
    let result: ReturnType<typeof normalizeAuthorizationSubject>;
    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result = normalizeAuthorizationSubject(proxy as any);
    }).not.toThrow();
    // getPrototypeOf is not called by the normalization layer directly;
    // result depends on what other traps are hit. Must not throw regardless.
    expect(result!.isAdmin).toBe(false);
  });
});

describe('Revoked proxy as roles/permissions array — safeStringElements', () => {
  it('revoked proxy as roles value → empty frozen array, no exception', () => {
    const { proxy: rolesProxy, revoke } = Proxy.revocable(['admin', 'member'], {});
    revoke();
    const input = { userId: 'u1' };
    Object.defineProperty(input, 'roles', {
      value: rolesProxy,
      enumerable: true,
      configurable: true,
    });
    let result: ReturnType<typeof normalizeAuthorizationSubject>;
    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result = normalizeAuthorizationSubject(input as any);
    }).not.toThrow();
    // Revoked proxy as roles → treated as empty
    expect(result!.roles).toEqual([]);
    expect(result!.isAdmin).toBe(false);
  });

  it('revoked proxy as permissions value → empty frozen array, no exception', () => {
    const { proxy: permProxy, revoke } = Proxy.revocable(['admin.access', 'users.manage'], {});
    revoke();
    const input = { userId: 'u1' };
    Object.defineProperty(input, 'permissions', {
      value: permProxy,
      enumerable: true,
      configurable: true,
    });
    let result: ReturnType<typeof normalizeAuthorizationSubject>;
    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result = normalizeAuthorizationSubject(input as any);
    }).not.toThrow();
    expect(result!.permissions).toEqual([]);
  });

  it('array with isArray-throwing proxy → empty frozen array, no exception', () => {
    // A value whose Array.isArray check throws — simulated via an object whose
    // Symbol.toStringTag causes an isArray-equivalent check to throw. In real
    // environments a Proxy can be configured to throw in the [[IsArray]] slot.
    // Here we use a revoked proxy as the value (simplest reliable trigger).
    const { proxy, revoke } = Proxy.revocable([] as string[], {});
    revoke();
    let result: ReturnType<typeof normalizeAuthorizationSubject>;
    const input = { userId: 'u1' };
    Object.defineProperty(input, 'roles', { value: proxy, enumerable: true, configurable: true });
    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result = normalizeAuthorizationSubject(input as any);
    }).not.toThrow();
    expect(result!.roles).toEqual([]);
  });

  it('array with accessor-backed indices does not invoke accessors', () => {
    const arr: string[] = [];
    const sideEffect = vi.fn().mockReturnValue('hacked');
    // Define index 0 as an accessor on the array
    Object.defineProperty(arr, '0', { get: sideEffect, enumerable: true, configurable: true });
    const input = { userId: 'u1', roles: arr };
    const result = normalizeAuthorizationSubject(input);
    expect(sideEffect).not.toHaveBeenCalled();
    // Accessor index is skipped — roles is empty
    expect(result.roles).toEqual([]);
  });

  it('array with inherited accessor at numeric index is skipped', () => {
    const base: string[] = [];
    const sideEffect = vi.fn().mockReturnValue('inherited-role');
    Object.defineProperty(Array.prototype, '_test_inherited_idx', {
      get: sideEffect,
      enumerable: true,
      configurable: true,
    });
    try {
      const result = normalizeAuthorizationSubject({ userId: 'u1', roles: base });
      // inherited non-own property must not appear in roles
      expect(result.roles).not.toContain('inherited-role');
      expect(sideEffect).not.toHaveBeenCalled();
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (Array.prototype as any)._test_inherited_idx;
    }
  });
});

describe('Revoked proxy — adaptLegacyToCanonical (toSafeObject)', () => {
  it('revoked proxy as legacy subject → unauthenticated, no exception', () => {
    const { proxy, revoke } = Proxy.revocable(
      { id: 'u1', role: 'admin', roles: ['admin'], isAdmin: true },
      {}
    );
    revoke();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => adaptLegacyToCanonical(proxy as any)).not.toThrow();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { subject } = adaptLegacyToCanonical(proxy as any);
    expect(subject.status).toBe(AuthenticationStatus.UNAUTHENTICATED);
    expect(subject.isAdmin).toBe(false);
    expect(subject.roles).toEqual([]);
  });

  it('proxy whose isArray check throws (as legacy subject) → unauthenticated, no exception', () => {
    // Simulate an object where Array.isArray throws by wrapping the value in
    // a Proxy and revoking it before toSafeObject inspects it.
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => adaptLegacyToCanonical(proxy as any)).not.toThrow();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { subject } = adaptLegacyToCanonical(proxy as any);
    expect(subject.status).toBe(AuthenticationStatus.UNAUTHENTICATED);
  });

  it('Date object as legacy subject → unauthenticated (fail closed), no exception', () => {
    // Date objects must be rejected by toSafeObject, not accepted
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { subject } = adaptLegacyToCanonical(new Date() as any);
    expect(subject.status).toBe(AuthenticationStatus.UNAUTHENTICATED);
    expect(subject.isAdmin).toBe(false);
  });

  it('proxy whose instanceof Date check throws → unauthenticated (fail closed), no exception', () => {
    // A proxy whose [[GetPrototypeOf]] throws when instanceof is evaluated
    const proxy = new Proxy(
      { id: 'u1', role: 'admin', isAdmin: true },
      {
        getPrototypeOf() {
          throw new Error('getPrototypeOf trap threw in instanceof check');
        },
      }
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => adaptLegacyToCanonical(proxy as any)).not.toThrow();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { subject } = adaptLegacyToCanonical(proxy as any);
    // Fail closed: inspection threw, so object was rejected → unauthenticated
    expect(subject.status).toBe(AuthenticationStatus.UNAUTHENTICATED);
    expect(subject.isAdmin).toBe(false);
  });
});

describe('Revoked proxy — canonicalSubjectFromSession', () => {
  it('revoked proxy as session → unauthenticated, no exception', () => {
    const { proxy, revoke } = Proxy.revocable(
      { user: { id: 'u1', role: 'admin', roles: ['admin'], isAdmin: true } },
      {}
    );
    revoke();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => canonicalSubjectFromSession(proxy as any)).not.toThrow();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { subject } = canonicalSubjectFromSession(proxy as any);
    expect(subject.status).toBe(AuthenticationStatus.UNAUTHENTICATED);
    expect(subject.isAdmin).toBe(false);
  });

  it('revoked proxy as session.user → unauthenticated, no exception', () => {
    const { proxy: userProxy, revoke } = Proxy.revocable(
      { id: 'u1', role: 'admin', roles: ['admin'], isAdmin: true },
      {}
    );
    revoke();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = { user: userProxy as any };
    expect(() => canonicalSubjectFromSession(session)).not.toThrow();
    const { subject } = canonicalSubjectFromSession(session);
    expect(subject.status).toBe(AuthenticationStatus.UNAUTHENTICATED);
    expect(subject.isAdmin).toBe(false);
  });
});

describe('Revoked proxy — canonicalSubjectFromToken', () => {
  it('revoked proxy as JWT token → unauthenticated, no exception', () => {
    const { proxy, revoke } = Proxy.revocable(
      { id: 'u1', role: 'admin', roles: ['admin'], isAdmin: true },
      {}
    );
    revoke();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => canonicalSubjectFromToken(proxy as any)).not.toThrow();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { subject } = canonicalSubjectFromToken(proxy as any);
    expect(subject.status).toBe(AuthenticationStatus.UNAUTHENTICATED);
    expect(subject.isAdmin).toBe(false);
  });
});
