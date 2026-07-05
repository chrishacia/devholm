/**
 * SDK Stage 3: Canonical Authorization Subject Normalization
 * ============================================================
 *
 * Accessor-safe design:
 * - All field reads use `Object.getOwnPropertyDescriptor` (via `_normalization-helpers.ts`)
 *   to inspect own data properties without invoking accessor getter traps.
 * - Accessor properties on the source are never invoked.
 * - Proxy-trap exceptions are caught and fail closed.
 * - Array element reading is also descriptor-safe.
 *
 * Snapshot contract:
 * - **Authenticated results**: each call returns a freshly allocated frozen object.
 *   Mutating the source after normalization does not affect the returned result.
 * - **Unauthenticated results**: returns a shared frozen constant
 *   (`UNAUTHENTICATED_SUBJECT`). The returned reference is always the same object
 *   for unauthenticated inputs, but it is frozen so mutations are impossible.
 *   Callers that require reference identity (`===`) should not use unauthenticated
 *   subjects as dictionary keys.
 *
 * Security invariants:
 * - Never trusts malformed runtime values.
 * - Produces deterministic output with full deduplication and sorting.
 * - Rejects prototype-pollution key injection.
 * - Never leaks raw session/token objects.
 * - `isAdmin`: only literal `true` is accepted (prevents privilege escalation via coercion).
 * - Output is JSON-serializable.
 *
 * Related: ADR-0002, Stage 2 policy engine
 */

import { safeOwnString, safeOwnBoolean, safeOwnStringArray } from './_normalization-helpers';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export enum AuthenticationStatus {
  UNAUTHENTICATED = 'unauthenticated',
  AUTHENTICATED = 'authenticated',
}

/**
 * Canonical authorization subject for policy evaluation.
 *
 * All fields are readonly. The `roles` and `permissions` arrays are frozen at
 * runtime. Authenticated subjects are freshly allocated each call; unauthenticated
 * subjects return a shared frozen constant.
 */
export interface CanonicalAuthorizationSubject {
  readonly status: AuthenticationStatus;
  readonly userId: string | null;
  readonly email: string | null;
  readonly role: string | null;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
  readonly isAdmin: boolean;
}

/**
 * Safe source for canonical subject normalization.
 * All fields are typed as `unknown` — the normalizer validates every field.
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
// Shared frozen unauthenticated constant
// ---------------------------------------------------------------------------

/**
 * Shared frozen unauthenticated subject constant.
 *
 * All unauthenticated inputs return this exact reference. It is frozen so
 * mutations will throw. Callers must not use reference identity to distinguish
 * unauthenticated results; check `subject.status` instead.
 */
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
  return UNAUTHENTICATED_SUBJECT;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Normalize a raw authorization subject into the canonical frozen form.
 *
 * Never throws; always produces a valid canonical subject or the shared
 * unauthenticated constant if the input is absent or invalid.
 *
 * **Field extraction is accessor-safe**: own data properties are read via
 * `Object.getOwnPropertyDescriptor`. Accessor properties (getters/setters) on
 * the source are never invoked. Proxy-trap exceptions are caught and fail closed.
 * Array elements are extracted element-by-element using descriptor inspection.
 *
 * **Snapshot contract**:
 * - Authenticated: each call returns a freshly allocated frozen object. Mutating
 *   the source after this call does not affect the already-returned result.
 * - Unauthenticated: returns the shared `UNAUTHENTICATED_SUBJECT` constant (same
 *   object reference for every unauthenticated call). It is frozen; mutations throw.
 *
 * Defensive rules:
 * - Input must be a non-null, non-array plain object (or null/undefined → unauthenticated).
 * - `userId`: must be a non-empty own data-property string; otherwise unauthenticated.
 * - `email`/`role`: non-empty string or null.
 * - `roles`/`permissions`: sorted, deduplicated, pollution-filtered string arrays.
 * - `isAdmin`: only literal `true` is accepted; any other value returns false.
 */
export function normalizeAuthorizationSubject(
  raw: RawAuthorizationSubject | null | undefined
): CanonicalAuthorizationSubject {
  if (raw === null || raw === undefined) {
    return createUnauthenticatedSubject();
  }
  if (typeof raw !== 'object') {
    return createUnauthenticatedSubject();
  }
  // Array.isArray on a revoked proxy throws; wrap in try/catch.
  try {
    if (Array.isArray(raw)) return createUnauthenticatedSubject();
  } catch {
    return createUnauthenticatedSubject();
  }

  const userId = safeOwnString(raw, 'userId');
  if (!userId) {
    return createUnauthenticatedSubject();
  }

  const email = safeOwnString(raw, 'email');
  const role = safeOwnString(raw, 'role');
  const roles = safeOwnStringArray(raw, 'roles');
  const permissions = safeOwnStringArray(raw, 'permissions');
  const isAdmin = safeOwnBoolean(raw, 'isAdmin');

  // Authenticated: fresh frozen object each call.
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
// Note: The safe-property helpers (safeReadOwnProperty, safeOwnString, etc.)
// are defined in `./_normalization-helpers.ts` and imported above. They are
// NOT re-exported from this module. `compatibility-adapter.ts` imports them
// directly from `_normalization-helpers.ts`. These helpers are internal SDK
// implementation details and are not part of the `@devholm/sdk/server` API.
// ---------------------------------------------------------------------------
