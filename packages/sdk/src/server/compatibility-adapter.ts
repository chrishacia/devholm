/**
 * SDK Stage 3: Legacy Compatibility Adapter
 * ==========================================
 *
 * Explicit adapter that maps current DevHolm authorization behavior into the canonical SDK model.
 * This layer is NOT embedded in the policy engine; it is explicitly used during staged migration.
 *
 * Design principles:
 * - Legacy behavior remains available during migration
 * - Compatibility is not silent; callers know which path they're using
 * - Diagnostics are sanitized and configuration-controlled
 * - No secrets, raw exceptions, stack traces, or database objects cross the boundary
 * - Compatibility diagnostics never change authorization results
 * - Malformed inputs fail closed
 * - Rollback to existing legacy checks is possible without reverting SDK foundation
 *
 * Related: ADR-0002, Stage 2 policy engine, Stage 3 implementation
 */

import {
  type CanonicalAuthorizationSubject,
  type RawAuthorizationSubject,
  normalizeAuthorizationSubject,
} from './normalization';

/**
 * Diagnostics from compatibility adapter evaluation.
 * Sanitized to never leak secrets, raw exceptions, or internal details.
 */
export interface CompatibilityAdapterDiagnostics {
  /** Whether compatibility path was used (true) or canonical path (false) */
  usedCompatibilityPath: boolean;

  /** Human-readable description of which path and why */
  pathDescription: string;

  /** Normalized subject before policy evaluation */
  normalizedSubject?: CanonicalAuthorizationSubject;
}

/**
 * Options for compatibility adapter behavior.
 */
export interface CompatibilityAdapterOptions {
  /** Enable diagnostic output (default: false for production) */
  diagnosticsEnabled?: boolean;

  /** Administrator rule implementation: which fields determine admin status */
  adminDeterminationRule?: 'legacy' | 'canonical' | 'union';
}

/**
 * Current DevHolm authorization subject shape (may be malformed at runtime).
 * This represents the existing token/session shape in the framework.
 */
export interface LegacyAuthorizationSubject {
  id?: string;
  userId?: string;
  email?: string | null;
  name?: string | null;
  role?: string | null;
  roles?: string[];
  permissions?: string[];
  isAdmin?: boolean;
  installCompleted?: boolean;
}

/**
 * Adapt legacy DevHolm authorization subject to canonical form.
 * Provides optional diagnostics to help track the migration.
 *
 * Legacy behavior:
 * - Primary userId comes from 'id' or 'userId' field
 * - Primary role comes from 'role' field
 * - Administrator is determined by: isAdmin === true, role === 'admin' or 'superadmin', roles includes admin/superadmin
 *
 * @param legacy - Legacy DevHolm subject (may be null or malformed)
 * @param options - Adapter options for diagnostics and fallback behavior
 * @returns Canonical subject and optional diagnostics
 */
