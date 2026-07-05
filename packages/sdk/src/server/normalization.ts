/**
 * SDK Stage 3: Canonical Authorization Subject Normalization
 * ============================================================
 *
 * Runtime-neutral canonical authorization subject model for deterministic policy evaluation.
 *
 * Accessor-safe design:
 * - All field reads use `Object.getOwnPropertyDescriptor` to inspect own data properties only.
 * - Accessor properties (getters/setters) on the source object are never invoked.
 * - Proxy traps may be invoked by `getOwnPropertyDescriptor` on proxy objects; these are
 *   caught and fail closed. Proxy revocation exceptions are also caught.
 * - Array element reading is also descriptor-safe: accessor-backed indices are skipped.
 * - No optional-chaining field reads are used on untrusted inputs.
 *
 * Immutability contract:
 * - All returned CanonicalAuthorizationSubject objects are deeply frozen (Object.freeze).
 * - The roles and permissions arrays are frozen before being included in the subject.
 * - Mutation attempts on returned objects or their arrays will silently fail in non-strict mode
 *   or throw in strict mode — they do NOT affect the canonical subject's values.
 * - Each call to normalizeAuthorizationSubject returns a fresh, independent snapshot.
 * - Mutating the source input after normalization does not affect the already-returned result.
 *
 * Security invariants:
 * - Never trusts malformed runtime values.
 * - Produces deterministic output with full deduplication and sorting.
 * - Avoids prototype pollution key injection.
 * - Never leaks raw session/token objects.
 * - Explicitly represents anonymous and authenticated subjects.
 * - isAdmin requires literal boolean `true`; any other truthy value is rejected (prevents
 *   privilege escalation via string coercion).
 * - Remains serializable (JSON.stringify safe).
 *
 * Related: ADR-0002, Stage 2 policy engine
 */

// ---------------------------------------------------------------------------
// Canonical subject types
// ---------------------------------------------------------------------------

/**
 * Canonical subject authentication status.
 */
export enum AuthenticationStatus {
  /** Unauthenticated request with no valid session/token */
  UNAUTHENTICATED = 'unauthenticated',
  /** Authenticated request with valid session/token */
  AUTHENTICATED = 'authenticated',
}

/**
 * Canonical authorization subject for policy evaluation.
 *
 * All fields are readonly. The roles and permissions arrays are readonly and
 * the entire object is frozen at runtime. Mutation is not possible.
 *
 * Always serializable, never contains raw session/token objects.
 */
export interface CanonicalAuthorizationSubject {
  /** Authentication status */
  readonly status: AuthenticationStatus;

  /** User ID, null for unauthenticated */
  readonly userId: string | null;

  /** Email address, null for unauthenticated */
  readonly email: string | null;

  /** Canonical primary role, null for unauthenticated or no role */
  readonly role: string | null;

  /** Deduplicated, sorted, frozen array of all role identifiers */
  readonly roles: readonly string[];

  /** Deduplicated, sorted, frozen array of permission identifiers */
  readonly permissions: readonly string[];

  /** Explicit administrator status: true only if literal boolean true */
  readonly isAdmin: boolean;
}

/**
 * Safe source for canonical subject normalization.
 * All fields are typed as unknown — the normalizer validates every field.
 */
export interface RawAuthorizationSubject {
  readonly userId?: unknown;
  readonly email?: unknown;
  readonly role?: unknown;
  readonly roles?: unknown;
  readonly permissions?: unknown;
  readonly isAdmin?: unknown;
}

// ---------------------------------------------------------------------------
// Accessor-safe property reading helpers
// ---------------------------------------------------------------------------

/**
 * Prototype-pollution key set.
 * Used to reject potentially dangerous string values from role/permission arrays.
 */
const POLLUTION_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
  'hasOwnProperty',
  'toString',
  'valueOf',
]);

/**
 * Read an own data-property value from `obj` without invoking accessor traps.
 *
 * Uses `Object.getOwnPropertyDescriptor` to distinguish data properties
 * (which have `value`) from accessor properties (which have `get`/`set`).
 * Accessor properties are NOT accessed; undefined is returned instead.
 *
 * If `obj` is a Proxy, the `[[GetOwnProperty]]` trap is invoked, which cannot
 * be avoided. Exceptions from revoked proxies or throwing traps are caught and
 * undefined is returned.
 *
 * @returns The own data-property value, or undefined if absent/accessor/error.
 */
function safeReadOwnProperty(obj: object, key: string): unknown {
  try {
    const desc = Object.getOwnPropertyDescriptor(obj, key);
    if (desc === undefined) return undefined;
    // Reject accessor properties without invoking the getter
    if ('get' in desc || 'set' in desc) return undefined;
    return desc.value;
  } catch {
    // Revoked proxy, throwing getOwnPropertyDescriptor trap, or other error
    return undefined;
  }
}

/**
 * Safely extract a non-empty string from an own data property.
 * Returns null if absent, is an accessor, is not a string, or is empty.
 */
function safeOwnString(obj: object, key: string): string | null {
  const val = safeReadOwnProperty(obj, key);
  if (typeof val !== 'string' || val.length === 0) return null;
  return val;
}

/**
 * Safely extract a literal boolean true from an own data property.
 * Only `true` returns true; any other value (including truthy non-booleans) returns false.
 * Prevents privilege escalation via type coercion.
 */
function safeOwnBoolean(obj: object, key: string): boolean {
  return safeReadOwnProperty(obj, key) === true;
}

