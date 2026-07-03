# SDK and Authorization Architecture Proposal (Issue #6)

Status: Proposed (design only)
Date: 2026-07-03
Related issue: #6
Related inventory: `docs/roadmap/sdk-authorization-contract-inventory.md`
Related ADR: `docs/roadmap/decisions/0002-sdk-boundaries-and-access-policy.md`

## Intent

Define upgrade-safe SDK boundaries and authorization behavior that are explicit, fail-closed, and compatible with Next.js runtime boundaries.

Design rule:

- Client-side access determines what should be shown.
- Server-side access determines what is allowed.
- Hiding UI is never sufficient authorization.

## Entrypoint Ownership Model

Tentative names remain proposed.

### `@devholm/sdk` (runtime-neutral root)

Allowed:

- Serializable access declarations
- Permission, route, surface, plugin, resolver, and evaluator identifier types
- Data-only registration metadata
- Runtime-neutral builders that do not accept executable callbacks
- Type-only contracts that cannot pull server or React runtime code into consumers

Not allowed:

- Request/session objects
- Database/config service handles
- Server callbacks or ownership/resource resolver functions
- Node-only APIs
- React runtime hooks/components

### `@devholm/sdk/server`

Owns executable server registration helpers and authoritative enforcement:

- `defineApiRoute`
- `definePublicRoute`
- `defineServerAction`
- `defineAdminPage` (server loader + server auth wrapper)
- authenticated page wrappers/guards for registry-backed pages
- server authorization wrappers and policy evaluators
- ownership/resource resolvers

Only server entrypoint may accept/retain executable server callbacks.

### `@devholm/sdk/react` (or `@devholm/sdk/client` + `@devholm/sdk/react` refinement)

Owns React/client registration and visibility helpers:

- navigation registration helpers
- slot/component registration helpers
- UI action registration helpers (client visibility + intent metadata)
- client visibility projections

These helpers must not perform authoritative authorization.

### `@devholm/sdk/testing`

Owns contract/fixture helpers:

- import-boundary fixtures
- policy composition fixtures
- cross-version compatibility fixtures
- runtime-target import safety fixtures

### Normal Next.js code remains valid

Normal physical App Router pages, route handlers, and service modules remain valid downstream code.

They may call SDK server authorization helpers but are not forced into registry-backed `define*` helpers.

## Registration Ownership and Namespacing

Every named registration has an explicit owner model:

- `framework` owner
- `site` owner
- `plugin:<pluginId>` owner

This applies to:

- permissions
- custom evaluators
- ownership resolvers
- API/public routes
- admin pages
- navigation items
- slots
- settings
- other named extension registrations

Identifier shape (example):

- `framework:permission:admin.access`
- `site:route:marketing-preview`
- `plugin:url-shortener:resolver:link-owner`
- `plugin:url-shortener:route:redirect`

Validation requirements:

- duplicate/collision detection
- unknown-reference rejection
- owner/plugin mismatch rejection
- plugin installed/enabled validation for plugin-owned registrations
- deterministic registration order where order matters

Validation timing:

- fail during generation/build/startup whenever possible
- runtime lookup failure still fails closed with non-sensitive diagnostics

## Capability-Scoped Service Construction

Do not expose broad service handles in generic policy context.

Disallowed in generic evaluator context:

- raw framework DB handle
- arbitrary site settings access
- framework-internal settings access
- cross-plugin settings/data access

Use capability-scoped service construction with runtime enforcement:

- `FrameworkAuthorizationServices` (framework internals)
- `SiteAuthorizationServices` (trusted site-owned server code)
- `PluginAuthorizationServices<PluginId>` (plugin-bound services)

Plugin evaluator capability rules:

- may access only its own namespaced settings
- may access only declared plugin-owned data/schema operations
- may use explicitly brokered framework capabilities
- may not access another plugin's settings/data

Important:

- TypeScript typing alone is not a security sandbox.
- Runtime service construction must enforce the same boundaries.

## Policy Declaration and Execution Split

### Serializable/data-only declarations (neutral)

