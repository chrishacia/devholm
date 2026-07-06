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
} from './normalization';
import {
  safeReadOwnProperty,
  safeOwnString,
  safeOwnBoolean,
  safeOwnStringArray,
} from './_normalization-helpers';

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
 * Safely convert an unknown value to a non-null plain object or null.
 *
 * Accepted records: plain objects or null-prototype records with own data properties.
 * Rejected: null, undefined, non-objects, arrays, Date instances, functions, class instances,
 * and any object whose prototype is neither Object.prototype nor null.
 *
 * Every inspection operation that may invoke a proxy trap is wrapped in an exception
 * boundary. Any exception during inspection causes this function to return null (fail
 * closed). The "fail closed" contract means we never accept an object whose type we
 * cannot safely determine.
 *
 * - `Array.isArray`: may throw on a revoked proxy or a proxy whose `isArray` internal
 *   operation throws — wrapped, returns null on exception.
 * - `instanceof Date`: invokes the [[GetPrototypeOf]] internal method — may throw on a
 *   revoked proxy — wrapped, returns null on exception (fail closed, not accepted).
 * - `Object.getPrototypeOf`: may throw on a revoked proxy — wrapped, returns null on exception.
 *   Only Object.prototype or null are accepted.
 */
function toSafeObject(val: unknown): object | null {
  if (val === null || val === undefined) return null;
  if (typeof val !== 'object') return null;
  // Array.isArray may throw on a revoked proxy or a proxy whose isArray trap throws.
  // Fail closed: cannot safely determine type, so reject.
  let isArr: boolean;
  try {
    isArr = Array.isArray(val);
  } catch {
    return null; // fail closed
  }
  if (isArr) return null;
  // instanceof Date invokes [[GetPrototypeOf]] which can throw on a revoked proxy.
  // Fail closed: reject if we cannot safely determine the prototype chain.
  try {
    if (val instanceof Date) return null;
  } catch {
    return null; // fail closed: cannot safely inspect, reject
  }
  // Object.getPrototypeOf may throw on a revoked proxy. Fail closed: reject if
  // we cannot safely inspect the prototype. Only plain objects (Object.prototype)
  // and null-prototype records are accepted.
  let prototype: object | null;
  try {
    prototype = Object.getPrototypeOf(val);
  } catch {
    return null; // fail closed: cannot safely inspect prototype
  }
  // Reject unless prototype is Object.prototype or null
  if (prototype !== Object.prototype && prototype !== null) {
    return null; // fail closed: class instance, Map, Set, RegExp, etc.
  }
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
    ? safeOwnString(legacyObj, 'id') ?? safeOwnString(legacyObj, 'userId')
    : null;
  const legacyEmail = legacyObj ? safeOwnString(legacyObj, 'email') : null;
  const legacyRole = legacyObj ? safeOwnString(legacyObj, 'role') : null;
  const legacyRoles = legacyObj
    ? safeOwnStringArray(legacyObj, 'roles')
    : (Object.freeze([]) as readonly string[]);
  const legacyPermissions = legacyObj
    ? safeOwnStringArray(legacyObj, 'permissions')
    : (Object.freeze([]) as readonly string[]);
  const legacyIsAdmin = legacyObj ? safeOwnBoolean(legacyObj, 'isAdmin') : false;

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
  // All arrays here are already validated strings (frozen by safeOwnStringArray).
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
  const rawUser = sessionObj ? safeReadOwnProperty(sessionObj, 'user') : undefined;
  const userObj = toSafeObject(rawUser);

  // Build legacy subject using descriptor-safe extraction from userObj.
  const legacy: LegacyAuthorizationSubject =
    userObj !== null
      ? {
          id: safeOwnString(userObj, 'id') ?? undefined,
          userId: safeOwnString(userObj, 'userId') ?? undefined,
          email: safeOwnString(userObj, 'email') ?? undefined,
          name: safeOwnString(userObj, 'name') ?? undefined,
          role: safeOwnString(userObj, 'role') ?? undefined,
          roles: [...safeOwnStringArray(userObj, 'roles')] as string[],
          permissions: [...safeOwnStringArray(userObj, 'permissions')] as string[],
          isAdmin: safeOwnBoolean(userObj, 'isAdmin'),
          installCompleted: safeOwnBoolean(userObj, 'installCompleted'),
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
          id: safeOwnString(tokenObj, 'id') ?? undefined,
          userId: safeOwnString(tokenObj, 'userId') ?? undefined,
          email: safeOwnString(tokenObj, 'email') ?? undefined,
          name: safeOwnString(tokenObj, 'name') ?? undefined,
          role: safeOwnString(tokenObj, 'role') ?? undefined,
          roles: [...safeOwnStringArray(tokenObj, 'roles')] as string[],
          permissions: [...safeOwnStringArray(tokenObj, 'permissions')] as string[],
          isAdmin: safeOwnBoolean(tokenObj, 'isAdmin'),
          installCompleted: safeOwnBoolean(tokenObj, 'installCompleted'),
        }
      : {};

  return adaptLegacyToCanonical(legacy, options);
}
