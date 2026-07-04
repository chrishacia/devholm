# SDK and Authorization Implementation Plan (Issue #6)

Status: Proposed staged implementation plan
Date: 2026-07-03
Related issue: #6
Related ADR: `docs/roadmap/decisions/0002-sdk-boundaries-and-access-policy.md`

## Planning scope and guardrails

This document is implementation planning only.

Out of scope for this plan document and its ratification PR:

- Runtime SDK implementation
- Authorization adapter implementation
- Middleware rewrites
- React/client helper implementation
- CLI implementation changes
- Acceptance-example feature implementation

Issue boundaries preserved:

- #11 events/background/scheduled work is separate
- #7 package/version distribution model implementation is separate
- #8 URL Shortener functional MVP is separate
- #9 and #10 conversions are separate

## Repository-grounded constraints (inspected)

Current repository evidence indicates a single-package Next.js application (not a monorepo package split today):

- `package.json` has package name `devholm`, version `3.7.0`, and no SDK package exports today.
- `pnpm-workspace.yaml` lists only `.`.
- `tsconfig.json` path aliases expose deep framework internals (`@core/*`, `@user/*`, `@/*`).
- `next.config.ts` configures standalone output and Node server external packages (`knex`, `pg`, `bcryptjs`), indicating Node-only dependencies in current server paths.
- `middleware.ts` runs public-route dispatch before App Router and also performs admin auth checks, currently importing server dispatcher modules.
- `src/core/lib/auth-helpers.ts` defines helper-level admin access (`role`, `roles`, `admin.access`) while middleware also checks `token.isAdmin` directly.
- `src/auth.ts` already emits normalized token fields (`role`, `roles`, `permissions`, `isAdmin`) for migration bridging.
- Extension registries are currently direct imports from user registries (`src/core/lib/extensions.server.ts`, `src/user/extensions/*`).
- Plugin registry and lifecycle infrastructure already exist (`src/core/lib/plugin-registry.server.ts`, `src/core/lib/plugin-lifecycle.server.ts`, `src/core/db/plugin-lifecycle.ts`, `src/core/db/plugins.ts`, `src/core/db/settings.ts`).
- Public-route dispatcher architecture already has a DI-friendly core and response adapter (`src/core/lib/public-route-dispatcher-core.server.ts`, `src/core/lib/public-route-dispatcher.server.ts`, `src/core/lib/public-route-resolution-response.server.ts`).
- CLI scaffolding exists in `scripts/devholm-cli.ts` but is not SDK-contract aware yet.
- Test harness exists: unit/integration tests under `src/**`, Vitest setup in `src/test/setup.ts`, and Playwright E2E config.

Planning implication:

- Current state is single-package, but Stage 1 should introduce a dedicated SDK workspace package (`packages/sdk`) rather than pretending a second package identity can be created from root export-map aliases alone.
- Packaging/export hard boundaries should be introduced as real package boundaries plus fixture checks before any broad runtime replacement.

## Final entrypoint/package recommendation

Recommended package/workspace model:

- Root package remains `devholm` (framework/application package).
- Stage 1 introduces `packages/sdk` named `@devholm/sdk`.
- Root consumes SDK via workspace dependency (`@devholm/sdk`: `workspace:*`).

Supported public SDK imports:

- `@devholm/sdk` (runtime-neutral contracts only)
- `@devholm/sdk/server` (Node/RSC/route/action server-only APIs)
- `@devholm/sdk/middleware` (middleware-safe authorization + route-claim primitives)
- `@devholm/sdk/react` (React registration + visibility helpers)
- `@devholm/sdk/testing` (fixtures and contract-test helpers)

Design intent:

- `react` is not treated as a vague synonym for all client code; it is specifically React-facing helper surface.
- `middleware` is dedicated to edge-compatible code and must not transitively import Node-only dependencies.

Dependency-direction rules:

- Root application may depend on `@devholm/sdk`.
- `@devholm/sdk` must not depend on root application package.
- `@devholm/sdk` must not import arbitrary root `src/core/**`, `src/app/**`, or `src/user/**` modules.
- Neutral contracts remain standalone and data-only.
- Server/middleware/react helpers must be self-contained or use explicit DI/public adapter contracts.
- Circular package dependencies are prohibited.

Publication/version scope for issue #6:

- SDK starts as workspace-local package and supported contract.
- SDK remains lockstep-versioned with DevHolm during issue #6.
- Publication/pinning/update-channel policy remains issue #7.
- Stage 1 does not require npm publication.

## Staged implementation sequence

### Stage 1 - Public boundary and neutral contracts

Goal:

- Establish enforceable package/export boundaries and runtime-neutral contract types without replacing existing authorization behavior.

Expected file areas:

- `pnpm-workspace.yaml` workspace expansion for `packages/sdk`
- root `package.json` workspace dependency on `@devholm/sdk`
- `packages/sdk/package.json` with SDK export map
- `packages/sdk/src/index.ts`
- runtime-specific SDK entrypoints (or equivalent package-internal structure)
- package-boundary tests and import restrictions
- TS and lint boundary configuration preventing SDK imports from root internals
- compile-time runtime-target fixtures and fixture wiring under test folders

Explicit non-goals:

- No evaluator execution changes
- No middleware behavior changes
- No API/action/page wrapper migration

Dependencies:

- ADR-0002 accepted

Security invariants:

- Neutral contracts remain data-only
- Node-only modules prohibited from middleware export graph
- Deep internal imports remain unsupported for public SDK consumers

Required tests:

- package-resolution tests proving `@devholm/sdk` resolves as real package
- export resolution tests for `.`, `./server`, `./middleware`, `./react`, `./testing`
- tests proving unexported SDK internals cannot be imported
- tests proving SDK cannot import root internals
- root-integration tests proving root app can consume workspace SDK
- compile or bundle fixtures per runtime target (server, middleware, react/client, testing)
- deep-import restriction tests (including `@core/*` alias bypass attempts)
- middleware export graph tests preventing Node-only imports
- react export graph tests preventing server-only imports

Migration risk:

- Low to moderate (build and import-path break risk)

Rollback strategy:

- Revert workspace package introduction and root workspace dependency together with boundary/fixture enforcement changes

Acceptance gate:

- Runtime-target fixtures pass
- `@devholm/sdk` and all five exports resolve from real package
- SDK import direction rules are enforced
- No existing runtime authorization behavior changed
- Import restrictions provably enforce intended public boundaries

Issue #6 checklist impact:

- Enables boundary items, but does not mark behavior items complete yet

### Stage 2 - Policy engine and contract tests

Goal:

- Implement deterministic policy result model and registries with exhaustive contract tests, without route/UI integration.

Expected file areas:

- policy types/evaluation core modules under server and neutral contract areas
- validator modules for ownership/reference namespacing
- testing fixtures and unit suites for full aggregation matrix

Explicit non-goals:

- No API/page/action wrappers in production paths
- No middleware dispatch integration
- No React visibility helper integration

Dependencies:

- Stage 1 boundaries in place
- ADR-0002 accepted

Security invariants:

- Empty composition rejected
- Side-effect-free evaluator contract enforced
- Policy-error fail-closed semantics preserved

Required tests:

- exhaustive `allOf` and `anyOf` mixed-result cases
- policy-error precedence tests
- nested composition determinism and order independence
- validator tests for unknown refs, namespace mismatch, duplicate IDs

Migration risk:

- Low (isolated to new policy engine modules)

Rollback strategy:

- Revert policy core + tests; no production route behavior depends on it yet

Acceptance gate:

- Exhaustive policy matrix tests pass
- Validation failures are explicit and deterministic

Issue #6 checklist impact:

- Can satisfy policy-model and deterministic-composition capability once merged

### Stage 3 - Compatibility and server enforcement

Goal:

- Introduce canonical subject/admin normalization, legacy compatibility adapter, and server wrappers for API/actions while preserving behavior during migration.

Expected file areas:

- auth normalization modules (`src/auth.ts`, helper boundaries)
- server authorization context and wrappers
- migration diagnostics in wrapper/adapters
- selected API/server-action entrypoint adapters

Explicit non-goals:

- No middleware route claiming rewrite yet
- No React helper migration yet
- No broad surface migration in one PR

Dependencies:

- Stage 2 policy core available
- ADR-0002 accepted

Security invariants:

- Server remains authoritative
- Compatibility path is explicit and auditable
- Existing behavior preserved until per-surface cutover is deliberate

Required tests:

- token normalization unit tests (`isAdmin`, roles, permissions)
- compatibility adapter behavior parity tests
- wrapper outcomes for unauthenticated/forbidden/not-found/policy-error

Migration risk:

- Moderate (auth regressions if normalization mismatch)

Rollback strategy:

- Feature flag or adapter rollback to legacy checks while keeping diagnostics

Acceptance gate:

- Canonical normalization active
- Compatibility diagnostics visible in configured environments
- No regression in existing admin/API auth behavior during staged migration

Issue #6 checklist impact:

- Progresses auth/session/permission helper and server-enforcement checklist items

### Stage 4 - Middleware and public-route enforcement