```ts
export type AccessDeclaration =
  | { kind: 'everyone' }
  | { kind: 'anonymous-only' }
  | { kind: 'authenticated' }
  | { kind: 'role-any'; roles: string[] }
  | { kind: 'permission-any'; permissions: string[] }
  | { kind: 'ownership'; resolverId: string }
  | { kind: 'custom'; evaluatorId: string }
  | { kind: 'allOf'; policies: AccessDeclaration[] }
  | { kind: 'anyOf'; policies: AccessDeclaration[] };
```

### Server-only evaluators and resolvers

- Evaluators/resolvers are registered in server-only registries.
- Resolver/evaluator references are validated against owner namespace.
- Missing evaluator/resolver reference fails validation and fails closed at runtime if encountered.

## Explicit Policy Defaults

For newly registered executable server surfaces:

- access declaration is required
- omitted policy is invalid
- `everyone` must be declared explicitly for public behavior

Legacy registrations may use a temporary compatibility adapter only if:

- explicitly marked legacy
- emits development/build warning
- has documented migration path
- is not default for new registrations

## Composition Semantics (Coherent Model)

Evaluator and resolver functions must be side-effect-free.

Validation rules:

- empty `allOf` is invalid registration
- empty `anyOf` is invalid registration
- invalid composition fails generation/build/startup validation
- runtime encounter of invalid policy fails closed

Deterministic aggregation model:

- Use order-independent evaluation semantics for `allOf` and `anyOf`.
- Evaluate all required branches to gather deterministic aggregate result.
- No contradictory short-circuit + global-precedence hybrid behavior.

Result classes:

- `allow`
- `unauthenticated`
- `forbidden`
- `not-found`
- `policy-error`

Aggregation requirements:

- Equivalent reordered policies produce equivalent outcomes.
- Nested `allOf`/`anyOf` compositions must be deterministic.
- `policy-error` handling is deterministic and fail-closed.

Required test coverage:

- reordered equivalent policies
- nested `allOf` and `anyOf`
- evaluator error combined with allow
- evaluator error combined with deny
- empty composition rejection
- unknown evaluator/resolver references

## Policy-Error Semantics and Transport

Default behavior:

- evaluator/resolver defect or unexpected exception yields `policy-error`
- HTTP/API transport default: 500
- explicit dependency-unavailable classification: 503
- never map operational policy failure to ordinary 403
- never expose stack traces/internal identifiers/SQL details/secrets
- include internal correlation/diagnostic identifier where appropriate

Surface requirements:

- public-route policy failure must not fall through to CMS/lower-precedence app route
- server actions return/throw stable sanitized error shape
- adapters may customize presentation but may not convert policy-error into success or fallthrough

## Per-Surface Behavior

### App Router pages

- explicit policy required for new executable registrations
- configurable unauthenticated behavior: login redirect or 401
- configurable forbidden behavior: 403 or 404 concealment

### API routes

- explicit policy required for new executable registrations
- unauthenticated default: 401
- forbidden default: 403
- policy-error default: 500/503

### Server actions

- explicit policy required
- mutation authorization should be evaluated in same authoritative operation/transaction where practical
- policy-error returns stable sanitized error shape

### Admin pages

- explicit policy required for new registrations
- must honor plugin installed/enabled state for plugin-owned pages

### Public plugin routes

Processing order:

1. Determine request eligibility.
2. Filter uninstalled/disabled plugins.
3. Perform side-effect-free route matching and conflict detection.
4. Treat winning route as claimed.
5. Perform authoritative authorization.
6. Execute handler only when authorized.

Denial or policy-error for claimed route returns that route's denial/error response and does not fall through.

Path matching and authorization should stay separate concerns; identity should not alter route ownership.

### Navigation items

- client visibility projection only
- linked server operation still requires authoritative server authorization
- plugin-owned entries must honor plugin installed/enabled state

### Slot components

- visibility can be projected client-side
- privileged operations initiated from slots require server authorization
- plugin-owned slots must honor plugin installed/enabled state

