# SDK and Authorization Contract Inventory (Issue #6)

Status: Draft design and inventory pass
Date: 2026-07-03
Related issue: #6

## Scope

This document inventories the current DevHolm contract surfaces and implementation paths before broad SDK work begins.

This pass is intentionally documentation-only:

- No broad SDK implementation
- No new registration helpers
- No middleware rewrites
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

## Boundary Inventory

### Framework-owned versus site-owned

- Framework-owned paths: `src/core/**`, `src/app/**`, `middleware.ts`
- Site-owned extension and content paths: `src/user/**`, `devholm.config.ts`
- Current coupling pattern: site-owned code imports many `@core/*` types and selected runtime helpers.

Cross-boundary evidence:

- `src/user/extensions/api/index.ts` imports `ApiExtension` from `@core/types/extensions.server`
- `src/user/extensions/public-routes/index.ts` imports `PublicRouteExtension` from `@core/types/extensions.server`
- `src/user/extensions/plugins/url-shortener/services/prefix-service.ts` imports `getReservedRoutes` from `@core/lib/reserved-routes.server`
- `src/user/extensions/embeds/index.ts` imports `validateEmbedExtensions` and core embed modules

Assessment:

- Type-level coupling appears intentional.
- Runtime imports from `@core/lib/*` into `src/user/**` are partial and likely accidental long-term contracts.

## Supported-versus-Internal Contract Matrix

| Mechanism | Current Source Location | Current Consumers | Intentional or Accidental | Safe as Public Contract | Production/Packaging Constraints | Authorization Implications | Recommended Disposition |
|---|---|---|---|---|---|---|---|
| Config root contract | `src/core/types/config.ts`, `devholm.config.ts` | site config wiring | Intentional | Yes | Stable file boundary | None by itself | Preserve as-is |
| Admin nav registration | `src/core/types/extensions.ts`, `src/user/extensions/admin/index.tsx` | admin layout + config | Intentional | Yes | None significant | Visibility only; server auth still required | Preserve as-is |
| Admin page registration | `src/core/types/extensions.server.ts`, `src/user/extensions/admin/pages.tsx`, `src/core/lib/extensions.server.ts` | dynamic admin route loader | Intentional | Partial | Registry imported in framework code | Page discoverability vs auth separated | Wrap behind SDK |
| API extension registration | `src/core/types/extensions.server.ts`, `src/user/extensions/api/index.ts`, `src/app/api/[...path]/route.ts`, `src/core/lib/extensions.server.ts` | catch-all API dispatcher | Intentional | Partial | Dispatcher imports registry directly | No built-in policy metadata; route handlers enforce manually | Replace incrementally with policy-aware wrappers |
| Public route registration | `src/user/extensions/public-routes/index.ts`, `src/core/lib/public-route-dispatcher*.ts` | middleware dispatch | Intentional | Partial-strong | Works in prod if bundled correctly; two-phase design is safe | Dispatcher enforces plugin enabled checks; no auth model contract yet | Wrap behind SDK |
| Embed registration | `src/user/extensions/embeds/index.ts`, `src/core/lib/embeds.ts` | markdown embed processors | Intentional | Partial | Depends on centralized registry imports | Mostly content rendering; auth context available but not standardized | Wrap behind SDK |
| SEO extension registration | `src/user/extensions/seo/index.ts`, `src/core/lib/extensions.server.ts` | metadata/sitemap/robots routes | Intentional | Partial | Registry imports in framework files | Usually public surface; no auth by default | Preserve, then wrap behind SDK facades |
| Plugin definition contract | `src/core/types/plugins.ts` | plugin authors and lifecycle code | Intentional | Mostly yes | Bundled discovery path must be production-safe | Lifecycle operations are admin-sensitive | Preserve, then formalize exports |
| Plugin registry wiring | `src/user/extensions/plugins/registry.ts`, `src/core/lib/plugin-registry.server.ts`, `src/core/lib/plugins.ts` | plugin lifecycle and state | Intentional | Partial | Framework imports tenant registry directly | Plugin enablement gates many surfaces | Wrap behind SDK |
| Plugin settings and runtime state | `src/core/db/plugins.ts`, `src/core/db/settings.ts` | admin plugin route, routing/feature checks | Intentional | Partial | Uses DB settings keys `plugin:<id>:enabled` | Important server enforcement gate | Preserve internals, expose narrow read helpers |
| Auth/session helpers | `src/auth.ts`, `src/core/lib/auth-helpers.ts`, `middleware.ts` | admin APIs, middleware, route handlers | Intentional core utility | Partial | NextAuth and env assumptions | Mixed route-level checks; helper usage duplicated | Wrap behind SDK |
| Roles and permissions checks | `src/core/lib/auth-helpers.ts` | admin API handlers and auth flows | Intentional | Partial | Backward compatibility logic in permission checks | Inconsistent adoption across extension routes | Wrap and standardize policy API |
| Route-level admin checks | many `src/app/api/admin/**` routes | admin APIs | Intentional | Internal pattern, not contract | Repeated per-route calls | Strong server-side enforcement, duplicated implementation | Replace incrementally with policy wrapper |
| Extension helper bag | `src/core/lib/extension-helpers.server.ts`, `src/core/types/extensions.server.ts` | API/public route/extensions | Intentional | Partial | Exposes `getDb` and `verifyAdmin` directly | Powerful but unopinionated auth semantics | Wrap behind policy-aware contexts |
| DB access helper | `src/core/db/index.ts` via `getDb` | core + extension helpers | Intentional internal utility | Not as broad contract | Direct table access risk; coupling to schema | No built-in authorization semantics | Keep internal + narrow SDK wrappers |
| Migration ownership | `src/core/db/migrations`, `src/user/extensions/db/migrations`, plugin migration ledger | framework + plugin lifecycle | Intentional | Internal + partial external | Works in production with packaged migrations | Admin/lifecycle controlled | Preserve as-is |
| CLI scaffolding | `scripts/devholm-cli.ts` | downstream developers | Intentional | Partial | Local scaffolding; no versioned SDK contract yet | None directly | Wrap behind SDK docs and command contracts |
| Testing support | `src/test/setup.ts`, core and plugin tests | internal test suites | Partial | Partial | No dedicated downstream contract suite yet | No shared policy test DSL yet | Replace incrementally with SDK testing helpers |