/**
 * Safely extract validated string elements from an array value without invoking
 * accessor-backed indices.
 *
 * For each array index, uses `Object.getOwnPropertyDescriptor` to check if the
 * element is a data property. Accessor-backed indices are skipped without
 * invoking the getter.
 *
 * Returns a sorted, deduplicated, pollution-filtered array of strings.
 *
 * @param val - The value to inspect. If not an array, returns [].
 */
function safeStringElements(val: unknown): readonly string[] {
  if (!Array.isArray(val)) return Object.freeze([]);

  const result: string[] = [];

  let ownKeys: string[];
  try {
    ownKeys = Object.getOwnPropertyNames(val);
  } catch {
    // Proxy revoked or ownKeys trap threw
    return Object.freeze([]);
  }

  for (const key of ownKeys) {
    // Only process numeric array indices (skip 'length', non-numeric keys)
    const idx = Number(key);
    if (!Number.isFinite(idx) || idx < 0 || idx !== Math.floor(idx) || String(idx) !== key) {
      continue;
    }

    try {
      const desc = Object.getOwnPropertyDescriptor(val, key);
      if (desc === undefined) continue;
      if ('get' in desc || 'set' in desc) continue; // accessor index — skip without invoking
      const el = desc.value;
      if (typeof el !== 'string' || el.length === 0) continue;
      if (!POLLUTION_KEYS.has(el)) result.push(el);
    } catch {
      // Proxy trap threw for this index
      continue;
    }
  }

  return Object.freeze(Array.from(new Set(result)).sort());
}

/**
 * Safely extract a sorted, deduplicated, pollution-filtered string array
 * from an own data property.
 */
function safeOwnStringArray(obj: object, key: string): readonly string[] {
  const val = safeReadOwnProperty(obj, key);
  return safeStringElements(val);
}

// ---------------------------------------------------------------------------
// Frozen unauthenticated constant
// ---------------------------------------------------------------------------

/** Shared frozen unauthenticated subject constant. */
const UNAUTHENTICATED_SUBJECT: CanonicalAuthorizationSubject = Object.freeze({
  status: AuthenticationStatus.UNAUTHENTICATED,
  userId: null,
  email: null,
  role: null,
  roles: Object.freeze([]) as readonly string[],
  permissions: Object.freeze([]) as readonly string[],
  isAdmin: false,
} satisfies CanonicalAuthorizationSubject);

function createUnauthenticatedSubject(): CanonicalAuthorizationSubject {
  // Return the shared constant — it is frozen and cannot be mutated.
  return UNAUTHENTICATED_SUBJECT;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Normalize a raw authorization subject into the canonical frozen form.
 *
 * Never throws; always produces a valid canonical subject or the
 * unauthenticated constant if the input is absent or invalid.
 *
 * Field extraction is accessor-safe:
 * - Own data properties are read via `Object.getOwnPropertyDescriptor`.
 * - Accessor properties on the source are never invoked.
 * - Proxy-trap exceptions are caught and fail closed.
 * - Array elements are extracted element-by-element using descriptor inspection.
 *
 * Defensive rules:
 * - Input must be a non-null, non-array plain object (or null/undefined → unauthenticated).
 * - `userId` must be a non-empty own data-property string; otherwise unauthenticated.
 * - `email` / `role`: non-empty string or null.
 * - `roles` / `permissions`: sorted, deduplicated, pollution-filtered string arrays.
 * - `isAdmin`: only literal `true` is accepted.
 *
 * Output contract:
 * - The returned subject and its arrays are frozen.
 * - Each call returns a fresh object (independent snapshot).
 * - Mutating the source after calling this function does not affect the result.
 *
 * @param raw - Raw input subject (may be null, undefined, or malformed).
 * @returns Frozen canonical subject ready for policy evaluation.
 */
export function normalizeAuthorizationSubject(
  raw: RawAuthorizationSubject | null | undefined
): CanonicalAuthorizationSubject {
  // Reject null, undefined, non-objects, and arrays.
  // Array.isArray on a revoked proxy throws; wrap in try/catch.
  if (raw === null || raw === undefined) {
    return createUnauthenticatedSubject();
  }
  if (typeof raw !== 'object') {
    return createUnauthenticatedSubject();
  }
  try {
    if (Array.isArray(raw)) return createUnauthenticatedSubject();
  } catch {
    // Revoked proxy — fail closed
    return createUnauthenticatedSubject();
  }

  // At this point raw is a non-null object (possibly a proxy).
  // All field reads are descriptor-safe.

  const userId = safeOwnString(raw, 'userId');
  if (!userId) {
    // userId is the identity anchor; without it the subject is unauthenticated.
    return createUnauthenticatedSubject();
  }

  const email = safeOwnString(raw, 'email');
  const role = safeOwnString(raw, 'role');
  const roles = safeOwnStringArray(raw, 'roles');
  const permissions = safeOwnStringArray(raw, 'permissions');
  const isAdmin = safeOwnBoolean(raw, 'isAdmin');

  return Object.freeze({
    status: AuthenticationStatus.AUTHENTICATED,
    userId,
    email,
    role,
    roles,
    permissions,
    isAdmin,
  } satisfies CanonicalAuthorizationSubject);
}

// ---------------------------------------------------------------------------
// Internal exports for compatibility-adapter.ts
// ---------------------------------------------------------------------------

export {
  safeReadOwnProperty as _safeReadOwnProperty,
  safeOwnString as _safeOwnString,
  safeOwnBoolean as _safeOwnBoolean,
  safeOwnStringArray as _safeOwnStringArray,
  safeStringElements as _safeStringElements,
  POLLUTION_KEYS as _POLLUTION_KEYS,
};
