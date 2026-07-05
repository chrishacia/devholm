/**
 * SDK Stage 3: Canonical Subject Normalization and Authorization Tests
 * =====================================================================
 *
 * Comprehensive unit tests for:
 * - normalizeAuthorizationSubject (canonical subject normalization)
 * - adaptLegacyToCanonical / canonicalSubjectFromSession / canonicalSubjectFromToken
 * - mapPolicyToAuthorizationResult (real Stage 2 PolicyResult → HTTP mapping)
 * - Security invariants
 *
 * All tests use real Stage 2 PolicyResult shapes (kind discriminated union).
 * No invented policy shapes, no PolicyEvaluationResult shim.
 */

import { describe, it, expect } from 'vitest';
import type { PolicyResult } from '../../packages/sdk/src/contracts';
import {
  normalizeAuthorizationSubject,
  type CanonicalAuthorizationSubject,
  AuthenticationStatus,
} from '../../packages/sdk/src/server/normalization';
import {
  adaptLegacyToCanonical,
  canonicalSubjectFromSession,
  canonicalSubjectFromToken,
  type LegacyAuthorizationSubject,
} from '../../packages/sdk/src/server/compatibility-adapter';
import {
  mapPolicyToAuthorizationResult,
  AuthorizationTransportResult,
} from '../../packages/sdk/src/server/authorization-wrappers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function authenticatedSubject(
  overrides: Partial<CanonicalAuthorizationSubject> = {}
): CanonicalAuthorizationSubject {
  return {
    status: AuthenticationStatus.AUTHENTICATED,
    userId: 'user-123',
    email: 'test@example.com',
    role: 'member',
    roles: ['member'],
    permissions: [],
    isAdmin: false,
    ...overrides,
  };
}

function unauthenticatedSubject(): CanonicalAuthorizationSubject {
  return {
    status: AuthenticationStatus.UNAUTHENTICATED,
    userId: null,
    email: null,
    role: null,
    roles: [],
    permissions: [],
    isAdmin: false,
  };
}

// ---------------------------------------------------------------------------
// normalizeAuthorizationSubject
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
    expect(result.userId).toBe(null);
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

  it('rejects non-string userId', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = normalizeAuthorizationSubject({ userId: 12345 } as any);
    expect(result.status).toBe(AuthenticationStatus.UNAUTHENTICATED);
  });

  it('rejects empty-string userId', () => {
    const result = normalizeAuthorizationSubject({ userId: '' });
    expect(result.status).toBe(AuthenticationStatus.UNAUTHENTICATED);
  });

  it('sets email to null for non-string email', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = normalizeAuthorizationSubject({ userId: 'user-123', email: 12345 } as any);
    expect(result.email).toBe(null);
  });

  it('sets role to null for empty-string role', () => {
    const result = normalizeAuthorizationSubject({ userId: 'user-123', role: '' });
    expect(result.role).toBe(null);
  });

  it('deduplicates and sorts roles', () => {
    const result = normalizeAuthorizationSubject({
      userId: 'user-123',
      roles: ['admin', 'member', 'admin', 'contributor', 'member'],
    });
    expect(result.roles).toEqual(['admin', 'contributor', 'member']);
  });

  it('filters out non-string roles', () => {
    const result = normalizeAuthorizationSubject({
      userId: 'user-123',
      roles: ['admin', 12345, null, 'member', undefined],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    expect(result.roles).toEqual(['admin', 'member']);
  });

  it('filters out empty-string roles', () => {
    const result = normalizeAuthorizationSubject({
      userId: 'user-123',
      roles: ['admin', '', 'member', ''],
    });
    expect(result.roles).toEqual(['admin', 'member']);
  });

  it('deduplicates and sorts permissions', () => {
    const result = normalizeAuthorizationSubject({
      userId: 'user-123',
      permissions: ['users.read', 'users.write', 'users.read', 'admin.access'],
    });
    expect(result.permissions).toEqual(['admin.access', 'users.read', 'users.write']);
  });

  it('rejects non-array roles', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = normalizeAuthorizationSubject({ userId: 'user-123', roles: 'admin' as any });
    expect(result.roles).toEqual([]);
  });

  it('rejects non-array permissions', () => {
    const result = normalizeAuthorizationSubject({
      userId: 'user-123',
      permissions: 'users.read',
    });
    expect(result.permissions).toEqual([]);
  });

  it('rejects prototype-pollution keys in roles', () => {
    const result = normalizeAuthorizationSubject({
      userId: 'user-123',
      roles: ['admin', '__proto__', 'member', 'constructor', 'prototype'],
    });
    expect(result.roles).toEqual(['admin', 'member']);
    expect(result.roles).not.toContain('__proto__');
    expect(result.roles).not.toContain('constructor');
    expect(result.roles).not.toContain('prototype');
  });

  it('only literal boolean true is accepted as isAdmin=true', () => {
    // Only === true is accepted; truthy non-booleans are treated as false (security invariant)
    expect(normalizeAuthorizationSubject({ userId: 'u1', isAdmin: true }).isAdmin).toBe(true);
    expect(normalizeAuthorizationSubject({ userId: 'u1', isAdmin: 'yes' }).isAdmin).toBe(false);
    expect(normalizeAuthorizationSubject({ userId: 'u1', isAdmin: 1 }).isAdmin).toBe(false);
  });

  it('coerces isAdmin falsy values to false', () => {
    expect(normalizeAuthorizationSubject({ userId: 'u1', isAdmin: 0 }).isAdmin).toBe(false);
    expect(normalizeAuthorizationSubject({ userId: 'u1', isAdmin: null }).isAdmin).toBe(false);
    expect(normalizeAuthorizationSubject({ userId: 'u1', isAdmin: false }).isAdmin).toBe(false);
  });

  it('rejects non-object raw input', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(normalizeAuthorizationSubject('string' as any).status).toBe(
      AuthenticationStatus.UNAUTHENTICATED
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(normalizeAuthorizationSubject(123 as any).status).toBe(
      AuthenticationStatus.UNAUTHENTICATED
    );
  });

  it('produces deterministic output for identical input', () => {
    const input = {
      userId: 'user-123',
      roles: ['member', 'admin', 'member'],
      permissions: ['read', 'write', 'read'],
    };
    const result1 = normalizeAuthorizationSubject(input);
    const result2 = normalizeAuthorizationSubject(input);
    expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
  });

  it('snapshot-isolates output: mutating original input after normalization does not change returned result', () => {
    const input = {
      userId: 'user-123',
      roles: ['admin', 'member'],
    };
    // 1. Normalize first
    const result = normalizeAuthorizationSubject(input);
    // 2. Mutate original AFTER returning the result
    input.roles.push('hacker');
    // 3. The already-returned result is unchanged
    expect(result.roles).not.toContain('hacker');
    expect(result.roles).toEqual(['admin', 'member']);
    // (A fresh normalization of the mutated input will legitimately include 'hacker')
    const resultAfterMutation = normalizeAuthorizationSubject(input);
    expect(resultAfterMutation.roles).toContain('hacker');
  });

  it('each call returns a fresh isolated object reference', () => {
    const input = { userId: 'user-123', roles: ['admin', 'member'] };
    const result1 = normalizeAuthorizationSubject(input);
    const result2 = normalizeAuthorizationSubject(input);
    expect(result1).not.toBe(result2);
    expect(result1.roles).not.toBe(result2.roles);
  });
});

