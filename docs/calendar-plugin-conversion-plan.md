# Calendar Plugin Conversion Plan (Issue #9)

Issue: https://github.com/chrishacia/devholm/issues/9

Scope note:

- Preserve discovery and planning only.
- Do not begin conversion implementation in this document.

## Discovery summary

Current Calendar surfaces identified:

- Public UI/routes:
  - src/app/calendar/[slug]/page.tsx
  - src/app/calendar/[slug]/BookingClient.tsx
  - src/app/api/calendar/[slug]/route.ts
  - src/app/api/calendar/[slug]/bookings/route.ts
- Admin UI/routes:
  - src/app/admin/calendar/page.tsx
  - src/app/api/admin/calendar/route.ts
  - src/app/api/admin/calendar/[id]/route.ts
  - src/app/api/admin/calendar/[id]/blocks/route.ts
  - src/app/api/admin/calendar/blocks/[blockId]/route.ts
  - src/app/api/admin/calendar/[id]/event-types/route.ts
  - src/app/api/admin/calendar/event-types/[eventTypeId]/route.ts
- Data/navigation/sitemap/embed areas:
  - src/core/db/calendar.ts
  - src/core/db/settings.ts
  - src/app/sitemap.xml/route.ts
  - src/core/lib/embeds/calendar.ts
  - src/user/extensions/embeds/index.ts
  - src/app/admin/AdminLayoutClient.tsx (hardcoded Calendar nav)
  - src/core/lib/reserved-routes.server.ts (/calendar reservation)
- Shared migration currently owning calendar tables:
  - src/core/db/migrations/20260629010000_add_calendar_gallery_and_media_transforms.ts

## Direct-core findings to remove in later phases

- Calendar is still declared as a core plugin definition.
- Admin sidebar includes a hardcoded Calendar nav item.
- Filesystem-owned core routes still own Calendar public/admin/API surfaces.
- Calendar embed implementation is core-owned.
- Sitemap and public navigation are directly wired to Calendar DB helpers.
- Calendar schema is in a shared core migration.
- Calendar-specific test coverage appears sparse.

## Phased implementation plan

Phase 1: plugin manifest + ownership boundary

- Introduce Calendar bundled plugin manifest and lifecycle ownership boundary.
- Define enablement key, plugin metadata, and ownership contracts.

Phase 2: migrations/settings/data preservation

- Preserve existing calendar data and table continuity.
- Move migration ownership strategy to lifecycle-managed plugin flow.
- Ensure settings defaults and migration registry alignment are deterministic.

Phase 3: SDK registration of pages/APIs/embeds/navigation/public routes

- Register Calendar surfaces through plugin SDK extension points.
- Reduce/remove direct core registration for these surfaces.

Phase 4: permissions and access policies

- Enforce consistent admin/public permission checks through plugin-aware policy paths.
- Confirm disabled plugin behavior is coherent across all surfaces.

Phase 5: lifecycle enable/disable/upgrade/uninstall/purge behavior

- Implement and validate lifecycle state transitions and destructive safeguards.
- Clearly separate disable/uninstall/purge semantics.

Phase 6: compatibility/regression/migration/E2E tests

- Add targeted unit/integration/E2E coverage for lifecycle + route contracts.
- Add migration and rollback compatibility checks.

Phase 7: remove old direct core registrations

- Remove legacy core Calendar registrations and glue code once new path is fully validated.

## Risk register

- Data-loss risk:
  - Cascading table relationships can delete dependent rows if lifecycle deletion semantics are incorrect.
- Route ownership risk:
  - File-system routes and plugin-dispatched routes can conflict during migration.
- Auth/permission risk:
  - Admin/public guard behavior may diverge across old/new paths.
- Migration/rollback risk:
  - Shared migration history and plugin migration ownership need explicit compatibility handling.
- Generated registry drift risk:
  - Plugin registry assets can drift from source if generation/check discipline is not enforced.
- Sparse Calendar test coverage risk:
  - Limited existing tests increase regression probability.
- Plugin source/runtime/generated confusion risk:
  - Source directories vs generated runtime assets must remain clearly separated.

## Phase 3 framework gaps (current)

- Bundled plugin contracts currently include admin/API/public-route adapters, but do not yet include
  first-class bundled embed-registration and bundled sitemap/navigation registration contracts.
- Calendar embed behavior remains core-owned in Phase 3 to preserve behavior and avoid duplicate
  registration until a bundled embed contract bridge is defined.
- Calendar sitemap/public-navigation behavior remains core-owned in Phase 3 for the same reason.

## Phase 4 framework gaps (current)

- Calendar admin and API access metadata can be declared in plugin extension adapters, but runtime
  enforcement for Calendar still lives in existing filesystem-owned routes.
- Admin Calendar API routes currently enforce coarse `verifyAdmin` checks in core route handlers;
  plugin metadata remains declarative in Phase 4 to avoid behavior regression.
- Public Calendar view and booking policy expectations are declared as metadata in Phase 4, while
  runtime booking/public rules remain in existing filesystem APIs.
