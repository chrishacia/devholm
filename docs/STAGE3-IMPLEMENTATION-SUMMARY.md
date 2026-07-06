# SDK Stage 3: Server-Side Authorization Enforcement

**Status:** Final hardening via `fix/sdk-stage3-proxy-action-hardening` (follow-up to PR #41)
**Related:** ADR-0002, Stage 2 (#31), issue #39, parent #6

---

## What is Stage 3?

Stage 3 implements the server-side enforcement layer that bridges Stage 2's deterministic policy engine with the canonical authorization subject model. It delivers:

1. **Canonical subject normalization** — converts any raw session/token into a strongly-typed, frozen, snapshot-isolated subject
2. **Compatibility adapter** — maps current DevHolm session/token shapes to the canonical form during staged migration
3. **Route wrapper** — evaluates Stage 2 declarations against canonical subjects and returns deterministic HTTP-mapped results
4. **Server-action wrapper** — distinct from the route wrapper; returns action-oriented results (no HTTP status codes)
5. **Application adapter** — application-owned policy registry + declarations + helper functions

Stage 3 does **not** implement: middleware integration (Stage 4), React visibility (Stage 5), or acceptance proof (Stage 6).

---

## Canonical Subject Contract

### Type definition

```typescript
export interface CanonicalAuthorizationSubject {
  readonly status: AuthenticationStatus; // 'authenticated' | 'unauthenticated'
  readonly userId: string | null;
  readonly email: string | null;
  readonly role: string | null;
  readonly roles: readonly string[]; // sorted, deduplicated, frozen
  readonly permissions: readonly string[]; // sorted, deduplicated, frozen
  readonly isAdmin: boolean;
}
```

### Runtime contract: deeply frozen snapshots

- `normalizeAuthorizationSubject` returns a `Object.freeze`'d subject.
- `roles` and `permissions` arrays are individually frozen before inclusion.
- Every call returns a **fresh, independent** snapshot. Mutating the source after normalization does not affect the already-returned result.
- Mutation attempts on frozen output objects or their arrays throw in strict mode.
- This is a **runtime contract enforced via `Object.freeze`**, not solely a TypeScript type guarantee.

---

## Accessor-Safe Field Reading and Revoked-Proxy Boundaries

All field reads from untrusted source objects use `Object.getOwnPropertyDescriptor` rather than optional-chaining property access.

**Why:** `object?.field` invokes the `[[Get]]` operation, which executes accessor getter traps on regular objects and the `get` proxy trap on proxies. For authorization code, executing untrusted getter code on an input object is a security risk.

**What the safe approach does:**

- Calls `Object.getOwnPropertyDescriptor(obj, key)` to retrieve the property descriptor
- If the descriptor has `get` or `set` (i.e., it's an accessor), returns `undefined` without invoking the getter
- If the descriptor has `value` (i.e., it's a data property), reads the value safely
- Wraps all descriptor reads in `try/catch` to handle revoked-proxy exceptions and throwing `getOwnPropertyDescriptor` traps

**Fully protected operations** (every one is inside a try/catch, fail-closed):

| Operation                                                 | Protected | Fail-closed behavior                       |
| --------------------------------------------------------- | --------- | ------------------------------------------ |
| `Array.isArray(val)` in `safeStringElements`              | ✅        | returns frozen `[]`                        |
| `Array.isArray(val)` in `toSafeObject`                    | ✅        | returns `null` (rejects object)            |
| `val instanceof Date` in `toSafeObject`                   | ✅        | returns `null` (fail closed, not accepted) |
| `Object.getOwnPropertyNames(arr)` in `safeStringElements` | ✅        | returns frozen `[]`                        |
| `Object.getOwnPropertyDescriptor(obj, key)` per property  | ✅        | returns `undefined` for that property      |

**Important: no "accept on failure" paths.** A previous version of `toSafeObject` accepted objects when the `instanceof Date` check threw. This has been corrected: any inspection exception causes the object to be **rejected** (fail closed), never accepted.

**Accepted records:** plain objects or null-prototype records with own data properties.
**Rejected:** null, undefined, non-objects, arrays, Date instances, functions, and any object that cannot be safely inspected.

**Proxy safety guarantee:**

- For **regular objects with accessor properties**: getters are **never invoked**
- For **revoked proxies** as top-level input: caught, result is unauthenticated
- For **proxy with throwing traps**: all known trapping operations are inside try/catch; exceptions fail closed
- For **revoked proxies as roles/permissions arrays**: `Array.isArray` is the first operation called, now inside try/catch; revoked proxies return empty frozen array
- For **proxy whose `instanceof` check throws**: `toSafeObject` returns `null` (fail closed)

Array element reads use the same descriptor-safe approach: each index is inspected via `getOwnPropertyDescriptor` before reading its value. Accessor-backed array indices are skipped.

---

## Administrator Rule

The canonical administrator rule is:

> `isAdmin === true` **OR** `role === 'admin'/'superadmin'` **OR** `roles` contains `'admin'`/`'superadmin'`

This is the default `'legacy'` admin determination rule in the compatibility adapter.

The `adminAccessDeclaration` policy encodes this as a Stage 2 declaration:

```typescript
defineAccessDeclaration({
  kind: 'anyOf',
  policies: [
    { kind: 'role-any', roles: ['admin', 'superadmin'] },
    { kind: 'permission-any', permissions: [permissionId('admin.access')] },
  ],
});
```

Note: the `isAdmin` field is **not** used by Stage 2 policy declarations. The canonical subject's `isAdmin` field is derived from the legacy adapter for backward compatibility diagnostics but does not drive policy decisions. Policy decisions are driven exclusively by `roles` and `permissions`.

---

## Compatibility Behavior

The compatibility adapter (`canonicalSubjectFromSession`, `canonicalSubjectFromToken`, `adaptLegacyToCanonical`) maps DevHolm session/token data to canonical form.

Admin determination rules:

- `'legacy'` (default): `isAdmin` field OR role `'admin'`/`'superadmin'` OR roles array contains those
- `'canonical'`: only explicit `isAdmin === true`
- `'union'`: either legacy OR canonical rule

The `'legacy'` rule preserves the pre-migration `hasAdminAccess()` behavior exactly.

---

## Route Wrapper

`evaluateApiAuthorization(session, declaration, owner, registry, options?)`:

- Extracts canonical subject via compatibility adapter (accessor-safe)
- Converts to `NormalizedPolicySubject` with branded `PermissionId` values
- Evaluates against Stage 2 `PolicyRegistry`
- Maps result to HTTP status via transport table

Transport table:

| Stage 2 result                             | HTTP status | Transport result |
| ------------------------------------------ | ----------- | ---------------- |
| `allow`                                    | 200         | ALLOW            |
| `forbidden` (authenticated)                | 403         | FORBIDDEN        |
| `forbidden` (unauthenticated)              | 401         | UNAUTHENTICATED  |
| `unauthenticated`                          | 401         | UNAUTHENTICATED  |
| `not-found`                                | 404         | CONCEALED        |
| `policy-error` `missing-runtime-reference` | 503         | POLICY_ERROR     |
| `policy-error` (all other codes)           | 500         | POLICY_ERROR     |

**Invariant:** `policy-error` NEVER maps to 403, 404, or 200.

---

## Server-Action Wrapper and Real Authentication Pattern

**Next.js Server Actions must not accept a `NextRequest` from the caller.** The caller cannot supply a request object — authentication context must be obtained inside the action.

### Correct pattern

```typescript
'use server';

import { auth } from '@/auth';
import {
  authorizeSessionAction,
  adminAccessDeclaration,
  adminAccessOwner,
} from '@/lib/sdk-authorization';

export async function dismissOnboardingAction(formData: FormData) {
  // Step 1: Obtain session internally — no caller-supplied auth context
  const session = await auth();

  // Step 2: Evaluate authorization via Stage 3 SDK
  const authorization = await authorizeSessionAction(
    session,
    adminAccessDeclaration,
    adminAccessOwner
  );

  // Step 3: Reject non-allowed results (fail closed)
  if (!authorization.allowed) {
    return {
      success: false,
      result: authorization.result,
      error: authorization.errorMessage ?? 'Not authorized',
    };
  }

  // Step 4: Execute action body — only reached when allowed
  return { success: true, result: authorization.result };
}
```

### Application helpers

- `authorizeSessionAction(session, declaration, owner, options?)` — correct helper for Server Actions; takes a session from `auth()`, no NextRequest
- `authorizeServerAction(request, declaration, owner, options?)` — for API route handlers only (accepts NextRequest); not for Server Actions
- `evaluateServerActionAuthorization(session, declaration, owner, registry, options?)` — SDK-level primitive; called by `authorizeSessionAction`

**Security invariants:**

- `policy-error` result → `allowed: false` always (never downgraded)
- `errorMessage` is sanitized — no raw exception messages, stack traces, or internal details
- No client-supplied role, permission, or visibility value can influence the result

---

## Migrated Production Surfaces

Two real production API routes were migrated from legacy auth helpers to Stage 3:

### Surface 1: `/api/admin/dashboard` (GET, PATCH)

- **Pre-migration:** `verifyAdmin(request)` → `hasAdminAccess(token)`
- **Stage 3:** `authorizeRequest(request, adminAccessDeclaration, 'site')`
- **Allowed:** admin role, superadmin role, admin.access permission
- **Denied:** ordinary members, anonymous

### Surface 2: `/api/admin/auth/users` (GET, PATCH)

- **Pre-migration:** `verifyPermission(request, 'users.manage')` → `hasPermission || hasAdminAccess`
- **Stage 3:** `authorizeRequest(request, usersManageDeclaration, 'site')`
- **Declaration:** `anyOf[permission-any[users.manage], adminAccessDeclaration]`
- **Allowed:** users.manage permission, admin.access permission, admin role, superadmin role
- **Denied:** ordinary members, anonymous

---

## E2E Access Matrix

Authoritative file: `e2e/stage3-complete-matrix.spec.ts`.

Session tokens are created with `next-auth/jwt` `encode()`/`decode()` directly from
five deterministic `E2E_FIXTURE_IDS` constants. No credential login, no synthetic
bootstrap users, and no `site_users` seed are required.

### Five identities

| Identity                 | Role       | Permissions  | `isAdmin` |
| ------------------------ | ---------- | ------------ | --------- |
| admin                    | admin      | —            | true      |
| superadmin               | superadmin | —            | true      |
| admin.access-only member | member     | admin.access | true      |
| users.manage-only member | member     | users.manage | false     |
| ordinary member          | member     | —            | false     |

### Twelve logical HTTP authorization cases

| Identity          | Dashboard | Users management |
| ----------------- | --------- | ---------------- |
| Anonymous         | 401 ✅    | 401 ✅           |
| admin             | 200 ✅    | 200 ✅           |
| superadmin        | 200 ✅    | 200 ✅           |
| admin.access-only | 200 ✅    | 200 ✅           |
| users.manage-only | 403 ✅    | 200 ✅           |
| ordinary member   | 403 ✅    | 403 ✅           |

### Five token encode/decode verification cases

One round-trip `encode()`/`decode()` test per identity confirming id, email, role, roles,
and `isAdmin` survive the JWE token. Permission-bearing identities (admin.access-only,
users.manage-only, and member) also assert their permissions array.

### Execution counts (final CI run `28768268806`)

| Project       | Tests   |
| ------------- | ------- |
| Chromium      | 52      |
| Firefox       | 52      |
| WebKit        | 52      |
| Mobile Chrome | 52      |
| **Total**     | **208** |

- Token-fixture executions (5 logical × 4 projects): **20**
- HTTP-matrix executions (12 logical × 4 projects): **48**
- Stage 3 total (17 logical × 4 projects): **68**

Final run: 208 total, 208 expected, 0 unexpected, 0 flaky, 0 skipped Stage 3 tests.

---

## Diagnostics

Diagnostics are opt-in (`{ diagnosticsEnabled: true }`). They expose:

- `policyEvaluationDetails`: the error code for `policy-error` results
- `migrationType`: `'canonical'` or `'legacy-compat'`

Diagnostics never contain raw exceptions, stack traces, or secrets. **Do not enable in production.**

---

## Migration and Rollback Strategy

To rollback a migrated route to the legacy authorization path:

1. Remove the `authorizeRequest` call
2. Restore the original `verifyAdmin` / `verifyPermission` call
3. No schema changes are required (Stage 3 is additive)

Feature-flag approach for gradual migration:

```typescript
if (process.env.SDK_STAGE3_ENABLED === 'true') {
  const authResult = await authorizeRequest(request, adminAccessDeclaration, adminAccessOwner);
  if (authResult.result !== AuthorizationTransportResult.ALLOW) {
    return NextResponse.json({ error: authResult.errorMessage }, { status: authResult.httpStatus });
  }
} else {
  const token = await verifyAdmin(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

---

## Deferred Work

The following SDK authorization capabilities are explicitly **not implemented** in Stage 3.
Issue numbers are references to the `chrishacia/devholm` issue tracker; verify current
issue state before starting work, as issue purpose may evolve.

- Stage 4: Middleware integration — not implemented
- Stage 5: React visibility hooks — not implemented
- Stage 6: Acceptance proof — not implemented
- Capability service implementation — not implemented
- Plugin publication — not implemented

**Status:** Corrected via `fix/sdk-stage3-proxy-action-hardening` (follow-up to PR #41)
**Related:** ADR-0002, Stage 2 (#31), issue #39, parent #6

---