// ---------------------------------------------------------------------------
// adaptLegacyToCanonical
// ---------------------------------------------------------------------------

describe('adaptLegacyToCanonical', () => {
  it('adapts valid legacy subject to canonical form', () => {
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
    expect(subject.email).toBe('test@example.com');
    expect(subject.role).toBe('member');
    expect(subject.roles).toEqual(['contributor', 'member']);
    expect(subject.permissions).toEqual(['posts.read', 'users.read']);
  });

  it('handles legacy isAdmin=true', () => {
    const { subject } = adaptLegacyToCanonical({ id: 'user-123', isAdmin: true });
    expect(subject.isAdmin).toBe(true);
  });

  it('handles legacy role admin', () => {
    const { subject } = adaptLegacyToCanonical({ id: 'user-123', role: 'admin' });
    expect(subject.isAdmin).toBe(true);
  });

  it('handles legacy role superadmin', () => {
    const { subject } = adaptLegacyToCanonical({ id: 'user-123', role: 'superadmin' });
    expect(subject.isAdmin).toBe(true);
  });

  it('handles legacy roles array containing admin', () => {
    const { subject } = adaptLegacyToCanonical({
      id: 'user-123',
      role: 'member',
      roles: ['member', 'admin'],
    });
    expect(subject.isAdmin).toBe(true);
  });

  it('respects adminDeterminationRule=canonical (only explicit isAdmin)', () => {
    const { subject } = adaptLegacyToCanonical(
      { id: 'user-123', role: 'admin', isAdmin: false },
      { adminDeterminationRule: 'canonical' }
    );
    expect(subject.isAdmin).toBe(false);
  });

  it('respects adminDeterminationRule=union (either legacy or canonical)', () => {
    const { subject } = adaptLegacyToCanonical(
      { id: 'user-123', role: 'member', isAdmin: false, roles: ['admin'] },
      { adminDeterminationRule: 'union' }
    );
    expect(subject.isAdmin).toBe(true);
  });

  it('provides diagnostics when enabled', () => {
    const { diagnostics } = adaptLegacyToCanonical(
      { id: 'user-123' },
      { diagnosticsEnabled: true }
    );
    expect(diagnostics).toBeDefined();
    expect(diagnostics?.usedCompatibilityPath).toBe(true);
    expect(typeof diagnostics?.pathDescription).toBe('string');
  });

  it('omits diagnostics when not enabled', () => {
    const { diagnostics } = adaptLegacyToCanonical(
      { id: 'user-123' },
      { diagnosticsEnabled: false }
    );
    expect(diagnostics).toBeUndefined();
  });

  it('handles null legacy subject', () => {
    const { subject } = adaptLegacyToCanonical(null);
    expect(subject.status).toBe(AuthenticationStatus.UNAUTHENTICATED);
  });
});

