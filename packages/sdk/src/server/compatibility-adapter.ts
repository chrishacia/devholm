/**
 * SDK Stage 3: Legacy Compatibility Adapter
 * ==========================================
 *
 * Explicit adapter that maps current DevHolm authorization behavior into the canonical SDK model.
 *
 * Accessor-safe design (mirrors normalization.ts):
 * - All property reads from untrusted source objects use descriptor-safe helpers
 *   exported from normalization.ts.
 * - Accessor properties on source objects are never invoked.
 * - Proxy-trap exceptions are caught and fail closed.
 * - No optional-chaining field reads on `Record<string, unknown>` inputs.
 *
 * Related: ADR-0002, Stage 2 policy engine, Stage 3 implementation
 */

import {
  type CanonicalAuthorizationSubject,
  type RawAuthorizationSubject,
  normalizeAuthorizationSubject,
  _safeReadOwnProperty,
  _safeOwnString,
  _safeOwnBoolean,
  _safeOwnStringArray,
} from './normalization';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Diagnostics from compatibility adapter evaluation. */
export interface CompatibilityAdapterDiagnostics {
  /** Whether compatibility path was used */
  usedCompatibilityPath: boolean;
  /** Human-readable path description */
  pathDescription: string;
  /** Normalized subject (if diagnostics enabled) */
  normalizedSubject?: CanonicalAuthorizationSubject;
}

/** Options for compatibility adapter behavior. */
export interface CompatibilityAdapterOptions {
  /** Enable diagnostic output (default: false) */
  diagnosticsEnabled?: boolean;
  /** Administrator determination rule: which fields determine admin status */
  adminDeterminationRule?: 'legacy' | 'canonical' | 'union';
}

/**
 * Typed shape of a DevHolm legacy authorization subject.
 * Note: the LegacyAuthorizationSubject adapter accepts this type,
 * but actual objects passed at runtime may not conform — all fields
 * are extracted defensively.
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Safely convert an unknown value to a non-null object or null.
 * Rejects null, undefined, non-objects, arrays, Dates, functions.
 */
