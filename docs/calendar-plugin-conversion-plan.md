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
