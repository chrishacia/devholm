/**
 * SDK Stage 3: Canonical Authorization Subject Normalization
 * ============================================================
 *
 * Runtime-neutral canonical authorization subject model for deterministic policy evaluation.
 * This module provides the definitive subject representation for all authorization decisions.
 *
 * Security invariants:
 * - Never trusts malformed runtime values
 * - Produces deterministic output with full deduplication
 * - Avoids prototype pollution and accessor execution
 * - Never leaks raw session/token objects
 * - Explicitly represents anonymous and authenticated subjects
 * - Establishes one documented administrator rule
 * - Remains serializable
 *
 * Related: ADR-0002, Stage 2 policy engine
 */

/**
 * Canonical subject authentication status
 */
export enum AuthenticationStatus {
  /** Unauthenticated request with no valid session/token */
  UNAUTHENTICATED = 'unauthenticated',
  /** Authenticated request with valid session/token */
  AUTHENTICATED = 'authenticated',
}

/**
 * Canonical authorization subject for policy evaluation.
 * Always serializable, never contains raw session/token objects.
 */
export interface CanonicalAuthorizationSubject {
  /** Authentication status */
  status: AuthenticationStatus;

  /** User ID, null for unauthenticated */
  userId: string | null;

  /** Email address, null for unauthenticated */
  email: string | null;

  /** Canonical primary role, null for unauthenticated or no role */
  role: string | null;

  /** Deduplicated, sorted array of all role identifiers */
  roles: string[];

  /** Deduplicated, sorted array of permission identifiers */
  permissions: string[];

  /** Explicit administrator status: true if user is admin, false otherwise */
  isAdmin: boolean;
}

/**
 * Safe source for canonical subject normalization.
 * Input shape must never be trusted; all fields are defensively validated.
 */
export interface RawAuthorizationSubject {
  userId?: unknown;
  email?: unknown;
  role?: unknown;
  roles?: unknown;
  permissions?: unknown;
  isAdmin?: unknown;
}

/**
 * Normalize raw authorization subject into canonical form.
 * Never throws; always produces a valid canonical subject or unauthenticated default.
 *
 * Defensive behavior:
 * - Non-string/non-null userId is rejected; unauthenticated result
 * - Non-string/non-null email is rejected; set to null
 * - Non-string/non-null role is rejected; set to null
 * - Non-array roles are rejected; set to []
 * - Non-string elements in roles array are filtered out
 * - Duplicate roles are deduplicated and sorted
 * - Empty string roles are filtered out
 * - Non-array permissions are rejected; set to []
 * - Non-string elements in permissions array are filtered out
 * - Duplicate permissions are deduplicated and sorted
 * - Empty string permissions are filtered out
 * - Non-boolean isAdmin is coerced to false
 *
 * @param raw - Raw input subject (may be null, undefined, or malformed)
 * @param options - Normalization options (reserved for future policy extensions)
 * @returns Canonical subject ready for policy evaluation
 */
export function normalizeAuthorizationSubject(
  raw: RawAuthorizationSubject | null | undefined
): CanonicalAuthorizationSubject {
  if (!raw || typeof raw !== 'object') {
    return createUnauthenticatedSubject();
  }

  const userId = extractString(raw.userId);
  if (!userId) {
    return createUnauthenticatedSubject();
  }

  const email = extractString(raw.email);
  const role = extractString(raw.role);
  const roles = extractAndDedupStringArray(raw.roles);
  const permissions = extractAndDedupStringArray(raw.permissions);
  const isAdmin = extractBoolean(raw.isAdmin);

  return {
    status: AuthenticationStatus.AUTHENTICATED,
    userId,
    email,
    role,
    roles,
    permissions,
    isAdmin,
  };
}

/**
 * Create an unauthenticated canonical subject (default safe state).
 */
function createUnauthenticatedSubject(): CanonicalAuthorizationSubject {
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

/**
 * Safely extract string value or return null.
 */
function extractString(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  return null;
}

/**
 * Safely extract boolean value with coercion to false for invalid inputs.
 */
function extractBoolean(value: unknown): boolean {
  return Boolean(value);
}

/**
 * Safely extract array of strings, deduplicate, sort, and return.
 * Filters out non-string, empty string, and null values.
 */
function extractAndDedupStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  // Filter to valid non-empty strings
  const strings = value
    .filter((item): item is string => typeof item === 'string' && item.length > 0)
    .filter((item) => !isPrototypePollutionKey(item));

  // Deduplicate and sort for deterministic output
  return Array.from(new Set(strings)).sort();
}

/**
 * Detect prototype pollution attack keys.
 */
function isPrototypePollutionKey(key: string): boolean {
  return (
    key === '__proto__' ||
    key === 'constructor' ||
    key === 'prototype' ||
    key === 'hasOwnProperty' ||
    key === 'toString' ||
    key === 'valueOf'
  );
}
