// @vitest-environment node
/**
 * SDK Stage 3: Integration Scenarios
 * ====================================
 *
 * Integration-level tests demonstrating the complete Stage 3 authorization flow.
 *
 * Imports exclusively from public SDK entrypoints:
 * - @devholm/sdk/server  — server-side types and functions
 * - @devholm/sdk         — neutral contracts
 *
 * Environment: node (required for @devholm/sdk/server import)
 *
 * Flow: session → compatibility adapter → canonical subject → policy result → HTTP result
 */

import { describe, it, expect } from 'vitest';
import type { PolicyResult } from '@devholm/sdk';
import {
  normalizeAuthorizationSubject,
  canonicalSubjectFromSession,
  adaptLegacyToCanonical,
  mapPolicyToAuthorizationResult,
  AuthorizationTransportResult,
  AuthenticationStatus,
} from '@devholm/sdk/server';

// ---------------------------------------------------------------------------
// Scenario 1: Admin user allowed
// ---------------------------------------------------------------------------

describe('Scenario: admin user allowed', () => {
  it('produces authenticated canonical subject from session with id field', () => {
    const session = {
      user: {
        id: 'admin-001',
        email: 'admin@example.com',
        role: 'admin',
        roles: ['admin', 'member'],
        permissions: ['users.read', 'admin.access'],
        isAdmin: true,
      },
    };
    // Use compatibility adapter — session.user has 'id', not 'userId'
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
    const result = mapPolicyToAuthorizationResult(
      { kind: 'allow' } satisfies PolicyResult,
      subject
    );
    expect(result.result).toBe(AuthorizationTransportResult.ALLOW);
    expect(result.httpStatus).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: Member denied
// ---------------------------------------------------------------------------

describe('Scenario: member access denied', () => {
  it('maps Stage 2 forbidden to 403 for authenticated member', () => {
    const { subject } = canonicalSubjectFromSession({
      user: {
        id: 'member-001',
        role: 'member',
        roles: ['member'],
        permissions: [],
        isAdmin: false,
      },
    });
    expect(subject.status).toBe(AuthenticationStatus.AUTHENTICATED);
    const result = mapPolicyToAuthorizationResult(
      { kind: 'forbidden' } satisfies PolicyResult,
      subject
    );
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
    const result = mapPolicyToAuthorizationResult(
      { kind: 'unauthenticated' } satisfies PolicyResult,
      subject
    );
    expect(result.result).toBe(AuthorizationTransportResult.UNAUTHENTICATED);
    expect(result.httpStatus).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: Policy engine failure (fail-closed)
// ---------------------------------------------------------------------------

describe('Scenario: policy engine failure', () => {
  it('fails closed with 500 for evaluator-failed (never 403)', () => {
    const { subject } = canonicalSubjectFromSession({
      user: { id: 'u1', role: 'member', isAdmin: false, roles: ['member'], permissions: [] },
    });
    const result = mapPolicyToAuthorizationResult(
      { kind: 'policy-error', error: { code: 'evaluator-failed' } } satisfies PolicyResult,
      subject
    );
    expect(result.result).toBe(AuthorizationTransportResult.POLICY_ERROR);
    expect(result.httpStatus).toBe(500);
    expect(result.result).not.toBe(AuthorizationTransportResult.FORBIDDEN);
  });

  it('fails closed with 503 for missing-runtime-reference', () => {
    const subject = normalizeAuthorizationSubject({ userId: 'u1' });
    const result = mapPolicyToAuthorizationResult(
      { kind: 'policy-error', error: { code: 'missing-runtime-reference' } } satisfies PolicyResult,
      subject
    );
    expect(result.httpStatus).toBe(503);
    expect(result.result).toBe(AuthorizationTransportResult.POLICY_ERROR);
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: Legacy compatibility adapter
// ---------------------------------------------------------------------------

describe('Scenario: legacy compatibility adapter', () => {
  it('adapts legacy authorization data to canonical form', () => {
    const { subject, diagnostics } = adaptLegacyToCanonical(
      {
        id: 'user-123',
        email: 'user@example.com',
        role: 'member',
        roles: ['member', 'contributor'],
        permissions: ['posts.read', 'posts.write'],
        isAdmin: false,
      },
      { diagnosticsEnabled: true, adminDeterminationRule: 'legacy' }
    );
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
    const { subject } = canonicalSubjectFromSession({
      user: {
        id: 'u1',
        roles: ['member', '__proto__', 'constructor', 'prototype', 'admin'],
        permissions: [],
        isAdmin: false,
      },
    });
    expect(subject.roles).toEqual(['admin', 'member']);
    expect(subject.roles).not.toContain('__proto__');
    expect(subject.roles).not.toContain('constructor');
  });
});

// ---------------------------------------------------------------------------
// Scenario 7: Determinism
// ---------------------------------------------------------------------------

describe('Scenario: determinism', () => {
  it('deduplicates and sorts roles and permissions', () => {
    const { subject } = canonicalSubjectFromSession({
      user: {
        id: 'u1',
        roles: ['admin', 'member', 'admin', 'contributor', 'member'],
        permissions: ['write', 'read', 'write', 'delete', 'read'],
      },
    });
    expect(subject.roles).toEqual(['admin', 'contributor', 'member']);
    expect(subject.permissions).toEqual(['delete', 'read', 'write']);
  });
});

// ---------------------------------------------------------------------------
// Scenario 8: Complete flow
// ---------------------------------------------------------------------------

describe('Scenario: complete authorization flow', () => {
  it('produces ALLOW with 200 for admin session and allow policy result', () => {
    const session = {
      user: {
        id: 'u1',
        email: 'admin@example.com',
        role: 'admin',
        roles: ['admin', 'member'],
        permissions: ['users.read'],
        isAdmin: true,
      },
    };
    const { subject } = canonicalSubjectFromSession(session);
    const result = mapPolicyToAuthorizationResult({ kind: 'allow' }, subject);
    expect(result.result).toBe(AuthorizationTransportResult.ALLOW);
    expect(result.httpStatus).toBe(200);
    expect(result.subject).toBe(subject);
    expect(result.errorMessage).toBeUndefined();
  });
});