function toSafeObject(val: unknown): object | null {
  if (val === null || val === undefined) return null;
  if (typeof val !== 'object') return null;
  if (Array.isArray(val)) return null;
  return val as object;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Adapt a legacy DevHolm authorization subject to canonical form.
 *
 * Admin determination strategies:
 * - 'legacy' (default): isAdmin=true OR role in ['admin','superadmin'] OR roles contains those
 * - 'canonical': only explicit isAdmin=true
 * - 'union': either legacy OR canonical rule
 *
 * All fields are extracted defensively. Accessor properties on `legacy` are never
 * invoked; proxy exceptions fail closed.
 */
export function adaptLegacyToCanonical(
  legacy: LegacyAuthorizationSubject | null | undefined,
  options?: CompatibilityAdapterOptions
): { subject: CanonicalAuthorizationSubject; diagnostics?: CompatibilityAdapterDiagnostics } {
  const diagnosticsEnabled = options?.diagnosticsEnabled ?? false;
  const adminRule = options?.adminDeterminationRule ?? 'legacy';

  // Convert to safe object — rejects null/undefined/non-objects/arrays
  const legacyObj = toSafeObject(legacy);

  // Extract fields using descriptor-safe helpers.
  // These do NOT invoke accessor getters on the source object.
  const legacyUserId = legacyObj
    ? _safeOwnString(legacyObj, 'id') ?? _safeOwnString(legacyObj, 'userId')
    : null;
  const legacyEmail = legacyObj ? _safeOwnString(legacyObj, 'email') : null;
  const legacyRole = legacyObj ? _safeOwnString(legacyObj, 'role') : null;
  const legacyRoles = legacyObj
    ? _safeOwnStringArray(legacyObj, 'roles')
    : (Object.freeze([]) as readonly string[]);
  const legacyPermissions = legacyObj
    ? _safeOwnStringArray(legacyObj, 'permissions')
    : (Object.freeze([]) as readonly string[]);
  const legacyIsAdmin = legacyObj ? _safeOwnBoolean(legacyObj, 'isAdmin') : false;

  // Determine administrator status according to the configured rule.
  // The legacy/union rules match the pre-migration `hasAdminAccess` behavior:
  //   isAdmin === true OR role is 'admin'/'superadmin' OR roles contains those values.
  let isAdmin = false;
  if (adminRule === 'legacy' || adminRule === 'union') {
    isAdmin =
      legacyIsAdmin ||
      legacyRole === 'admin' ||
      legacyRole === 'superadmin' ||
      legacyRoles.includes('admin') ||
      legacyRoles.includes('superadmin');
  }
  if (adminRule === 'canonical') {
    isAdmin = legacyIsAdmin;
  }

  // Build RawAuthorizationSubject and normalize through the standard path.
  // All arrays here are already validated strings (frozen by _safeOwnStringArray).
  const raw: RawAuthorizationSubject = {
    userId: legacyUserId,
    email: legacyEmail,
    role: legacyRole,
    roles: [...legacyRoles], // spread to produce a plain mutable array for RawAuthorizationSubject
    permissions: [...legacyPermissions],
    isAdmin,
  };

  const subject = normalizeAuthorizationSubject(raw);

  const diagnostics: CompatibilityAdapterDiagnostics | undefined = diagnosticsEnabled
    ? {
        usedCompatibilityPath: true,
        pathDescription: `Legacy DevHolm subject adapted to canonical form. Admin determined by ${adminRule} rule.`,
        normalizedSubject: subject,
      }
    : undefined;

  return { subject, diagnostics };
}

/**
 * Build canonical subject from a DevHolm NextAuth session object.
 *
 * Extracts the `user` property using descriptor-safe reading to avoid invoking
 * any getter traps on the session object. All nested field reads are also
 * descriptor-safe.
 */
export function canonicalSubjectFromSession(
  session: { user?: Record<string, unknown> } | null | undefined,
  options?: CompatibilityAdapterOptions
): { subject: CanonicalAuthorizationSubject; diagnostics?: CompatibilityAdapterDiagnostics } {
  // Safely extract user from session — no optional-chaining read.
  const sessionObj = toSafeObject(session);
  const rawUser = sessionObj ? _safeReadOwnProperty(sessionObj, 'user') : undefined;
  const userObj = toSafeObject(rawUser);

  // Build legacy subject using descriptor-safe extraction from userObj.
  const legacy: LegacyAuthorizationSubject =
    userObj !== null
      ? {
          id: _safeOwnString(userObj, 'id') ?? undefined,
          userId: _safeOwnString(userObj, 'userId') ?? undefined,
          email: _safeOwnString(userObj, 'email') ?? undefined,
          name: _safeOwnString(userObj, 'name') ?? undefined,
          role: _safeOwnString(userObj, 'role') ?? undefined,
          roles: [..._safeOwnStringArray(userObj, 'roles')] as string[],
          permissions: [..._safeOwnStringArray(userObj, 'permissions')] as string[],
          isAdmin: _safeOwnBoolean(userObj, 'isAdmin'),
          installCompleted: _safeOwnBoolean(userObj, 'installCompleted'),
        }
      : {};

  return adaptLegacyToCanonical(legacy, options);
}

/**
 * Build canonical subject from a DevHolm NextAuth JWT token.
 *
 * All field reads are descriptor-safe; no getter traps are invoked.
 */
export function canonicalSubjectFromToken(
  token: Record<string, unknown> | null | undefined,
  options?: CompatibilityAdapterOptions
): { subject: CanonicalAuthorizationSubject; diagnostics?: CompatibilityAdapterDiagnostics } {
  const tokenObj = toSafeObject(token);

  const legacy: LegacyAuthorizationSubject =
    tokenObj !== null
      ? {
          id: _safeOwnString(tokenObj, 'id') ?? undefined,
          userId: _safeOwnString(tokenObj, 'userId') ?? undefined,
          email: _safeOwnString(tokenObj, 'email') ?? undefined,
          name: _safeOwnString(tokenObj, 'name') ?? undefined,
          role: _safeOwnString(tokenObj, 'role') ?? undefined,
          roles: [..._safeOwnStringArray(tokenObj, 'roles')] as string[],
          permissions: [..._safeOwnStringArray(tokenObj, 'permissions')] as string[],
          isAdmin: _safeOwnBoolean(tokenObj, 'isAdmin'),
          installCompleted: _safeOwnBoolean(tokenObj, 'installCompleted'),
        }
      : {};

  return adaptLegacyToCanonical(legacy, options);
}