Goal:

- Move middleware/public-route authorization to middleware-safe entrypoint with deterministic claim/no-fallthrough semantics and runtime-safe import graph.

Expected file areas:

- middleware-safe entrypoint modules
- middleware dispatch integration path (`middleware.ts`) and route-claim validation helpers
- plugin enabled/installed filtering integration for route claiming
- middleware-target fixture build checks

Explicit non-goals:

- No Node DB client usage in middleware export graph
- No React visibility integration

Dependencies:

- Stage 1 and Stage 2 complete
- Stage 3 compatibility context available where needed
- ADR-0002 accepted

Security invariants:

- Claimed-route denial/policy-error cannot fall through
- middleware export graph has no forbidden Node dependencies

Required tests:

- route claiming/conflict tests
- plugin enable/disable claim filtering tests
- no-fallthrough tests for deny and policy-error
- middleware/edge fixture build validation

Migration risk:

- Moderate (request-routing correctness and precedence)

Rollback strategy:

- Revert middleware integration to previous dispatcher path while preserving test fixtures

Acceptance gate:

- Middleware-safe graph validated
- Route precedence and conflict behavior deterministic in tests

Issue #6 checklist impact:

- Covers middleware/runtime boundary and public-route enforcement requirements

### Stage 5 - React visibility and registration helpers

Goal:

- Deliver React registration and visibility projection helpers for navigation, slots, components, and UI actions while keeping server enforcement independent.

Expected file areas:

- `@devholm/sdk/react` helper surface
- registration metadata adapters
- client visibility projection utilities

Explicit non-goals:

- No replacement of server-side authorization with client checks
- No acceptance example completion yet

Dependencies:

- Stages 1 to 3 complete
- ADR-0002 accepted

Security invariants:

- Client visibility remains advisory only
- server authorization remains authoritative and independently required

Required tests:

- visibility projection tests for anonymous/authenticated/role-based states
- registration helper type/boundary tests
- no server-only import leakage into react entrypoint

Migration risk:

- Low to moderate (UX regressions without server-security impact)

Rollback strategy:

- Revert React helper surfaces without touching server enforcement path

Acceptance gate:

- React helper APIs stable and import-safe
- Client visibility behavior deterministic and documented

Issue #6 checklist impact:

- Enables client visibility helper and registration-helper checklist items

### Stage 6 - Downstream acceptance proof and developer tooling

Goal:

- Produce downstream acceptance proof and tooling updates required by issue #6 without altering framework-owned internals for feature behavior.

Expected file areas:

- downstream acceptance fixture/example package or folder (repo-local)
- SDK import-boundary contract tests
- CLI scaffolding enhancements
- docs updates reflecting supported import boundaries

Explicit non-goals:

- No new marketplace/distribution implementation (#7)
- No event/job framework implementation (#11)
- No URL shortener MVP completion (#8)
- No calendar/gallery conversion rollout (#9/#10)

Dependencies:

- Stages 1 through 5 complete
- ADR-0002 accepted

Security invariants:

- acceptance examples prove server authorization independent from client visibility
- only public SDK imports used

Required tests:

- authenticated page proof
- protected API proof
- anonymous-only component proof
- authenticated/selected-role component proof
- external API integration proof
- database-backed action proof
- boundary/upgrade contract tests

Migration risk:

- Moderate (broad integration surface, but bounded to acceptance fixture scope)

Rollback strategy:

- Revert acceptance fixture and tooling increments by stage commits; keep prior SDK boundaries intact

Acceptance gate:

- Issue #6 acceptance proof items validated end-to-end
- public-import-only and upgrade-contract tests pass

Issue #6 checklist impact:

- Enables checking remaining implementation capabilities after proof completion

## ADR dependency and ratification requirement

Implementation must not begin until this planning and ratification PR is independently reviewed, ADR-0002 is accepted, and Stage 1 scope is approved.

This plan recommends ADR acceptance in the same ratification cycle as this document.

## First implementation PR recommendation (after plan review)

Recommended scope for first implementation PR: Stage 1 only.

Include:

- package export map subpath skeleton
- runtime-neutral access declaration and identifier contracts
- explicit server/middleware/react/testing entrypoint folders and import markers
- compile-time runtime-target fixture checks
- boundary/deep-import restriction tests

Exclude:

- runtime auth behavior replacements
- middleware route behavior changes
- server wrapper migration
- React visibility runtime integration

Why Stage 1 first:

- establishes enforceable boundaries before behavior migration
- minimizes blast radius and keeps rollback straightforward
- gives immediate CI signal for cross-runtime import safety