- Embed and sitemap/navigation bundled-plugin contract bridges are still not first-class and remain
  deferred to later phases.

## Phase 5 behavior (implemented)

- Disable semantics are non-destructive: Calendar baseline tables and data are retained.
- Uninstall semantics are non-destructive by default: Calendar schema and data remain intact.
- Purge semantics are explicit-confirmation gated by framework (`confirmPluginId`) and Calendar
  adds a safety preflight block when Calendar tables contain rows.
- Calendar purge hook does not drop or rename Calendar tables and does not run shared core
  Calendar/Gallery/media migration teardown logic.
- Runtime route enforcement remains with existing filesystem routes in Phase 5; direct route
  ownership migration remains deferred.

## Phase 5 framework gaps (current)

- Framework confirmation semantics are based on `confirmPluginId`; there is no second typed-phrase
  confirmation contract yet for plugin-specific destructive operations.
- Purge preflight metadata can be declared in manifest/settings, but no first-class framework UI/API
  currently surfaces row-count preflight previews before purge execution.

## Deferred after Phase 5

- Phase 6 remains deferred: lifecycle/regression/E2E expansion for Calendar conversion.

## Phase 6 behavior (implemented)

- Added focused regression coverage for Calendar plugin manifest and bundled registry contracts.
- Added deterministic generated plugin registry assertions for Calendar and URL shortener coexistence.
- Added regression coverage for Calendar lifecycle safety hooks to confirm disable/uninstall remain
  non-destructive and purge remains blocked when Calendar data exists.
- Added regression coverage for Calendar public API behavior (`/api/calendar/[slug]`) and booking API
  behavior (`/api/calendar/[slug]/bookings`) with current filesystem route ownership preserved.
- Added regression coverage for existing Calendar admin API auth guards across filesystem-owned
  admin routes.
- Added regression coverage proving plugin public-route metadata coexists with filesystem route
  ownership without claiming runtime Calendar paths.

## Phase 6 framework/testing gaps (current)

- Reliable Playwright-style UI E2E expansion for Calendar admin/public flows remains constrained by
  fixture orchestration complexity (admin auth/session bootstrapping plus mutable calendar datasets).
- Phase 6 uses stable unit/integration route-handler coverage instead of expanding flaky broad UI
  browser scenarios.

## Deferred after Phase 6

## Phase 7 behavior (implemented)

- Removed legacy direct core Calendar plugin definition ownership from `src/core/lib/plugins.ts`.
- Calendar ownership now resolves from bundled plugin metadata (`src/user/extensions/plugins/*`) via
  `getPluginDefinitions()`.
- Removed hardcoded Calendar/Gallery admin nav entries from `src/app/admin/AdminLayoutClient.tsx`.
- Admin nav now derives Calendar/Gallery entries from plugin metadata (`listPluginStates`
  `adminSurface` + navigation capability) and keeps existing href/label behavior.
- Existing filesystem-owned runtime routes remain in place for public/admin/API Calendar behavior.
- Existing non-destructive lifecycle semantics remain in place (disable/uninstall retain data,
  purge blocked when data exists).

## Phase 7 retained direct references (intentional)

- `src/core/lib/embeds/calendar.ts` remains the runtime Calendar embed implementation.
  Reason: bundled-plugin embed registration bridge is not first-class yet.
- `src/app/sitemap.xml/route.ts` retains direct Calendar sitemap DB wiring.
  Reason: bundled-plugin sitemap entry bridge is not first-class yet.
- `src/core/lib/reserved-routes.server.ts` retains `/calendar` reservation and
  `src/app/calendar/[slug]/page.tsx` remains filesystem-owned.
  Reason: plugin public-route adapter is metadata-only and intentionally non-claiming.
- Filesystem-owned admin/public/API Calendar route handlers remain runtime owners.
  Reason: no plugin-owned dispatcher replacement path exists yet that preserves current behavior.
- Shared migration `20260629010000_add_calendar_gallery_and_media_transforms` is retained as-is.
  Reason: Phase 7 does not copy/rerun/rename/split shared migration history.

## Phase 7 framework gaps (current)

- No first-class bundled-plugin embed registration contract bridge yet.
- No first-class bundled-plugin sitemap/navigation runtime entry bridge yet.
- Calendar public-route adapter remains declarative metadata because framework route-ownership
  migration path is not yet available without behavior risk.

## Issue #9 readiness checklist

- [x] Calendar bundled plugin manifest + ownership boundary established.
- [x] Lifecycle safety policies and hooks implemented (non-destructive disable/uninstall, gated purge).
- [x] Focused regression coverage added for plugin metadata/registry/lifecycle/public/admin routes.
- [x] Direct core Calendar plugin registration removed.
- [x] Hardcoded Calendar admin sidebar/nav wiring removed in favor of plugin metadata-driven nav.
- [ ] Runtime ownership migration for embeds/sitemap/public-route claiming (blocked on framework gaps).
- [ ] Full broad UI E2E expansion for Calendar conversion (deferred due fixture/auth orchestration).
