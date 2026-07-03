# SDK and Authorization Architecture Proposal (Issue #6)

Status: Proposed (design only)
Date: 2026-07-03
Related issue: #6
Related inventory: `docs/roadmap/sdk-authorization-contract-inventory.md`

## Intent

Define SDK module boundaries and a shared declarative access-policy model without broad implementation.

This proposal preserves the rule:

- Client-side access determines whether something should be shown.
- Server-side access determines whether an operation is allowed.
- Hiding UI is never sufficient authorization.

## Candidate SDK Entrypoints

Names are tentative and require review.

### `@devholm/sdk`

Purpose: shared type contracts and registration helpers that are safe in both server and client compile contexts.

Candidate contents:

- Framework-safe shared types (`DevHolmConfig`, extension metadata types, policy type definitions)
- Pure registration helper definitions:
  - `definePage`
  - `defineApiRoute`
  - `defineAdminPage`
  - `definePublicRoute`
  - `defineNavigationItem`
  - `defineEmbed`
- Compile-time-only helper types for route params and action contracts

Must not include:

- Direct DB handles
- Server-only auth/session retrieval functions
- Node-only APIs

### `@devholm/sdk/server`

Purpose: authoritative server contracts and enforcement primitives.

Candidate contents:

- Policy evaluation engine
- Session/auth context resolution
- Role/permission/ownership checks
- Server registration adapters for pages, APIs, server actions, public routes
- Narrow DB and settings read/write contracts (not raw internal modules)
- Safe wrappers around extension helper context

### `@devholm/sdk/client`

Purpose: client visibility and UX hints only.

Candidate contents:

- Visibility evaluators derived from policy shape + client-safe identity snapshot
- Navigation and component gating helpers
- UI action enable/disable helpers

Must explicitly document:

- Client checks are advisory for display only.
- All privileged operations require server re-evaluation.

### `@devholm/sdk/testing`

Purpose: downstream contract tests and upgrade-safety tests.

Candidate contents:

- Policy fixture builders
- Route/action authorization assertion helpers
- Contract guard tests that fail when downstream code imports internal `src/core/**`
- Compatibility tests for sample downstream features required by issue #6

## Server/Client Boundary Rules

1. `@devholm/sdk/client` cannot import from `@devholm/sdk/server`.
2. `@devholm/sdk` shared entrypoint must remain runtime-neutral.
3. Only `@devholm/sdk/server` may resolve sessions, roles, permissions, ownership, and final allow/deny decisions.
4. Registration helper definitions must avoid hidden side effects.

## Declarative Access-Policy Model

## Policy Shapes

```ts
export type AccessPolicy =
  | { kind: 'everyone' }
  | { kind: 'anonymous-only' }
  | { kind: 'authenticated' }
  | { kind: 'role'; anyOf: string[] }
  | { kind: 'permission'; anyOf: string[] }
  | {
      kind: 'ownership';
      resource: string;
      ownerField?: string;
      ownerIdFromSession?: 'id' | 'email';
      resolveResource: (ctx: AuthorizationContext) => Promise<Record<string, unknown> | null>;
    }
  | {
      kind: 'custom';
      evaluate: (ctx: AuthorizationContext) => Promise<boolean>;
      reason?: string;
    }
  | { kind: 'allOf'; policies: AccessPolicy[] }
  | { kind: 'anyOf'; policies: AccessPolicy[] };
```

Notes:

- AND composition: `allOf`
- OR composition: `anyOf`
- `custom` remains available for exceptional cases

## Authorization Context

```ts
export interface AuthorizationContext {
  request: Request;
  session: AuthSession | null;
  subject: {
    id?: string;
    email?: string;
    role?: string;
    roles: string[];
    permissions: string[];
    isAdmin: boolean;
  };
  params?: Record<string, string | string[]>;
  resource?: Record<string, unknown> | null;
  getDb?: () => unknown;
  getSettings?: (keys: string[]) => Promise<Record<string, unknown>>;
}
```

## Evaluation Outcomes

```ts
export type AuthorizationDecision =
  | { allow: true }
  | {
      allow: false;
      reason:
        | 'unauthenticated'
        | 'forbidden'
        | 'not-found'
        | 'policy-error';
      redirectTo?: string;
      status?: 401 | 403 | 404;
    };
```

## Error and Failure Behavior

- Unauthenticated and authentication-required:
  - Default API/action response: 401
  - Page behavior: redirect to login if configured
- Authenticated but not authorized:
  - Default API/action response: 403
- Route privacy required (existence should be hidden):
  - Return 404 via policy option
- Policy callback failure:
  - Fail closed
  - Return policy-error mapped to 403 or 500 based on adapter policy

## Redirect, Forbidden, Not-Found Options

Each surface adapter should allow outcome configuration:

- `onUnauthenticated`: `redirect-login` or `401`
- `onForbidden`: `403` or `404`
- `onPolicyError`: fail closed with logged diagnostic

## Consistent Policy Application Targets

The same policy shapes should apply to:

- Pages (App Router page handlers)
- API route handlers
- Server actions
- Navigation items
- Admin pages
- Public routes
- Slot components
- UI actions

Implementation note:

- Client uses policy for visibility hints only.
- Server adapters must always re-evaluate the same policy before execution.

## Proposed Adapter Layer

1. Page adapter: wraps page access and handles redirect/not-found behavior.
2. API adapter: wraps route handlers and enforces 401/403/404 outcomes.
3. Action adapter: wraps server actions with policy checks.
4. Navigation adapter: evaluates visibility model client-side and server-side context where available.
5. Public route adapter: evaluates plugin enabled state plus declared policy.

## Incremental Implementation Sequence (Minimize Blast Radius)

### Stage 1: Types and primitives only

- Introduce shared policy types and decision evaluator contracts
- Introduce boundary-safe entrypoint contracts (`sdk`, `sdk/server`, `sdk/client`, `sdk/testing`)
- No broad route migrations

### Stage 2: Server enforcement adapters

- Add API and page wrappers that consume policy definitions
- Preserve existing route logic initially by wrapping only selected surfaces
- Keep existing `verifyAdmin` route checks until migrated

### Stage 3: Registration helpers

- Add `define*` helpers for pages, APIs, admin pages, public routes, navigation
- Maintain compatibility with existing registries during migration

### Stage 4: Client visibility helpers

- Add advisory visibility helpers for nav/components/actions
- Ensure every client helper references matching server policy contract

### Stage 5: Downstream examples and contract tests

- Implement issue #6 acceptance-proof sample feature
- Add import boundary tests to prevent `src/core/**` coupling
- Add upgrade-compatibility checks for SDK entrypoints

## Explicitly Deferred from This Pass

- Issue #11 event/background/scheduled work
- Issue #7 packaging/version lock and update workflows
- Issue #8 URL shortener feature completion
- Calendar/Gallery conversion implementation
- Broad SDK runtime rewrite

## Open Questions for Review

1. Should API extension policies be required or default-open with warnings?
2. Should ownership policy require standardized resource resolvers?
3. Which surfaces should default to 404 instead of 403 for privacy?
4. How strict should import-boundary tests be during migration?
5. Should any legacy `@core/lib/*` imports remain temporarily allowed behind deprecation flags?
