# Changelog

All notable changes to this project will be documented in this file.

## [2.0.0] - 2025-07-17

### BREAKING CHANGES

This release introduces the **DevHolm Framework Architecture** — a layered, extensible foundation that separates the framework engine from user customization. Direct imports from `src/components/*`, `src/lib/*`, `src/hooks/*`, `src/db/*`, `src/config/*`, `src/theme/*`, and `src/types/*` are no longer valid. All paths have moved under `src/core/`.

See [docs/migration-v1-to-v2.md](docs/migration-v1-to-v2.md) for the full upgrade guide.

### Features

- **Core/User architecture**: Engine lives in `src/core/`, user customizations in `src/user/` ([Phase 6](docs/migration-v1-to-v2.md))
- **Configuration contract**: `devholm.config.ts` at project root — single place to configure site metadata, navigation, theme, and extensions
- **View system**: All page UI extracted into `src/core/views/` — thin Next.js route files delegate rendering to typed view components
- **Extension slots**: `ExtensionSlot` component + `AdminExtension[]` type for injecting custom nav items and UI into admin panel without core edits
- **Dual DB migrations**: `knexfile.js` `migrations.directory` now supports an array — core migrations in `src/core/db/migrations/`, user migrations in `src/user/extensions/db/migrations/`
- **Content layer**: Static site content (bio, projects, uses, now) lives in `src/user/content/` as typed TypeScript modules
- **DevHolm CLI**: `pnpm devholm <command>` — eject views, scaffold extensions, list extension slots, inspect project status
- **Semantic versioning**: Conventional commits enforced via `commitlint`. `pnpm release` runs `release-it` to auto-determine version bump from commit history
- **Pinned dependencies**: All `package.json` entries use exact versions. `.npmrc` sets `save-exact=true` for future installs
- **Framework documentation**: `docs/` directory with architecture, configuration, extensions, CLI, getting-started, and upgrading guides

### Code Refactoring

- Moved `src/components/` → `src/core/components/`
- Moved `src/lib/` → `src/core/lib/` (merged with existing `resolveView.ts`)
- Moved `src/hooks/` → `src/core/hooks/`
- Moved `src/db/` → `src/core/db/`
- Moved `src/config/` → `src/core/config/`
- Moved `src/theme/` → `src/core/theme/`
- Moved `src/types/` → `src/core/types_app/` (DB models, API shapes)
- Added `src/core/types/` for framework types (`DevHolmConfig`, extension types, view types)
- All 80+ existing import paths preserved via `tsconfig.json` path alias overrides
- All `*PageClient.tsx` files deleted — logic now lives in typed view components

### Documentation

- Added `docs/architecture.md` — system design, layer responsibilities
- Added `docs/configuration.md` — `devholm.config.ts` reference
- Added `docs/extensions.md` — writing admin + DB extensions
- Added `docs/cli.md` — DevHolm CLI command reference
- Added `docs/getting-started.md` — bootstrapping a new instance
- Added `docs/upgrading.md` — general upgrade guidance
- Added `docs/migration-v1-to-v2.md` — step-by-step v1 → v2 migration guide

---

## [1.0.0] - 2025-01-01

Initial release — "Poetry Asylum".

- Next.js 15 App Router
- React 19 + TypeScript strict mode
- Material UI v6 theming
- PostgreSQL + Knex.js
- NextAuth v5 beta
- Blog, resume, projects, about, now, uses, contact pages
- Admin dashboard with analytics + telemetry
- Vitest unit tests + Playwright e2e
- Docker + nginx deployment