export function adaptLegacyToCanonical(
  legacy: LegacyAuthorizationSubject | null | undefined,
  options?: CompatibilityAdapterOptions
): { subject: CanonicalAuthorizationSubject; diagnostics?: CompatibilityAdapterDiagnostics } {
  const diagnosticsEnabled = options?.diagnosticsEnabled ?? false;
  const adminRule = options?.adminDeterminationRule ?? 'legacy';

  // Extract fields from legacy subject with defensive validation
  const legacyUserId =
    typeof legacy?.id === 'string'
      ? legacy.id
      : typeof legacy?.userId === 'string'
        ? legacy.userId
        : null;
  const legacyEmail = typeof legacy?.email === 'string' ? legacy.email : null;
  const legacyRole = typeof legacy?.role === 'string' ? legacy.role : null;
  const legacyRoles = Array.isArray(legacy?.roles) ? legacy.roles : [];
  const legacyPermissions = Array.isArray(legacy?.permissions) ? legacy.permissions : [];
  const legacyIsAdmin = legacy?.isAdmin === true;

  // Determine administrator status according to the configured rule
  let isAdmin = false;
  if (adminRule === 'legacy' || adminRule === 'union') {
    // Legacy rule: isAdmin OR role in ['admin', 'superadmin'] OR roles includes admin/superadmin
    isAdmin =
      legacyIsAdmin ||
      legacyRole === 'admin' ||
      legacyRole === 'superadmin' ||
      legacyRoles.includes('admin') ||
      legacyRoles.includes('superadmin');
  }
  if (adminRule === 'canonical') {
    // Canonical rule: only explicit isAdmin field (for future strict mode)
    isAdmin = legacyIsAdmin;
  }

  // Build raw subject for canonical normalization
  const raw: RawAuthorizationSubject = {
    userId: legacyUserId,
    email: legacyEmail,
    role: legacyRole,
    roles: legacyRoles,
    permissions: legacyPermissions,
    isAdmin,
  };

  // Normalize to canonical form
  const subject = normalizeAuthorizationSubject(raw);

  // Build diagnostics if enabled
  let diagnostics: CompatibilityAdapterDiagnostics | undefined;
  if (diagnosticsEnabled) {
    diagnostics = {
      usedCompatibilityPath: true,
      pathDescription: `Legacy DevHolm subject adapted to canonical form. Admin determined by ${adminRule} rule.`,
      normalizedSubject: subject,
    };
  }

  return { subject, diagnostics };
}

/**
 * Build canonical subject from current DevHolm NextAuth session.
 * Wrapper around adaptLegacyToCanonical for session-based usage.
 *
 * @param session - NextAuth session object (may be null or incomplete)
 * @param options - Adapter options
 * @returns Canonical subject and optional diagnostics
 */
export function canonicalSubjectFromSession(
  session: { user?: Record<string, unknown> } | null | undefined,
  options?: CompatibilityAdapterOptions
): { subject: CanonicalAuthorizationSubject; diagnostics?: CompatibilityAdapterDiagnostics } {
  const user = session?.user || null;

  const legacy: LegacyAuthorizationSubject = {
    // user is Record<string, unknown> | null; cast each field defensively.
    // adaptLegacyToCanonical validates all fields, so unsafe casts here are safe.
    id: user?.id as string | undefined,
    userId: user?.id as string | undefined,
    email: user?.email as string | null | undefined,
    name: user?.name as string | null | undefined,
    role: user?.role as string | null | undefined,
    roles: user?.roles as string[] | undefined,
    permissions: user?.permissions as string[] | undefined,
    isAdmin: user?.isAdmin as boolean | undefined,
    installCompleted: user?.installCompleted as boolean | undefined,
  };

  return adaptLegacyToCanonical(legacy, options);
}

/**
 * Build canonical subject from NextAuth JWT token.
 * Wrapper around adaptLegacyToCanonical for token-based usage.
 *
 * @param token - NextAuth JWT token (may be null or incomplete)
 * @param options - Adapter options
 * @returns Canonical subject and optional diagnostics
 */
export function canonicalSubjectFromToken(
  token: Record<string, unknown> | null | undefined,
  options?: CompatibilityAdapterOptions
): { subject: CanonicalAuthorizationSubject; diagnostics?: CompatibilityAdapterDiagnostics } {
  const legacy: LegacyAuthorizationSubject = {
    // Access through Record<string, unknown>; each value is unknown, cast to the
    // expected optional type. adaptLegacyToCanonical validates each field defensively.
    id: token?.id as string | undefined,
    userId: token?.id as string | undefined,
    email: token?.email as string | null | undefined,
    name: token?.name as string | null | undefined,
    role: token?.role as string | null | undefined,
    roles: token?.roles as string[] | undefined,
    permissions: token?.permissions as string[] | undefined,
    isAdmin: token?.isAdmin as boolean | undefined,
    installCompleted: token?.installCompleted as boolean | undefined,
  };

  return adaptLegacyToCanonical(legacy, options);
}
