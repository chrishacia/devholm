# SDK and Authorization Contract Inventory (Issue #6)

Status: Draft design and inventory pass (revised after independent review)
Date: 2026-07-03
Related issue: #6
Related PR: #26

## Scope

This document inventories existing contract surfaces and internal orchestration paths before broad SDK implementation.

This pass is intentionally documentation-only:

- No broad SDK/runtime implementation
- No framework route rewrites
- No middleware replacement
- No plugin conversion work
- No issue #11, #7, #8, #9, #10 implementation scope absorbed

## Repository Paths Inspected

- `src/core/**`
- `src/user/**`
- `src/app/**`
- `middleware.ts`
- `devholm.config.ts`
- `scripts/devholm-cli.ts`
- `src/test/setup.ts`
- `docs/roadmap/**`

## Boundary Groups

### 1. Normal downstream development surfaces (continue writing normally)

These are standard framework usage patterns and are not DevHolm-specific SDK integration points by default:

- Normal React components and hooks
- Normal Next.js App Router pages and route handlers
- Normal TypeScript modules/services
- Normal external API integrations from downstream code
- Normal downstream database/business logic in site-owned paths

### 2. DevHolm integration contracts (SDK-facing)

These are the points where downstream code connects to framework-owned extension, plugin, and authorization services:

- Extension registrations (admin pages, APIs, public routes, embeds, SEO)
- Slot registration (`SlotsConfig`)
- View override registration (`ViewOverride`)
- Plugin definitions/registries/manifests/settings
- Policy declarations for server-authorized execution
- Framework-provided auth/session/permission capability contracts

### 3. Internal orchestration modules (must not become public contracts)

These are internal composition/execution modules and should stay non-public:

- `src/core/lib/extensions.server.ts`
- `src/core/lib/extension-helpers.server.ts`
- `src/core/lib/plugins.ts`
- `src/core/lib/public-route-dispatcher*.server.ts`
- `src/core/lib/plugin-lifecycle.server.ts`
- framework-internal DB/config orchestration modules

## Supported-versus-Internal Matrix

