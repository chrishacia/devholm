# SDK and Authorization Contract Inventory (Issue #6)

Status: Draft design and inventory pass (final consistency revision)
Date: 2026-07-03
Related issue: #6
Related PR: #26

## Scope

This document inventories existing extension and authorization surfaces, then maps them to proposed public-contract boundaries without starting runtime implementation.

This pass remains documentation-only:

- no runtime SDK implementation
- no application feature implementation
- no framework route/middleware rewrites
- no issue #11/#7/#8/#9/#10 implementation scope absorbed

## Repository Paths Inspected

- `src/core/**`
- `src/user/**`
- `src/app/**`
- `middleware.ts`
- `devholm.config.ts`
- `scripts/devholm-cli.ts`
- `src/test/setup.ts`
- `docs/roadmap/**`

## Surface Classification

### A. Normal downstream code patterns that remain valid

Downstream developers may continue writing normal:

- React components and hooks
- Next.js physical pages and route handlers
- TypeScript services and modules
- API integrations
- database-backed business logic in site-owned code

SDK contracts are integration helpers, not a replacement for normal Next.js development.

### B. SDK integration contracts (where framework services connect)

- extension registration surfaces
- plugin registration/manifest/settings surfaces
- policy declarations and server evaluators/resolvers
- framework-linked auth/session/permission contracts

### C. Internal orchestration modules (must remain non-public)

- `src/core/lib/extensions.server.ts`
- `src/core/lib/extension-helpers.server.ts`
- `src/core/lib/plugins.ts`
- `src/core/lib/public-route-dispatcher*.server.ts`
- `src/core/lib/plugin-lifecycle.server.ts`
- framework-internal DB/config internals

## Supported-versus-Internal Matrix

| Surface                               | Current Source Location                                                                                                           | Current Consumers                    | Intentional Status            | Public Contract Direction                                                  | Packaging/Runtime Constraint                              | Authorization/Ownership Implications                                 | Disposition                                                      |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ----------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Named extension slots (`SlotsConfig`) | `src/core/types/extensions.ts`, `devholm.config.ts`                                                                               | site-owned config + page composition | Intentional compatibility     | keep structural compatibility + policy-aware wrapper contracts             | static config, production-safe                            | visibility-only unless linked server action enforces policy          | Preserve structural type, wrap/enrich behavior contracts         |
| View overrides (`ViewOverride`)       | `src/core/types/extensions.ts`, `devholm.config.ts`, user views                                                                   | site page customization              | Intentional compatibility     | keep structural compatibility + optional guarded wrappers                  | static import map, production-safe                        | protected data must be controlled server-side                        | Preserve structural type, add optional policy wrapper contracts  |
| Normal physical Next.js pages         | `src/app/**`, `src/user/**`                                                                                                       | downstream and framework routes      | Normal framework pattern      | not registry-mandated SDK surface                                          | standard Next runtime rules                               | use server auth where needed                                         | Preserve as normal development path                              |
| Registry-backed dynamic admin pages   | `src/user/extensions/admin/pages.tsx`, `src/core/lib/extensions.server.ts`, `src/app/admin/[...slug]/page.tsx`                    | framework dynamic route loader       | Intentional extension surface | server-entrypoint executable helper ownership required                     | framework currently imports registries directly           | must enforce auth + plugin state                                     | Replace incrementally via server registration wrappers           |
| CMS and catch-all pages               | `src/app/[...slug]/page.tsx` + CMS loaders                                                                                        | content routing                      | Intentional                   | normal path, optional SDK auth helper use                                  | route precedence with middleware-dispatched public routes | denial must not accidentally expose lower-precedence route ownership | Preserve normal path + document precedence safeguards            |
| API extensions                        | `src/user/extensions/api/index.ts`, `src/app/api/[...path]/route.ts`, `src/core/lib/extensions.server.ts`                         | extension API dispatcher             | Intentional but permissive    | executable callbacks belong in server entrypoint                           | internal dispatcher imports registries                    | explicit policy required for new registrations                       | Replace incrementally with explicit-policy server helpers        |
| Public route extensions               | `src/user/extensions/public-routes/index.ts`, `middleware.ts`, `src/core/lib/public-route-dispatcher*.server.ts`                  | middleware route dispatch            | Intentional                   | server helper ownership + explicit policy                                  | middleware runtime constraints apply                      | claimed-route denial/error must not fall through                     | Wrap with strict claimed-route auth semantics                    |
| Admin navigation                      | `src/user/extensions/admin/index.tsx`, admin layout                                                                               | admin shell                          | Intentional                   | client/react entrypoint helper + ownership metadata                        | client/runtime-neutral metadata                           | visibility is advisory only                                          | Preserve compatibility + enrich with owner/policy references     |
| Embeds                                | `src/user/extensions/embeds/index.ts`, `src/core/lib/embeds.ts`                                                                   | markdown rendering                   | Intentional                   | runtime-specific helper ownership based on execution path                  | registry wiring currently internal                        | render visibility does not authorize mutations                       | Wrap registration contracts, keep internals private              |
| SEO/metadata extensions               | `src/user/extensions/seo/index.ts`, metadata/sitemap/robots routes                                                                | SEO outputs                          | Intentional                   | stable registration contract + internal orchestration                      | output generation runtime dependent                       | avoid leaking protected data                                         | Preserve behavior, wrap contracts                                |
| Plugin definitions and registries     | `src/core/types/plugins.ts`, `src/user/extensions/plugins/*`, `src/core/lib/plugin-registry.server.ts`, `src/core/lib/plugins.ts` | lifecycle/install/admin APIs         | Intentional                   | typed contracts public, loaders internal                                   | framework directly imports registries today               | owner/plugin validation required                                     | Preserve type contracts, internalize orchestration               |
| Plugin settings                       | `src/core/db/settings.ts`, `src/core/db/plugins.ts`                                                                               | plugin lifecycle/runtime checks      | Intentional                   | namespaced SDK settings contract only                                      | keys namespaced `plugin:<id>:*`                           | plugin-owned scope only                                              | Keep global settings internal, expose scoped plugin settings API |
| Permission and role primitives        | `src/core/lib/auth-helpers.ts`, `src/auth.ts`, `middleware.ts`                                                                    | middleware + API handlers            | Intentional but inconsistent  | unified server contract required                                           | behavior split across middleware/helper                   | middleware `isAdmin` parity mismatch with helper must be reconciled  | Explicit migration decision, no silent selection                 |
| Database + migration ownership        | `src/core/db/index.ts`, core/user/plugin migrations                                                                               | framework + plugin lifecycle         | Intentional internal service  | scoped capability contracts only, no raw DB in plugin SDK                  | raw DB exposure unsafe as public contract                 | mutation-time auth and ownership checks required                     | Keep internal DB handles private                                 |
| CLI scaffolding                       | `scripts/devholm-cli.ts`                                                                                                          | downstream scaffolding               | Intentional                   | evolve to enforce explicit registration ownership/policy declarations      | command templates must track SDK rules                    | should guide away from implicit policy defaults                      | Preserve + extend with migration diagnostics                     |
| Test utilities                        | `src/test/setup.ts`, core/plugin tests                                                                                            | internal + plugin tests              | Partial                       | `@devholm/sdk/testing` fixtures for boundaries/runtime targets/composition | must test alias/deep import boundaries                    | verify fail-closed behavior                                          | Expand testing contract surfaces                                 |