## High-Risk Findings Requested in Issue #6

### Imports from `src/core/**` used by `src/user/**`

Confirmed in multiple files, including runtime helpers:

- `src/user/extensions/plugins/url-shortener/validation/prefix-validation.ts`
- `src/user/extensions/plugins/url-shortener/services/prefix-service.ts`
- `src/user/extensions/embeds/index.ts`

Interpretation:

- Some imports are intentional type contracts.
- Runtime helper imports indicate boundary leakage that should move behind explicit SDK modules.

### Imports from `src/core/**` used by plugins

Confirmed for URL shortener plugin modules in `src/user/extensions/plugins/url-shortener/**`.

### Direct framework imports of specific plugin implementations

Framework and shared loaders import user/plugin registries directly:

- `src/core/lib/extensions.server.ts` imports user extension registries.
- `src/core/lib/plugins.ts` imports `@user/extensions/plugins`.
- `src/core/lib/plugin-registry.server.ts` imports `@user/extensions/plugins/registry`.

Interpretation:

- Works today, but requires framework-side import touch points and keeps contracts implicit.

### Registries requiring framework-owned edits

Current extension registries can be changed in `src/user/**`, but framework code still hard-imports those registries. This is workable but not a clean public SDK boundary.

### Duplicated or inconsistent auth helper exposure

- `verifyAdmin` pattern repeats across many `src/app/api/admin/**` route handlers.
- Middleware has separate admin path enforcement logic.
- Extension API dispatcher does not enforce shared declarative auth policy.

### Client visibility without independent server enforcement

- Admin navigation visibility can hide plugin/admin entries client-side.
- Server routes still need explicit checks.
- Rule preserved: hiding UI is not authorization.

### One-off authorization in route handlers

Confirmed in many `src/app/api/admin/**` files via repeated `verifyAdmin` + 401 responses.

### Development-only discovery vs production packaging risk

- Current registries are static imports, which is production-safe.
- Any future dynamic source discovery must avoid relying on source paths unavailable in packaged artifacts.

### Public-looking modules that are not stable contracts

Examples:

- `src/core/lib/extensions.server.ts`
- `src/core/lib/extension-helpers.server.ts`
- `src/core/lib/plugins.ts`

These are currently internal orchestration modules and should not be treated as downstream public APIs.

## Mapping to Issue #6 Required Capabilities

| Issue #6 Capability | Status | Evidence | Notes |
|---|---|---|---|
| Public SDK entrypoints (server/client/testing) | Missing | no stable `@devholm/sdk*` entrypoints | Design needed |
| `definePage` / `defineApiRoute` / `defineAdminPage` / `definePublicRoute` helpers | Missing | ad-hoc object literal registries | Design needed |
| Shared access-policy model | Missing | no single policy type model | Design needed |
| Client visibility helpers + server enforcement | Partial | middleware/admin checks + UI checks exist separately | Needs unified policy model |
| Auth/session/role/permission helpers via public contracts | Partial | `src/core/lib/auth-helpers.ts`, `src/auth.ts` | Needs explicit SDK contracts |
| External API integration example | Partial | agent routes exist; no SDK-first documented example | Deferred to implementation phase |
| Custom DB-backed feature example | Partial | plugin/system DB surfaces exist | Deferred to implementation phase |
| CLI scaffolding for complete extension | Partial | `scripts/devholm-cli.ts` has scaffolding commands | Needs SDK-aligned scaffolding |
| Upgrade-contract tests preventing `src/core/**` imports | Missing | no dedicated boundary test suite | Design now, implement later |
| Docs for supported vs internal imports | Partial | scattered docs + this inventory | Needs formal SDK docs |

## Mapping to Issue #6 Acceptance Proof

Required sample downstream feature constraints are not yet completed by design (intentionally deferred):

- Authenticated custom page: deferred
- Role/permission-protected API: deferred
- Anonymous-only component: deferred
- External API request: deferred
- DB-backed custom action: deferred

This pass only defines architecture and migration path.

## Deferred Scope Guardrails

The following remain out of this pass:

- Issue #11 events/background jobs/scheduled tasks
- Issue #7 package/versioning implementation
- Issue #8 URL shortener functional MVP implementation
- Calendar/Gallery plugin conversions (#9/#10)
- Broad SDK/runtime code implementation

## Recommended Disposition Summary

- Preserve as-is now: config typing, migration ownership, current plugin lifecycle ledger
- Wrap behind SDK: extension type contracts, auth helper contracts, plugin runtime read contracts
- Replace incrementally: API extension auth model, route-level one-off authorization patterns
- Keep internal: core orchestration modules under `src/core/lib/*`
- Remove after migration: direct downstream runtime imports from internal `@core/lib/*`