| Surface | Current Source Location | Current Consumers | Current Intent | Public Contract Safety | Packaging/Production Constraints | Authorization Implications | Recommended Disposition |
|---|---|---|---|---|---|---|---|
| Named extension slots (`SlotsConfig`) | `src/core/types/extensions.ts`, `devholm.config.ts` | downstream site config + view composition | Intentional compatibility surface | Structural type is safe; behavior policy not fully modeled | Static config is production-safe | Slot visibility can imply access intent but is not auth | Preserve structural type, add policy-aware wrappers/enriched slot registration |
| View overrides (`ViewOverride`) | `src/core/types/extensions.ts`, `devholm.config.ts`, user view files | downstream page customization | Intentional compatibility surface | Structural type is safe | Static import map is production-safe | Override may include protected data paths; requires server enforcement in implementation | Preserve structural type, add policy and plugin-enable aware wrappers for framework-integrated overrides |
| Normal physical Next.js/App Router pages | `src/app/**`, `src/user/**` page modules | downstream developers and framework pages | Normal framework behavior | Not a special SDK surface | Standard Next runtime rules apply | Must use server auth for protected operations | Preserve as normal development path (SDK optional) |
| Registry-backed dynamic admin pages | `src/user/extensions/admin/pages.tsx`, `src/core/lib/extensions.server.ts`, `src/app/admin/[...slug]/page.tsx` | framework dynamic admin route | Intentional extension surface | Partial; currently tied to internal loaders | Registry imports hardwired in framework | Needs unified policy + plugin enabled/install enforcement | Wrap behind SDK registration adapters |
| CMS and catch-all pages | `src/app/[...slug]/page.tsx`, CMS DB/page loaders | normal site rendering | Intentional | Not SDK-specific by default | Route precedence interactions with plugin routes must be explicit | Protected CMS content requires server policy checks | Preserve normal path; document precedence and explicit policy usage |
| API extensions | `src/user/extensions/api/index.ts`, `src/app/api/[...path]/route.ts`, `src/core/lib/extensions.server.ts` | extension API dispatcher | Intentional, but currently permissive | Partial; needs explicit-policy defaults | Registry imported by internal module | Currently handler-defined auth; no required declarative policy | Replace incrementally with explicit policy declarations and legacy adapter |
| Public route extensions | `src/user/extensions/public-routes/index.ts`, `middleware.ts`, `src/core/lib/public-route-dispatcher*.server.ts` | middleware dispatch path | Intentional | Partial; execution contract exists but policy model missing | Must avoid source-only discovery assumptions | Denial/fallthrough semantics are security-sensitive | Wrap with explicit policy + plugin state requirements |
| Admin navigation | `src/user/extensions/admin/index.tsx`, `src/core/types/extensions.ts`, admin layout | admin shell | Intentional | Structural type safe | Static registration is safe | Visibility only; never authoritative | Preserve compatibility, add policy/enablement-aware registration semantics |
| Embeds | `src/user/extensions/embeds/index.ts`, `src/core/lib/embeds.ts` | markdown/content rendering pipeline | Intentional | Partial | Registry import coupling to internals | Embed visibility not equal to operation authorization | Wrap behind SDK adapter contracts |
| SEO/metadata extensions | `src/user/extensions/seo/index.ts`, `src/core/lib/extensions.server.ts`, robots/sitemap/metadata routes | SEO metadata routes | Intentional | Partial | Internal registry orchestration | Usually public, but generation context must not leak protected data | Preserve behavior, wrap with stable registration contracts |
| Plugin definitions and registries | `src/core/types/plugins.ts`, `src/user/extensions/plugins/index.ts`, `src/user/extensions/plugins/registry.ts`, `src/core/lib/plugin-registry.server.ts`, `src/core/lib/plugins.ts` | lifecycle/install/admin/plugins API | Intentional | Partial (types stable, loaders internal) | Framework imports tenant/plugin registries directly | Enable/install state impacts all plugin-owned surfaces | Preserve type contracts; keep orchestration internal; add SDK registry contract |
| Plugin settings | `src/core/db/settings.ts`, `src/core/db/plugins.ts`, plugin settings definitions | plugin lifecycle/admin/runtime checks | Intentional | Partial | Keys are namespaced (`plugin:<id>:*`) | Enablement and settings should gate plugin surfaces | Expose namespaced SDK settings capability, keep full settings DB internal |
| Permission and role primitives | `src/core/lib/auth-helpers.ts`, `src/auth.ts`, `middleware.ts` | middleware + admin APIs + extension helpers | Intentional but inconsistent | Partial | Mixed compatibility logic in separate places | **Inconsistency**: middleware honors `token.isAdmin === true`; `hasAdminAccess()` currently does not | Reconcile as explicit migration decision before unified enforcement |
| Database access and migration ownership | `src/core/db/index.ts`, core/user migrations, plugin migration ledger | framework + plugin lifecycle + extension helpers | Intentional internal service | Not safe as broad plugin SDK capability | Raw DB exposure would couple private schema | Needs scoped trust boundaries and same-operation auth for writes | Keep core DB internal; expose scoped service contracts only |
| CLI scaffolding | `scripts/devholm-cli.ts` | downstream dev workflows | Intentional support tooling | Partial | Commands exist but not yet SDK-governed contract | Scaffolding should nudge explicit policy declarations | Preserve and evolve with SDK migration warnings |
| Test utilities | `src/test/setup.ts`, core tests, plugin tests | internal and plugin tests | Partial | Partial | No dedicated downstream boundary suite yet | Need policy/contract regression test helpers | Expand via `@devholm/sdk/testing` + boundary enforcement layers |

## Required Surface Coverage Notes

### Extension surface coverage requested

The matrix now explicitly covers:

- Named slots (`SlotsConfig`)
- View overrides (`ViewOverride`)
- Normal physical App Router pages
- Registry-backed dynamic admin pages
- CMS/catch-all pages
- API extensions
- Public route extensions
- Admin navigation
- Embeds
- SEO/metadata extensions
- Plugin definitions/registries
- Plugin settings
- Permission/role primitives
- Database/migration ownership
- CLI scaffolding
- Test utilities

