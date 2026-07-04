# ADR-0002: SDK boundary entrypoints and declarative authorization policy

- Status: accepted
- Date: 2026-07-03
- Related issues: #6, #12
- Related PRs: #26, docs/sdk-implementation-staging ratification PR

## Context

DevHolm currently blends normal Next.js development patterns with framework-specific extension and plugin contracts. Internal orchestration modules and runtime-specific behavior are not yet separated into stable public SDK boundaries.

Issue #6 requires upgrade-safe public contracts, explicit authorization defaults, deterministic policy behavior, and runtime-safe boundary enforcement across pages, APIs, actions, admin pages, public routes, navigation, slots, and UI actions.

Repository evidence used in ratification:

- single-package workspace (`pnpm-workspace.yaml` includes only `.`)
- deep framework aliases (`@core/*`, `@user/*`) in `tsconfig.json`
- middleware currently imports server dispatcher modules (`middleware.ts`)
- helper/middleware admin interpretation mismatch risk (`src/core/lib/auth-helpers.ts` vs `middleware.ts`)
- plugin lifecycle/settings ledgers already in place (`src/core/db/plugin-lifecycle.ts`, `src/core/db/plugins.ts`, `src/core/db/settings.ts`)
- public-route dispatcher already split into DI core and wrappers (`src/core/lib/public-route-dispatcher-core.server.ts`)

## Decision

### 1) Runtime-separated public boundary model

Adopt explicit subpath boundaries in a single package:

1. `@devholm/sdk` for runtime-neutral serializable contracts only
2. `@devholm/sdk/server` for Node/RSC/route/action server-only capabilities
3. `@devholm/sdk/middleware` for middleware-safe authorization and public-route primitives
4. `@devholm/sdk/react` for React registration/visibility helpers
5. `@devholm/sdk/testing` for fixture and contract-test utilities

`@devholm/sdk/middleware` is a dedicated enforceable boundary; middleware/edge code cannot import `@devholm/sdk/server`.

### 2) Canonical administrator semantics

Adopt a canonical permission-first representation:

- Canonical admin capability: `framework:admin.access` (logical capability represented by `admin.access` during migration)
- Canonical authorization checks consume normalized capability sets, not ad hoc role string checks

Normalization during migration:

- `token.isAdmin === true` maps to canonical admin capability
- legacy role values (`admin`, `superadmin`) map to canonical admin capability
- explicit `admin.access` permission maps directly to canonical admin capability
- future namespaced permissions continue through the same normalized capability set

Legacy status:

- direct role and `isAdmin` interpretation remains compatibility input only
- canonical capability evaluation becomes the authoritative check surface

### 3) Exact composition and aggregation semantics

Adopt deterministic semantic aggregation across `allow`, `unauthenticated`, `forbidden`, `not-found`, and `policy-error`:

- empty `allOf` and `anyOf` are invalid registrations
- evaluator/resolver contracts are side-effect-free
- order independence is required
- `policy-error` has global fail-closed precedence

`anyOf` normative behavior:

1. evaluate all branches because `policy-error` has global precedence
2. any `policy-error` -> `policy-error`
3. else any `allow` -> `allow`
4. else deny aggregation precedence: `forbidden`, then `not-found`, then `unauthenticated`

Semantic aggregation completes before surface concealment/status mapping.

### 4) Concealment defaults by surface

Adopt explicit defaults rather than global concealment:

- Page unauthenticated: redirect-to-login by default (401 optional per surface config)
- API/action unauthenticated: 401
- Authenticated forbidden: 403 by default
- Ownership/resource privacy: `not-found` (`404`) where existence privacy is required by policy intent
- Admin surfaces: 403 by default; concealment only for explicitly privacy-sensitive resources
- Public plugin routes: claimed-route deny/error must not fall through to lower-precedence routes

Concealment is policy/surface-specific, not a universal default.

### 5) Compatibility-adapter window and release rules

Adopt a bounded compatibility policy:

- warnings begin immediately when legacy adapter path is used
- warnings surface in development and build; production logs emit non-sensitive operational diagnostics
- release gating: after one minor release cycle, new usages of legacy registration patterns fail CI/build checks
- minimum migration window: two minor versions after first warning release
- removal rule: remove legacy adapter in next major after migration window completes
- major-version relationship: adapter removal is a major-version breaking change

### 6) Plugin data capability shape (minimum contract)

Adopt minimum capability-scoped service contract for staged rollout:

- no raw framework DB handle in plugin evaluator context
- plugin evaluators can access:
  - plugin-owned settings namespace (`plugin:<id>:*`)
  - plugin-owned data operations only
  - explicitly brokered framework capabilities
- cross-plugin and arbitrary framework data access is prohibited
- runtime service construction enforces these boundaries (not TypeScript-only)

Detailed query ergonomics remain implementation-level and may be refined later without changing these ownership constraints.

## Consequences

### Positive

- Architecture-level blockers for staged implementation are resolved
- Runtime boundary enforcement can be validated independently before behavior migration
- Canonical admin semantics reduce long-term drift between middleware and server helpers
- Compatibility window is explicitly time-bounded and versioned

### Costs and migration impact

- Additional export-map, fixture, and boundary test maintenance
- Temporary dual-path complexity while compatibility adapter remains
- Per-surface migration sequencing required to avoid regressions

## Alternatives considered

### Keep mixed server barrel with runtime-constrained subset guidance

Rejected because guidance does not enforce runtime import safety.

### Keep role/isAdmin checks indefinitely alongside permissions

Rejected because long-term parallel semantics drift and increase security inconsistency risk.

### Use concealment (`404`) as universal forbidden default

Rejected because many surfaces need explicit authorization feedback (`401`/`403`) and only some require existence privacy.

## Implementation details intentionally deferred

These are not unresolved architecture decisions:

- exact folder/module layout for each stage implementation PR
- specific lint-rule implementation mechanics
- final runtime fixture toolchain wiring details
- final SDK documentation IA text and examples

## Follow-up

- Stage plan: `docs/roadmap/sdk-authorization-implementation-plan.md`
- First implementation PR should be Stage 1 only (public boundaries + neutral contracts + fixture enforcement)
- Preserve issue boundaries: #11, #7, #8, #9, #10 remain separate workstreams
