# SDK Stage 3: Server-Side Authorization Enforcement

**Status:** Corrected via `fix/sdk-stage3-closeout` (follow-up to PR #40)
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

## Accessor-Safe Field Reading

All field reads from untrusted source objects use `Object.getOwnPropertyDescriptor` rather than optional-chaining property access.

**Why:** `object?.field` invokes the `[[Get]]` operation, which executes accessor getter traps on regular objects and the `get` proxy trap on proxies. For authorization code, executing untrusted getter code on an input object is a security risk.

**What the safe approach does:**

- Calls `Object.getOwnPropertyDescriptor(obj, key)` to retrieve the property descriptor
- If the descriptor has `get` or `set` (i.e., it's an accessor), returns `undefined` without invoking the getter
- If the descriptor has `value` (i.e., it's a data property), reads the value safely
- Wraps all descriptor reads in `try/catch` to handle revoked-proxy exceptions and throwing `getOwnPropertyDescriptor` traps

**Limitation:** Proxy objects' `[[GetOwnProperty]]` trap is still invoked by `getOwnPropertyDescriptor`. This cannot be avoided. The safety guarantee is:

- For **regular objects with accessor properties**: getters are **never invoked**
- For **proxy objects**: traps may execute, but exceptions are **caught and fail closed**

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

## Server-Action Wrapper

`evaluateServerActionAuthorization(session, declaration, owner, registry, options?)`:

- Same evaluation logic as the route wrapper
- Returns `ServerActionAuthorizationResult` with an explicit `allowed: boolean` flag
- No HTTP status codes — oriented for server-action return values
- Sanitized `errorMessage` when not allowed
- Fails closed on all errors

Application-level adapter: `authorizeServerAction(request, declaration, owner, options?)` in `src/core/lib/sdk-authorization.ts`.

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

The following are explicitly **not implemented** in Stage 3:

- Stage 4: Middleware integration (issue #7)
- Stage 5: React visibility hooks (issue #8)
- Stage 6: Acceptance proof (issue #9)
- Capability service implementation (issue #10)
- Plugin publication (issue #11)