## Existing Administrator Resolution Inconsistency (Must Be Reconciled)

Observed behavior:

- `middleware.ts` admin guard considers `token.isAdmin === true` as sufficient.
- `src/core/lib/auth-helpers.ts::hasAdminAccess()` currently does not include `isAdmin` in its decision path.

Decision status:

- Do not silently choose one behavior.
- Treat this as a required migration decision before replacing current checks with unified policy enforcement.

Migration requirement:

- Final policy engine and compatibility adapter must explicitly define admin-resolution parity behavior and rollout strategy.

## Additional Risk Findings

### Imports from internal `@core/*` modules in downstream/plugin code

Examples include runtime helper usage under `src/user/extensions/plugins/**` and `src/user/extensions/embeds/**`.

Interpretation:

- Type-level imports can remain as formal SDK exports.
- Runtime imports from internal orchestration modules must migrate to public SDK contracts.

### Direct framework imports of plugin/extension registries

- Internal core orchestration modules currently import user/plugin registries directly.
- Works in production today but keeps boundaries implicit and difficult to version.

### One-off authorization in route handlers

- Many admin API handlers manually call `verifyAdmin` and return 401.
- This pattern is valid for now but should migrate to explicit policy-based wrappers.

### Client visibility not being authorization

- UI/navigation hiding can improve UX.
- Server-side authorization remains mandatory.

## Mapping to Issue #6 Required Capabilities

| Capability | Status | Evidence | Gap/Action |
|---|---|---|---|
| Public SDK entrypoints (server/client/testing) | Missing | no stable `@devholm/sdk*` export map | Design defined; implementation deferred |
| Registration helpers (`definePage`, `defineApiRoute`, `defineAdminPage`, `definePublicRoute`, related) | Missing | ad-hoc object registries | Add SDK helper layer with explicit policy requirement |
| Shared access-policy model | Missing | no single declarative policy model in runtime | Design defined; implementation deferred |
| Client visibility + authoritative server enforcement | Partial | middleware/admin checks exist, not unified | Build unified policy adapters |
| Auth/session/role/permission helpers through public contracts | Partial | helper modules exist as internals | Formalize as SDK server contracts |
| External API integration example | Partial | normal routes can do this today | Add SDK-first acceptance example |
| Custom DB-backed feature example | Partial | feasible today with internals | Add scoped service contract + acceptance example |
| CLI scaffolding for complete extension | Partial | `scripts/devholm-cli.ts` scaffolds pieces | Extend to policy-aware templates |
| Upgrade-contract tests preventing internal imports | Missing | no dedicated boundary suite | Add multi-layer boundary enforcement and tests |
| Docs distinguishing supported vs internal imports | Partial | this inventory and architecture docs | Expand into public SDK docs when implementation starts |

## Mapping to Updated Acceptance-Proof Intent

This design pass intentionally does not claim acceptance proof completion. It defines requirements and migration path for:

1. authenticated custom page
2. role/permission protected API
3. anonymous-only component visibility
4. authenticated/selected-role component visibility
5. external API integration
6. database-backed custom action
7. client visibility + server authoritative enforcement
8. public SDK imports (no arbitrary `src/core/**`/`@core/*`)
9. contract tests across framework updates

## Compatibility and Migration Guardrails

- Preserve existing structural registration types where possible (admin nav, slots, view overrides).
- Introduce wrappers/enriched contracts for policy and plugin enablement behavior.
- Keep internal orchestration modules non-public.
- Add compatibility adapters only as temporary migration paths with warnings and deprecation plan.

## Deferred Scope Guardrails

Still out of scope for this pass:

- Issue #11 events/background jobs/scheduled tasks
- Issue #7 package/version implementation
- Issue #8 URL Shortener functional MVP
- Issue #9/#10 Calendar/Gallery conversion work
- Broad SDK/runtime implementation
