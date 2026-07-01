# URL Shortener Plugin Phase 2 Foundation

## Ownership Boundary

DevHolm core provides generic plugin contracts, registries, and lifecycle services.

URL Shortener plugin owns its manifest, migrations, settings, public route extension, admin page extensions,
validation rules, repositories, and lifecycle hooks under:

- `src/user/extensions/plugins/url-shortener/`

Core modules do not import URL Shortener implementation paths directly.

## Directory Structure

- `manifest.ts`
- `index.ts`
- `constants.ts`
- `settings/`
- `public-routes/`
- `admin/`
- `repositories/`
- `services/`
- `validation/`
- `db/migrations/`
- `db/seeds/`
- `lifecycle/`
- `tests/`

## Settings Keys

- `plugin:url-shortener:enabled`
- `plugin:url-shortener:route-prefix`
- `plugin:url-shortener:public-creation-mode`
- `plugin:url-shortener:legacy-prefix-enabled`

Default prefix is `/s` and is treated as prefix-only (not `/s/:code`).

## Public Route Behavior

The plugin registers a single generic public route extension:

- Matches exactly one segment below configured prefix
- Examples with default prefix:
  - `/s/abc123` -> match
  - `/s/my-link` -> match
  - `/s` -> no match
  - `/s/abc/extra` -> no match
  - `/api/s/abc` -> no match

`match()` is side-effect-free and returns typed match state.
`handle()` returns `501 Not Implemented` in Phase 2.

## Database Tables

Plugin-owned migration creates:

- `u_url_shortener_links`
- `u_url_shortener_click_events`
- `u_url_shortener_daily_stats`
- `u_url_shortener_public_submissions`
- `u_url_shortener_audit_records`
- `u_url_shortener_prefix_aliases`

No foreign keys to core user tables are introduced.
Actor fields are snapshot-style (`*_type`, `*_id`, `*_label`).

## Privacy Expectations

Click event schema intentionally avoids raw IP storage.
Analytics fields support coarse categories and optional privacy hash.
Redirect handling and analytics collection are decoupled for future non-blocking behavior.

## Generic Lifecycle Integration

The plugin is registered through generic bundled plugin registry and manifest metadata.

- install: validate, migrate, defaults, `afterInstall`, then enable
- upgrade: validate, migrate, `afterUpgrade`, update version
- disable: disable runtime registration, preserve data
- uninstall: disable and mark uninstalled, preserve data by default
- purge: explicit destructive operation, plugin-owned purge hook

## Phase 2 Scope

Implemented now:

- Generic plugin manifest and registry foundation
- Generic plugin migration ownership and ledger tracking
- URL Shortener manifest and extension registration
- URL Shortener route prefix and input validation
- URL Shortener migration foundation tables
- URL Shortener admin route placeholders

Deferred to later phases:

- Production redirect resolution
- Link CRUD workflows and full admin UI
- Click ingestion and analytics dashboards
- Public submission form and review workflows
- Legacy prefix grace-period execution

## Registration Model

Runtime registration uses explicit bundled plugin registry:

- `src/user/extensions/plugins/registry.ts`
- `src/user/extensions/plugins/migration-registry.json`

This avoids runtime filesystem scanning in production standalone images while preserving plugin-local ownership.
