# SDK and Authorization Architecture Proposal (Issue #6)

Status: Proposed (design only)
Date: 2026-07-03
Related issue: #6
Related inventory: `docs/roadmap/sdk-authorization-contract-inventory.md`
Related ADR: `docs/roadmap/decisions/0002-sdk-boundaries-and-access-policy.md`

## Intent

Define SDK boundary contracts and authorization behavior that are explicit, fail-closed, and safe for Next.js server/client runtime separation.

This proposal preserves the rule:

- Client-side access determines what should be shown.
- Server-side access determines what is allowed.
- Hiding UI is never sufficient authorization.

## Boundary Model

## Runtime-neutral declarations (`@devholm/sdk`)

Runtime-neutral declarations must be serializable/data-only and safe to import in either server or client code.

Examples of allowed neutral contract content:

- Access declaration shapes (data-only)
- Registration metadata shapes (data-only)
- Route/surface identifiers
- Permission identifier strings and namespacing rules

Runtime-neutral declarations must not include:

- Request objects
- Database objects
- Server callbacks
- Ownership/resource resolver functions
- Node-only APIs

## Server-only contracts (`@devholm/sdk/server`)

Server-only contracts own authoritative decisions and service access.

Examples:

- Policy evaluators
- Ownership/resource resolvers
- Session and subject resolution
- Authoritative route/action wrappers
- Scoped service contracts for trusted site-owned code and plugin-owned operations

Server-only modules must be marked and enforced as server-only imports.

## Client-safe projections (`@devholm/sdk/client`)

Client contracts should only expose visibility projections and UX hints.

Rules:

- If a policy cannot be fully evaluated on the client, default to `hidden` or `unknown`, never `allowed`.
- Client visibility outcomes are advisory only.
- Server authorization is always required for execution.

## Testing contracts (`@devholm/sdk/testing`)

Provide fixtures and test helpers for:

- policy composition correctness
- per-surface authorization behavior
- import-boundary guardrails
- upgrade-contract compatibility checks

## Policy Shape Split

## Serializable access declarations (neutral)

```ts
export type AccessDeclaration =
  | { kind: 'everyone' }
  | { kind: 'anonymous-only' }
  | { kind: 'authenticated' }
  | { kind: 'role-any'; roles: string[] }
  | { kind: 'permission-any'; permissions: string[] }
  | { kind: 'ownership'; resolver: string }
  | { kind: 'custom'; evaluator: string }
  | { kind: 'allOf'; policies: AccessDeclaration[] }
  | { kind: 'anyOf'; policies: AccessDeclaration[] };
```

Notes:

- `resolver` and `evaluator` are identifiers, not callbacks, in neutral declarations.
- New executable server registrations must declare access explicitly.
- Omitted declaration is invalid for new registrations; it does not mean public.
- Public behavior must be declared explicitly with `{ kind: 'everyone' }`.

## Server evaluator registrations (server-only)

```ts
export interface OwnershipResolver {
  name: string;
  resolve(input: {
    subjectId: string;
    params: Record<string, string | string[]>;
    services: AuthorizationServices;
  }): Promise<'allow' | 'deny' | 'not-found'>;
}

export interface CustomPolicyEvaluator {
  name: string;
  evaluate(input: {
    subjectId: string | null;
    params: Record<string, string | string[]>;
    services: AuthorizationServices;
  }): Promise<'allow' | 'deny' | 'not-found'>;
}
```

Callbacks and resource logic remain server-only and must not enter client bundles.

## Ownership Policy Requirements

1. Default ownership identity is stable authenticated subject/user ID.
2. Arbitrary `ownerField` reflection is not used as a baseline ownership mechanism.
3. Email is not a baseline ownership identity.
4. Ownership is evaluated using typed server resolver or predicate contracts.
5. Exceptional email/domain ownership logic must use explicit custom server policy.
6. For mutations, authorization must be evaluated in the same authoritative server operation/transaction where practical (avoid stale pre-checked decisions).

## Scoped Service Contracts (No Broad `getDb`)

Remove broad generic service access from authorization context.

Do not expose:

- `getDb?: () => unknown`
- unscoped global settings reads

Define scoped service boundaries:

- trusted site-owned server services (site-owned operations)
- plugin-owned schema/data operations (plugin namespace constrained)
- namespaced plugin settings operations
- framework-internal DB/config services (internal only)

Example server-side service shape:

```ts
export interface AuthorizationServices {
  site: {
    readSetting(key: string): Promise<unknown>;
  };
  plugin?: {
    pluginId: string;
    readSetting(key: string): Promise<unknown>;
    writeSetting(key: string, value: unknown): Promise<void>;
    runOwnedQuery<T>(query: PluginOwnedQuery<T>): Promise<T>;
  };
}
```

## Permission and Compatibility Model

### Naming and namespacing

- Permissions must be namespaced (for example `plugin:url-shortener:links.write`, `framework:admin.access`).
- Collision detection is required during registration/build.

### Unknown permissions

- Unknown permission identifiers fail closed (`forbidden`) and log a non-sensitive operational diagnostic.

### Administrator compatibility migration

Current inconsistency must be reconciled:

- middleware accepts `token.isAdmin === true`
- `hasAdminAccess()` currently does not

Migration requirement:

- define one canonical admin-resolution behavior
- provide compatibility adapter while migrating legacy checks
- log compatibility-path usage in development/build

### Administrator permission semantics

Open decision to confirm in review:

- whether admins automatically satisfy all permissions, or
- only satisfy explicit admin-namespaced permissions

Until resolved, use explicit compatibility mode with diagnostics.

## Deterministic Composition Semantics

### `allOf`

- Evaluate left-to-right with short-circuit on first decisive deny/not-found/error.
- Empty `allOf` evaluates to allow (identity element for conjunction).
- Error precedence: evaluator exception produces policy-error outcome (fail closed).

### `anyOf`

- Evaluate left-to-right with short-circuit on first allow.
- Empty `anyOf` evaluates to deny (no satisfiable branch).
- If all branches deny/not-found, final result is deny/not-found by precedence rules.
- Any evaluator exception contributes policy-error and results in deny execution.

### Denial/error precedence

Server evaluator precedence:

1. policy-error (internal failure, fail closed)
2. not-found (concealment configured)
3. forbidden
4. unauthenticated

Surface adapters may remap response status/redirect while preserving semantic reason.

## Outcome Definitions (Required Cases)

- Missing authentication:
  - page/admin page: redirect-to-login or 401 based on surface config
  - API/action/public route: 401 by default
- Authenticated but forbidden: 403 by default
- Concealed/not-found resources: 404 when configured
- Anonymous-only requested by authenticated user: deny (redirect or 403/404 per surface)
- Policy evaluator exceptions: deny execution, log non-sensitive diagnostic, return defined server error outcome
- Missing resource in ownership/custom resolver: not-found or forbidden according to resolver contract
- Disabled plugin: deterministic plugin-disabled outcome (typically 404 for plugin-owned route/surface)
- Unknown permission: forbidden (fail closed)
- Empty `allOf`: allow
- Empty `anyOf`: deny

## Legacy Compatibility Adapter

Legacy registrations may retain current behavior temporarily, but only through an explicitly marked legacy adapter.

Adapter requirements:

- clearly marked legacy
- emits development/build warning
- documents migration path
- not default for new registrations

## Per-Surface Defaults and Configuration

### App Router pages

- default for new executable registrations: explicit declaration required
- unauthenticated: redirect login by default (configurable)
- forbidden: 403 or 404 configurable
- dynamic rendering required when auth/session scoped data is needed

### API routes

- explicit declaration required for new registrations
- missing policy is invalid for new registrations
- default unauthenticated response: 401
- forbidden: 403 by default

### Server actions

- explicit declaration required
- evaluation in same operation/transaction for mutation actions where practical

### Admin pages

- explicit declaration required
- must honor plugin installed/enabled state when plugin-owned

### Public plugin routes

- explicit declaration required for new routes
- must honor plugin installed/enabled state
- denial behavior must not accidentally fall through to lower-precedence CMS/app routes unless explicitly designed and proven safe

### Navigation items

- client visibility projection only
- server-side operations linked from nav still require authoritative checks
- plugin-installed/enabled state must be reflected

### Slot components

- visibility projection may hide or show
- any privileged action invoked by slot must pass server authorization
- plugin-installed/enabled state must be reflected for plugin-owned slots

### UI actions

- client gating advisory only
- server endpoint/action authorization authoritative

## Next.js Runtime Requirements

- server-only module markers for server evaluators/services
- client-import prevention for server-only contracts
- clear RSC vs client-component boundaries
- per-request authorization context construction
- avoid cross-user authorization caching
- opt into dynamic rendering where auth/session requires request-time evaluation
- never send protected data to client merely to hide it in UI
- use safe relative login redirect handling and open-redirect prevention

## `definePage` Clarification

`definePage` (and similar helpers) are optional integration helpers for registry-backed extension pages.

They do not forbid normal physical Next.js pages and do not require all downstream pages to imitate framework internals.

## Import Boundary Enforcement Layers

Do not rely on a single test helper. Use layered enforcement:

1. Public export maps/stable barrels for SDK contracts
2. TypeScript/module boundary rules
3. ESLint restricted-import rules where practical
4. fixture compilation and contract tests
5. alias coverage (`@core/*`, absolute paths, deep relative internal imports)

## Incremental Implementation Sequence (Low Blast Radius)

1. Introduce neutral declarations + server-only evaluator registry contracts.
2. Introduce explicit policy requirement for new registrations and legacy adapter with warnings.
3. Add per-surface wrappers (pages/APIs/actions/admin/public routes) and plugin-state enforcement parity.
4. Add client visibility projection helpers with safe hidden/unknown defaults.
5. Add import-boundary enforcement layers and contract test fixtures.
6. Implement acceptance-proof downstream example without changing framework-owned files.

## Explicitly Deferred in This Pass

- issue #11 events/background/scheduled tasks
- issue #7 package/version implementation
- issue #8 URL Shortener MVP implementation
- issue #9/#10 Calendar/Gallery conversion work
- broad SDK/runtime implementation

## Unresolved Architecture Decisions

1. Final canonical administrator permission semantics (auto-satisfy all permissions vs explicit admin namespace).
2. Exact default concealment behavior (403 vs 404) by surface and capability class.
3. Legacy adapter duration and deprecation milestones.
4. Final scoped plugin data API shape beyond trust-boundary guarantees.