## Registration Ownership and Namespacing Inventory Gap

Current state:

- many registration identifiers are effectively global
- owner/plugin relationship is not uniformly encoded

Required model:

- owner is explicit: `framework`, `site`, `plugin:<id>`
- identifier namespace includes owner and registration type
- references to evaluators/resolvers/permissions are owner-scoped

Validation requirements:

- duplicate/collision rejection
- unknown-reference rejection
- owner/plugin mismatch rejection
- plugin installed/enabled validation for plugin-owned registrations
- deterministic registration order when order matters

## Capability Isolation Inventory Gap

Current state:

- extension helper contracts expose broad capabilities (`getDb`, general helpers)
- plugin and site evaluator capability boundaries are not strongly separated

Required model:

- framework/site/plugin capability-scoped service construction
- plugin evaluator receives only plugin-scoped settings/data capabilities and brokered framework capabilities
- no arbitrary site/framework/other-plugin data exposure
- runtime construction must enforce boundaries (typing alone is insufficient)

## Composition and Failure Semantics Inventory Gap

Current state:

- composition behavior currently described with potentially conflicting short-circuit/precedence language

Required model:

- side-effect-free evaluators/resolvers
- empty `allOf` and `anyOf` rejected at validation time
- deterministic `allow|unauthenticated|forbidden|not-found|policy-error` aggregation
- runtime invalid policy or lookup failures fail closed
- policy-error transport not downgraded to ordinary authorization denial

## Policy-Error Transport Requirement

Operational failures must yield `policy-error` semantics with defined transport:

- default 500
- dependency-unavailable class 503
- sanitized external error
- diagnostic correlation id/logging internally
- no route fallthrough on claimed public route failure

## Runtime-Target and Public-Route Constraint

Current implementation constraint:

- public-route dispatch path runs through `middleware.ts`

Design implication:

- server helper ownership must acknowledge middleware/runtime limits
- not every server helper can run in every server-like runtime
- runtime-target import tests are required

## Administrator Resolution Inconsistency (Explicit Migration Decision)

Observed:

- `middleware.ts` recognizes `token.isAdmin === true`
- `src/core/lib/auth-helpers.ts::hasAdminAccess()` does not currently include `isAdmin`

Requirement:

- resolve via explicit migration decision before unified policy enforcement replaces either path
- do not silently pick one behavior

## Mapping to Issue #6 Required Capabilities

| Capability                                              | Status  | Gap/Action                                                   |
| ------------------------------------------------------- | ------- | ------------------------------------------------------------ |
| public SDK entrypoints                                  | Missing | define stable export map and boundaries                      |
| executable registration helper ownership by runtime     | Missing | map helpers to server/react/client entrypoints               |
| shared access-policy model                              | Missing | implement declaration + evaluator split                      |
| namespaced evaluator/resolver registration + validation | Missing | add owner-scoped registry validation                         |
| capability-scoped site/plugin service construction      | Missing | remove broad generic service access                          |
| runtime-target enforcement                              | Missing | add runtime matrix + import safety tests                     |
| SDK compatibility/versioning policy                     | Missing | define semver/deprecation/compat test rules                  |
| client visibility + server authority                    | Partial | unify surface adapters around same policy semantics          |
| boundary enforcement against internal imports           | Missing | layered enforcement: export maps + TS + lint + fixture tests |

## Deferred Scope Guardrails

Still out of scope in this pass:

- issue #11 events/background/scheduled work
- issue #7 package/version implementation
- issue #8 URL shortener MVP implementation
- issue #9/#10 conversion implementation
- runtime SDK/application implementation