### UI actions

- client gating is advisory
- execution authority is server-side only

## Next.js Runtime-Target Matrix

| Entrypoint/Adapter                       | Browser Client | React Server Component | Node Route/Action | Middleware/Proxy Runtime          | Edge Runtime             | Allowed Imports                                                       | Prohibited Imports                                                   | Node APIs              | DB Access      | Request/Session Context     | Executable Callbacks  |
| ---------------------------------------- | -------------- | ---------------------- | ----------------- | --------------------------------- | ------------------------ | --------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------- | -------------- | --------------------------- | --------------------- |
| `@devholm/sdk`                           | Yes            | Yes                    | Yes               | Yes                               | Yes                      | serializable declarations, ids, data-only metadata, type-only helpers | server evaluators, React runtime hooks/components, Node-only modules | No                     | No             | No                          | No                    |
| `@devholm/sdk/server`                    | No             | RSC server-only usage  | Yes               | Subset only (runtime-constrained) | Runtime-dependent subset | server evaluators/resolvers, policy wrappers, scoped services         | client React hooks/components, browser-only APIs                     | Yes (Node target only) | Scoped only    | Yes                         | Yes                   |
| `@devholm/sdk/react` / client entrypoint | Yes            | client components only | No                | No                                | Yes (if browser-safe)    | visibility helpers, registration metadata for UI surfaces             | Node-only modules, server evaluators/resolvers, DB handles           | No                     | No             | limited client context only | client callbacks only |
| `@devholm/sdk/testing`                   | Test runtime   | Test runtime           | Test runtime      | Test runtime                      | Test runtime             | fixtures, assertions, boundary tests                                  | production-only internals without adapters                           | Test-dependent         | Test-dependent | Test-dependent              | Yes (test only)       |

Runtime constraints:

- Not every server entrypoint function is valid in middleware/edge environments.
- Public-route dispatch currently runs through `middleware.ts`, so middleware runtime constraints are part of design.
- Build/fixture tests must detect Node-only imports in client or incompatible middleware/edge bundles.

## Permission and Compatibility Behavior

- permission naming is namespaced
- collisions are rejected
- unknown permissions fail closed
- administrator compatibility behavior is explicitly migrated (including current middleware/helper mismatch)

Open decision retained:

- whether administrators automatically satisfy all permissions or only explicit admin-scoped permissions

## SDK Stability and Versioning Policy (Issue #6 scope)

Initial policy:

- public SDK contracts follow DevHolm SemVer initially
- breaking public-contract changes require major DevHolm version
- supported boundaries are package exports/subpaths only
- deep implementation imports are unsupported
- deprecated contracts remain functional for documented migration window
- deprecations emit development/build diagnostics before removal

Compatibility expectations:

- export maps enforce public boundary
- lint/TS/module boundary checks enforce import restrictions
- fixture/contract tests verify compatibility across framework upgrades
- public-vs-internal contract docs are maintained with release changes

Out of scope reminder:

- plugin package resolution/pins/channels/marketplace distribution stays under issue #7

## Implementation Sequence (Low Blast Radius)

1. Finalize neutral declaration contracts and server-only evaluator ownership.
2. Implement validation pipeline for namespacing/reference/ownership rules.
3. Add explicit-policy requirement for new registrations and legacy adapter warnings.
4. Add per-surface adapters with deterministic composition + policy-error transport.
5. Add runtime-target/import-boundary enforcement tests.
6. Add issue #6 acceptance-proof example without framework-owned source edits.

## Explicitly Deferred in This Pass

- issue #11 events/background/scheduled tasks
- issue #7 package/version implementation
- issue #8 URL Shortener MVP implementation
- issue #9/#10 Calendar/Gallery conversion work
- broad SDK/runtime implementation

## Remaining Unresolved Decisions

1. canonical administrator semantics after compatibility window
2. default concealment (`403` vs `404`) per capability class/surface
3. compatibility adapter duration and removal milestones
4. final plugin data API shape beyond defined capability-isolation boundaries