// ---------------------------------------------------------------------------
// canonicalSubjectFromSession
// ---------------------------------------------------------------------------

describe('canonicalSubjectFromSession', () => {
  it('adapts NextAuth session with id field to canonical subject', () => {
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

  it('handles session without user', () => {
    const { subject } = canonicalSubjectFromSession({});
    expect(subject.status).toBe(AuthenticationStatus.UNAUTHENTICATED);
  });
});

// ---------------------------------------------------------------------------
// canonicalSubjectFromToken
// ---------------------------------------------------------------------------

describe('canonicalSubjectFromToken', () => {
  it('adapts NextAuth JWT token to canonical subject', () => {
    const token = {
      id: 'user-123',
      email: 'test@example.com',
      role: 'member',
      roles: ['member'],
      permissions: ['users.read'],
      isAdmin: false,
    };
    const { subject } = canonicalSubjectFromToken(token);
    expect(subject.status).toBe(AuthenticationStatus.AUTHENTICATED);
    expect(subject.userId).toBe('user-123');
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

  it('maps forbidden (authenticated subject) to 403 FORBIDDEN', () => {
    const result = mapPolicyToAuthorizationResult(
      { kind: 'forbidden' } satisfies PolicyResult,
      subject
    );
    expect(result.result).toBe(AuthorizationTransportResult.FORBIDDEN);
    expect(result.httpStatus).toBe(403);
  });

  it('maps forbidden (unauthenticated subject) to 401 UNAUTHENTICATED', () => {
    const result = mapPolicyToAuthorizationResult(
      { kind: 'forbidden' } satisfies PolicyResult,
      unauthed
    );
    expect(result.result).toBe(AuthorizationTransportResult.UNAUTHENTICATED);
    expect(result.httpStatus).toBe(401);
  });

  it('maps unauthenticated to 401 UNAUTHENTICATED', () => {
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

  it('maps policy-error evaluator-failed to 500 POLICY_ERROR', () => {
    const result = mapPolicyToAuthorizationResult(
      { kind: 'policy-error', error: { code: 'evaluator-failed' } } satisfies PolicyResult,
      subject
    );
    expect(result.result).toBe(AuthorizationTransportResult.POLICY_ERROR);
    expect(result.httpStatus).toBe(500);
  });

  it('maps policy-error missing-runtime-reference to 503 POLICY_ERROR', () => {
    const result = mapPolicyToAuthorizationResult(
      { kind: 'policy-error', error: { code: 'missing-runtime-reference' } } satisfies PolicyResult,
      subject
    );
    expect(result.result).toBe(AuthorizationTransportResult.POLICY_ERROR);
    expect(result.httpStatus).toBe(503);
  });

  it('maps policy-error composition-failed to 500 POLICY_ERROR', () => {
    const result = mapPolicyToAuthorizationResult(
      { kind: 'policy-error', error: { code: 'composition-failed' } } satisfies PolicyResult,
      subject
    );
    expect(result.result).toBe(AuthorizationTransportResult.POLICY_ERROR);
    expect(result.httpStatus).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Security invariants
// ---------------------------------------------------------------------------

describe('Security invariants', () => {
  const subject = authenticatedSubject();

  it('policy-error is never downgraded to FORBIDDEN', () => {
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
      expect(result.result).not.toBe(AuthorizationTransportResult.FORBIDDEN);
      expect(result.httpStatus).toBeGreaterThanOrEqual(500);
    }
  });

  it('policy-error is never downgraded to ALLOW', () => {
    const result = mapPolicyToAuthorizationResult(
      { kind: 'policy-error', error: { code: 'composition-failed' } },
      subject
    );
    expect(result.result).not.toBe(AuthorizationTransportResult.ALLOW);
    expect(result.httpStatus).not.toBe(200);
  });

  it('error message never contains raw policy engine details', () => {
    const result = mapPolicyToAuthorizationResult(
      { kind: 'policy-error', error: { code: 'evaluator-failed' } },
      subject
    );
    expect(result.errorMessage).toBe('Policy evaluation error');
  });

  it('diagnostics are null by default (not enabled)', () => {
    const result = mapPolicyToAuthorizationResult(
      { kind: 'policy-error', error: { code: 'evaluator-failed' } },
      subject
    );
    expect(result.diagnostics).toBeUndefined();
  });

  it('diagnostics expose only error code when enabled', () => {
    const result = mapPolicyToAuthorizationResult(
      { kind: 'policy-error', error: { code: 'evaluator-failed' } },
      subject,
      { diagnosticsEnabled: true }
    );
    expect(result.diagnostics?.policyEvaluationDetails).toBe('evaluator-failed');
  });

  it('output subject is the passed-in canonical subject (reference identity)', () => {
    const result = mapPolicyToAuthorizationResult({ kind: 'allow' }, subject);
    expect(result.subject).toBe(subject);
  });
});
