/**
 * SDK Stage 3: Integration Scenarios
 * ====================================
 *
 * Integration-level tests demonstrating the complete Stage 3 authorization flow:
 *   session → compatibility adapter → canonical subject → policy evaluation → HTTP result
 *
 * All tests use real Stage 2 PolicyResult shapes (kind discriminated union).
 * Session data is processed through the compatibility adapter (not passed raw to normalizer).
 * Prototype-pollution and determinism properties are covered here.
 */

import { describe, it, expect } from 'vitest';
import type { PolicyResult } from '../../packages/sdk/src/contracts';
import { AuthenticationStatus } from '../../packages/sdk/src/server/normalization';
import {
  canonicalSubjectFromSession,
  adaptLegacyToCanonical,
} from '../../packages/sdk/src/server/compatibility-adapter';
import {
  mapPolicyToAuthorizationResult,
  AuthorizationTransportResult,
} from '../../packages/sdk/src/server/authorization-wrappers';

// ---------------------------------------------------------------------------
// Scenario 1: Admin user allowed
// ---------------------------------------------------------------------------

describe('Scenario: admin user allowed', () => {
  it('produces authenticated canonical subject from session', () => {
    const session = {
      user: {
        id: 'admin-001',
        email: 'admin@example.com',
        role: 'admin',
        roles: ['admin', 'member'],
        permissions: ['users.read', 'users.write', 'admin.access'],
        isAdmin: true,
      },
    };
    // Use the compatibility adapter — session.user has 'id', not 'userId'
    const { subject } = canonicalSubjectFromSession(session);
    expect(subject.status).toBe(AuthenticationStatus.AUTHENTICATED);
    expect(subject.isAdmin).toBe(true);
    expect(subject.roles).toEqual(['admin', 'member']);
    expect(subject.permissions).toContain('users.read');
  });

  it('maps Stage 2 allow to 200', () => {
    const { subject } = canonicalSubjectFromSession({
      user: { id: 'admin-001', role: 'admin', isAdmin: true, roles: ['admin'], permissions: [] },
    });
    const policyResult: PolicyResult = { kind: 'allow' };
    const result = mapPolicyToAuthorizationResult(policyResult, subject);
    expect(result.result).toBe(AuthorizationTransportResult.ALLOW);
    expect(result.httpStatus).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: Regular member denied
// ---------------------------------------------------------------------------

describe('Scenario: member access denied', () => {
  it('maps Stage 2 forbidden to 403 for authenticated member', () => {
    const { subject } = canonicalSubjectFromSession({
      user: {
        id: 'member-001',
        role: 'member',
        roles: ['member'],
        permissions: ['posts.read'],
        isAdmin: false,
      },
    });
    expect(subject.status).toBe(AuthenticationStatus.AUTHENTICATED);
    expect(subject.isAdmin).toBe(false);

    const policyResult: PolicyResult = { kind: 'forbidden' };
    const result = mapPolicyToAuthorizationResult(policyResult, subject);
    expect(result.result).toBe(AuthorizationTransportResult.FORBIDDEN);
    expect(result.httpStatus).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: Unauthenticated user
// ---------------------------------------------------------------------------

describe('Scenario: unauthenticated user', () => {
  it('produces unauthenticated subject from null session', () => {
    const { subject } = canonicalSubjectFromSession(null);
    expect(subject.status).toBe(AuthenticationStatus.UNAUTHENTICATED);
    expect(subject.userId).toBe(null);
  });

  it('maps Stage 2 unauthenticated to 401', () => {
    const { subject } = canonicalSubjectFromSession(null);
    const policyResult: PolicyResult = { kind: 'unauthenticated' };
    const result = mapPolicyToAuthorizationResult(policyResult, subject);
    expect(result.result).toBe(AuthorizationTransportResult.UNAUTHENTICATED);
    expect(result.httpStatus).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: Policy engine failure (security-critical — fail closed)
// ---------------------------------------------------------------------------

describe('Scenario: policy engine failure', () => {
  it('fails closed with 500 for evaluator-failed (never 403)', () => {
    const { subject } = canonicalSubjectFromSession({
      user: { id: 'user-001', role: 'member', isAdmin: false, roles: ['member'], permissions: [] },
    });
    const policyResult: PolicyResult = {
      kind: 'policy-error',
      error: { code: 'evaluator-failed' },
    };
    const result = mapPolicyToAuthorizationResult(policyResult, subject);
    expect(result.result).toBe(AuthorizationTransportResult.POLICY_ERROR);
    expect(result.httpStatus).toBe(500);
    expect(result.result).not.toBe(AuthorizationTransportResult.FORBIDDEN);
  });

  it('fails closed with 503 for missing-runtime-reference (never 403)', () => {
    const { subject } = canonicalSubjectFromSession({
      user: { id: 'user-001', role: 'member', isAdmin: false, roles: ['member'], permissions: [] },
    });
    const policyResult: PolicyResult = {
      kind: 'policy-error',
      error: { code: 'missing-runtime-reference' },
    };
    const result = mapPolicyToAuthorizationResult(policyResult, subject);
    expect(result.result).toBe(AuthorizationTransportResult.POLICY_ERROR);
    expect(result.httpStatus).toBe(503);
    expect(result.result).not.toBe(AuthorizationTransportResult.FORBIDDEN);
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: Legacy compatibility adapter
// ---------------------------------------------------------------------------

describe('Scenario: legacy compatibility adapter', () => {
  it('adapts legacy authorization data to canonical form', () => {
    const legacySubject = {
      id: 'user-123',
      email: 'user@example.com',
      role: 'member',
      roles: ['member', 'contributor'],
      permissions: ['posts.read', 'posts.write'],
      isAdmin: false,
    };
    const { subject, diagnostics } = adaptLegacyToCanonical(legacySubject, {
      diagnosticsEnabled: true,
      adminDeterminationRule: 'legacy',
    });
    expect(subject.status).toBe(AuthenticationStatus.AUTHENTICATED);
    expect(subject.userId).toBe('user-123');
    expect(subject.roles).toEqual(['contributor', 'member']);
    expect(subject.permissions).toEqual(['posts.read', 'posts.write']);
    expect(diagnostics?.usedCompatibilityPath).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Scenario 6: Prototype pollution protection
// ---------------------------------------------------------------------------

describe('Scenario: prototype pollution protection', () => {
  it('normalizes out prototype-pollution role keys', () => {
    // Use adapter which internally calls normalizeAuthorizationSubject
    const { subject } = canonicalSubjectFromSession({
      user: {
        id: 'user-001',
        roles: ['member', '__proto__', 'constructor', 'prototype', 'admin'],
        permissions: [],
        isAdmin: false,
      },
    });
    expect(subject.roles).toEqual(['admin', 'member']);
    expect(subject.roles).not.toContain('__proto__');
    expect(subject.roles).not.toContain('constructor');
    expect(subject.roles).not.toContain('prototype');
  });
});

// ---------------------------------------------------------------------------
// Scenario 7: Determinism
// ---------------------------------------------------------------------------

describe('Scenario: determinism', () => {
  it('deduplicates and sorts roles and permissions', () => {
    const { subject } = canonicalSubjectFromSession({
      user: {
        id: 'user-001',
        roles: ['admin', 'member', 'admin', 'contributor', 'member'],
        permissions: ['write', 'read', 'write', 'delete', 'read'],
      },
    });
    expect(subject.roles).toEqual(['admin', 'contributor', 'member']);
    expect(subject.permissions).toEqual(['delete', 'read', 'write']);
  });

  it('identical sessions produce identical canonical subjects', () => {
    const session = {
      user: {
        id: 'user-001',
        role: 'admin',
        roles: ['admin', 'member'],
        permissions: ['users.read', 'users.write'],
        isAdmin: true,
      },
    };
    const { subject: s1 } = canonicalSubjectFromSession(session);
    const { subject: s2 } = canonicalSubjectFromSession(session);
    expect(JSON.stringify(s1)).toBe(JSON.stringify(s2));
  });
});

// ---------------------------------------------------------------------------
// Scenario 8: Complete flow (session → canonical → policy result → HTTP)
// ---------------------------------------------------------------------------

describe('Scenario: complete authorization flow', () => {
  it('produces ALLOW with 200 for admin session and allow policy result', () => {
    const session = {
      user: {
        id: 'user-001',
        email: 'user@example.com',
        role: 'admin',
        roles: ['admin', 'member'],
        permissions: ['users.read', 'users.write'],
        isAdmin: true,
      },
    };
    const { subject } = canonicalSubjectFromSession(session);
    const policyResult: PolicyResult = { kind: 'allow' };
    const authResult = mapPolicyToAuthorizationResult(policyResult, subject);
    expect(authResult.result).toBe(AuthorizationTransportResult.ALLOW);
    expect(authResult.httpStatus).toBe(200);
    expect(authResult.subject).toBe(subject);
    expect(authResult.errorMessage).toBeUndefined();
  });
});
