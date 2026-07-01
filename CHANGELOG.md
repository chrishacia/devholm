# Changelog

All notable changes to this project will be documented in this file.

## 3.4.2 (2026-07-01)

### Bug Fixes

- **admin:** persist project drag order and image drop upload ([28c992a](https://github.com/chrishacia/devholm/commit/28c992ab4552ed49806e79e7bc473fca52a51f65))

## [3.4.1](https://github.com/chrishacia/devholm/compare/v3.4.0...v3.4.1) (2026-06-30)

### Code Refactoring

- **admin:** improve updates UI messaging and token UX ([f6a36d7](https://github.com/chrishacia/devholm/commit/f6a36d726e5a82848ad211acf3f75d0312fb4f9a))

## [3.4.0](https://github.com/chrishacia/devholm/compare/v3.3.0...v3.4.0) (2026-06-30)

### Features

- **admin:** add DB-backed PAT setup for update automation ([dc4d2e3](https://github.com/chrishacia/devholm/commit/dc4d2e387fa8f52449710892477dda6593832598))

## [3.3.0](https://github.com/chrishacia/devholm/compare/v3.2.0...v3.3.0) (2026-06-30)

### Features

- **admin:** add one-click update trigger and run monitor ([d4e946d](https://github.com/chrishacia/devholm/commit/d4e946dd73843091bde6f207bb0152a42f9d6097))

## [3.2.0](https://github.com/chrishacia/devholm/compare/v3.1.3...v3.2.0) (2026-06-30)

### Features

- **admin:** simplify updates dashboard UX ([1d8a7a0](https://github.com/chrishacia/devholm/commit/1d8a7a0ffaf46ff35e7d0bf3ac03a794075cfedf))

## [3.1.3](https://github.com/chrishacia/devholm/compare/v3.1.2...v3.1.3) (2026-06-30)

### Bug Fixes

- **admin:** surface framework version in deploy + footer ([ef5037f](https://github.com/chrishacia/devholm/commit/ef5037f68f21a3e1412034ea3664a1ed9b5bbdaf))

## [3.1.2](https://github.com/chrishacia/devholm/compare/v3.1.1...v3.1.2) (2026-06-30)

### Bug Fixes

- **updates:** compare explicit framework version only ([668d791](https://github.com/chrishacia/devholm/commit/668d7917fda6d12d0b55092d9d0a29401b9f89e1))

## [3.1.1](https://github.com/chrishacia/devholm/compare/v3.1.0...v3.1.1) (2026-06-30)

### Bug Fixes

- **cms:** avoid function sx in catch-all pages ([d436927](https://github.com/chrishacia/devholm/commit/d436927d5fc7e427fee793096504277249d73179))

## [3.1.0](https://github.com/chrishacia/devholm/compare/v3.0.1...v3.1.0) (2026-06-30)

### Features

- **admin:** add project reordering ([17880d2](https://github.com/chrishacia/devholm/commit/17880d27c507a69e9714e39cf3be9de464b33648))

## [3.0.1](https://github.com/chrishacia/devholm/compare/v3.0.0...v3.0.1) (2026-06-30)

### Bug Fixes

- **ci:** deploy release commits automatically ([ff147a4](https://github.com/chrishacia/devholm/commit/ff147a48f6a9bcf2a289996b365358ae6c383470))
- **ci:** serialize production deploy jobs ([7e7a79e](https://github.com/chrishacia/devholm/commit/7e7a79e5824fae6cc2d0c9fb0d15b6f19a992e28))

## 3.0.0 (2026-06-30)

### ⚠ BREAKING CHANGES

- src/components, src/lib, src/hooks, src/db, src/config,
  src/theme, src/types all moved to src/core/. User customizations now live
  in src/user/. Thin app/ routing delegates to src/core/views/.

* Add core/user layer separation (8-phase refactor)
* Add devholm.config.ts configuration contract
* Add src/core/views/ typed view components (all PageClient files removed)
* Add admin extension system (ExtensionSlot, AdminExtension type)
* Add dual DB migrations (core + user directories)
* Add src/user/content/ typed content modules
* Add scripts/devholm-cli.ts (eject, new:extension, new:migration, status)
* Update tsconfig/vitest path aliases to resolve src/core/\* correctly
* Update knexfile.js migrations.directory to array

### Features

- add database-driven Uses page with admin management ([2e8bd64](https://github.com/chrishacia/devholm/commit/2e8bd641cb4f57357c7e1224865e1f33bdaa0ced))
- add pages system and plugin foundations with docs ([025c1f8](https://github.com/chrishacia/devholm/commit/025c1f86af82ef151d905403ca552161b344e898))
- add plugin management and runtime toggles ([f6c8b6f](https://github.com/chrishacia/devholm/commit/f6c8b6fb390a90e846d5d61b3264d499a89cf52e))
- add telemetry ping on container startup ([c547939](https://github.com/chrishacia/devholm/commit/c5479393dce5f52bc0adea53fcfe320f658730e6))
- add update center, sync policy checks, and wiki onboarding docs ([d90796c](https://github.com/chrishacia/devholm/commit/d90796c4e5950870216ecf13cc271c6804cb5177))
- **admin:** expose app version as build-time env var ([299753a](https://github.com/chrishacia/devholm/commit/299753a45b450ec29f4eb1082ccec21c28edf02c))
- **analytics:** v2 — sessions, rollups, enhanced dashboard ([c4c7ae7](https://github.com/chrishacia/devholm/commit/c4c7ae77606dbd36b1a00d42435dd1a6efa2d200))
- **auth:** harden admin recovery and add credentials toggle ([7e4ca49](https://github.com/chrishacia/devholm/commit/7e4ca49b64ceb116d474e3c7d598e9dbed4ba321))
- **automation:** add secure agent APIs for posts and inbox ([f3061ec](https://github.com/chrishacia/devholm/commit/f3061ec0817f01edda7ffe9be4e7645b9ab8c7fc))
- centralize upload limits and wire MediaBrowser into admin editors ([b68f8af](https://github.com/chrishacia/devholm/commit/b68f8afc714b0aad1b44fe1a633eea908296358b))
- **ci:** automate semantic releases and private update checks ([ec7b0bd](https://github.com/chrishacia/devholm/commit/ec7b0bd23558636d7e43559bfe1a6932ab33a9a4))
- **core:** formalize extension and seed seams ([1b2fa60](https://github.com/chrishacia/devholm/commit/1b2fa607eb58e2b7f65fb89dcf57ca25b20064c6))
- devholm logo footer ([06f8df3](https://github.com/chrishacia/devholm/commit/06f8df3a3e14d86ee5019e988292ac04cd51b3f9))
- introduce DevHolm v2 framework architecture ([de65aa9](https://github.com/chrishacia/devholm/commit/de65aa9299252de56408be432c7893646e0e2a70))
- resume and project admin ([85ce4fa](https://github.com/chrishacia/devholm/commit/85ce4fa30b9c0de38cd5e20ac0f6e335e6ce1159))
- **seo:** ship framework-wide SEO system and dynamic crawler endpoints ([1b433a3](https://github.com/chrishacia/devholm/commit/1b433a3062d1ab590ec91767df63b876b4ca3c49))
- taking a SSR first approach at rendering ([2f347a3](https://github.com/chrishacia/devholm/commit/2f347a3288ba0868e8df3d7bd9b3e102292d7c9a))

### Bug Fixes

- add error handling to deploy script - fail CI if container doesn't start ([f39aaa1](https://github.com/chrishacia/devholm/commit/f39aaa1468e4e57fa81155b93bb0de2290bbe3b7))
- add global-error.tsx to prevent \_global-error prerender failure ([03a3818](https://github.com/chrishacia/devholm/commit/03a38187babf819c425d80934cc71f1e836328fe))
- **admin:** wrap profile page in Suspense for useSearchParams ([414b632](https://github.com/chrishacia/devholm/commit/414b632945cde31792abeee72325c6f202ca72eb))
- allow workflow_dispatch for docker and deploy jobs ([e104ad3](https://github.com/chrishacia/devholm/commit/e104ad369e1321e86b3894d13800aa92d7253126))
- **analytics:** coerce null referrer URLs and use MUI Theme type ([a668ab6](https://github.com/chrishacia/devholm/commit/a668ab6efa35324a1a8b28b91549f3bdbc14e0de))
- **api:** harden automation agent security controls ([09c80f2](https://github.com/chrishacia/devholm/commit/09c80f28e61a20e47cdbf648a1575de24cb7a429))
- **auth): safe fallback on config error; fix(pnpm:** add allowBuilds to workspace yaml ([2f49ceb](https://github.com/chrishacia/devholm/commit/2f49cebf4b5b2e8b83713b20dc3d5994f1d89e1d))
- **auth:** prevent server crash and run migrations in production ([1bee830](https://github.com/chrishacia/devholm/commit/1bee830c2748c789fa4640725ecaf790c28fcf3a))
- **auth:** stabilize login, oauth email handling, and monitoring ([e97aa08](https://github.com/chrishacia/devholm/commit/e97aa084f16b0869e5e3d821a02646f47020cec1))
- **auth:** stop admin login self-redirect loop ([fb2e75f](https://github.com/chrishacia/devholm/commit/fb2e75f4ecb3c7f50a7fdcf4ed6d388413d931d5))
- **auth:** wrap admin login search params in suspense ([e22217a](https://github.com/chrishacia/devholm/commit/e22217a1c74215656cb35efc1fccc3087cba6237))
- **ci:** add deploy verification diagnostics ([3d8af97](https://github.com/chrishacia/devholm/commit/3d8af974b4622b4b6ab3401eb4e38df7d118f057))
- **ci:** also pass strict-dep-builds=false to pnpm deploy stage ([9f800e1](https://github.com/chrishacia/devholm/commit/9f800e115c295457feb69d056f42b39762469bb5))
- **ci:** avoid nested heredoc parsing in deploy port resolver ([4ddf131](https://github.com/chrishacia/devholm/commit/4ddf1319150e37d34e7215c89360c5937b150d2e))
- **ci:** clean warnings and configure release git identity ([ca6269e](https://github.com/chrishacia/devholm/commit/ca6269eaf3277541a90e8ea90eefd3bfe2703dca))
- **ci:** disable husky in Docker, approve build scripts, skip pnpm dep verify ([f39d880](https://github.com/chrishacia/devholm/commit/f39d8809d763402e4abaf3f7736bbfef1fbdcbe7))
- **ci:** disable pnpm strict-dep-builds so Docker install does not error on unapproved scripts ([64054f3](https://github.com/chrishacia/devholm/commit/64054f383ff821c411bbe0b41cf88fa850f60f0f))
- **ci:** harden deploy workflow against url and port drift ([32e4ca4](https://github.com/chrishacia/devholm/commit/32e4ca48cf6841e58878f737676f24667998b5ea))
- **ci:** pass --config.strict-dep-builds=false to pnpm install in Docker ([15035f5](https://github.com/chrishacia/devholm/commit/15035f55545e7b49d63f56294247f79ea1dff646))
- **ci:** pin pnpm to 11.2.2 and add onlyBuiltDependencies to package.json ([6f69f00](https://github.com/chrishacia/devholm/commit/6f69f009990d1ae6f19197d21be2ea06bb0252a3))
- **ci:** prune docker artifacts before deploy pull ([28c7f64](https://github.com/chrishacia/devholm/commit/28c7f64af6d7424755a3caf9a38c560b00db0bbb))
- **ci:** require unique APP_PORT and prevent deploy port collisions ([aa0551f](https://github.com/chrishacia/devholm/commit/aa0551f76a504bee48a2f1c00bf65727c263d460))
- **ci:** retry health check up to 10x instead of single attempt ([a8f99e9](https://github.com/chrishacia/devholm/commit/a8f99e92be50f5bc3ea34b575dc43258f18d1264))
- **core:** harden upgrade seams for downstream forks ([e5abe3e](https://github.com/chrishacia/devholm/commit/e5abe3e2b09bbe4ab129fad680db6054e4154475))
- **db:** update stale src/db paths to src/core/db after framework rename ([2aaac44](https://github.com/chrishacia/devholm/commit/2aaac44979e857613bc0376677c16cf21953d25c))
- force NODE_ENV=production in build script ([11d21df](https://github.com/chrishacia/devholm/commit/11d21dfd8ba733dcba30c963f66cc764f574d60a))
- harden resume and analytics boundaries ([3f9f0e2](https://github.com/chrishacia/devholm/commit/3f9f0e2b53618c73487450a633dc88989499980e))
- improve admin form and updates ux ([0660ed7](https://github.com/chrishacia/devholm/commit/0660ed761e8a9a54ae8082451e6860943ad93fee))
- make APP_PORT configurable via secret (defaults to 3000) ([a29c297](https://github.com/chrishacia/devholm/commit/a29c2973bc9a94eebd2bd3f2075dc77819c47d48))
- **prod:** restore ts migrations and correct admin seeding schema ([8ffe6a8](https://github.com/chrishacia/devholm/commit/8ffe6a8518cab06cf66148def6867e09bec7e82c))
- remove ports from base docker-compose.yml to prevent merge conflicts ([2958734](https://github.com/chrishacia/devholm/commit/29587343a98e6e3bffe31e06dedb8d17bc6ce977))
- remove secrets reference from environment url ([a5bb00d](https://github.com/chrishacia/devholm/commit/a5bb00d722f2aa3d4be75cc5a4aebcb3e22cbc48))
- replace require() with dynamic import() for ESLint compliance ([1ac94ec](https://github.com/chrishacia/devholm/commit/1ac94ec1178670bb638805d3aeaf4ab59f214921))
- **test:** stabilize update status warning assertion in ci ([af49858](https://github.com/chrishacia/devholm/commit/af498589e43641a223bb7fda13e9f5453dec76db))
- **theme:** honor devholm config theme override ([3b624eb](https://github.com/chrishacia/devholm/commit/3b624ebdd25df4b8d3e0704339eda6fa6eb49daf))
- use Person icon as avatar fallback instead of initials letter ([a438143](https://github.com/chrishacia/devholm/commit/a4381431d9b670b4b65388d56a2d01d8b4ed733c))
- **version:** surface build metadata and scope version stamping to devholm ([b0a657f](https://github.com/chrishacia/devholm/commit/b0a657f29956984e04ec6a3427a25ff331c7c394))

### Documentation

- add ANALYTICS.md system documentation ([0b917ba](https://github.com/chrishacia/devholm/commit/0b917ba2d38cff15bab1565b16b7db09bd85d653))
- add APP_PORT documentation for multi-site deployments ([86e9226](https://github.com/chrishacia/devholm/commit/86e9226b8e864e5ec6cae4fc8940423c4294c1f2))
- add LICENSE file with MIT license and third-party acknowledgments ([b577b79](https://github.com/chrishacia/devholm/commit/b577b794501cca8b7812acf1bff4a7a7580e76b8))
- add note about GitHub Actions pricing for private repos ([9bd4c55](https://github.com/chrishacia/devholm/commit/9bd4c55562bfd7043db65be37853e1432368603e))
- add onboarding and developer guides ([9d23482](https://github.com/chrishacia/devholm/commit/9d23482e521dc22fb534f534a1750187094b7920))
- clarify local .env PORT vs production APP_PORT ([3e138d8](https://github.com/chrishacia/devholm/commit/3e138d8940632b524ffc0c93fccdf433b0dc5519))

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
