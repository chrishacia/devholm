# DevHolm Developer Guide

This guide explains how to work inside DevHolm without breaking the upgrade model.

## The core rule

DevHolm is designed so framework updates land in the framework layer, while your site continues to live in site-owned paths.

Use this split:

- `src/core/` is framework-owned.
- `src/user/` is site-owned.
- `src/app/` should stay thin and routing-focused.
- `devholm.config.ts` is the contract between framework and site.

If you need a new capability for a site, the first question should be: should DevHolm expose a new seam for this?

## Working model

### Framework-owned code

These are the files DevHolm can safely evolve upstream:

- `src/core/**`
- most of `src/app/**`
- framework scripts such as `scripts/devholm-cli.ts`
- shared database and seed wiring such as `knexfile.js`

Avoid editing these directly for site-specific behavior.

### Site-owned code

These are the places a downstream site should customize:

- `devholm.config.ts`
- `src/user/content/**`
- `src/user/extensions/**`
- `src/user/views/**`
- `src/user/extensions/db/migrations/**`
- `src/user/extensions/db/seeds/**`

If a site feature requires custom admin UI, custom API endpoints, custom migrations, or custom seeds, it should land here.

## Local development workflow

Typical daily loop:

```bash
pnpm install
pnpm db:setup
pnpm seed:admin
pnpm dev
```

Useful validation commands:

```bash
pnpm typecheck
pnpm test
pnpm build
```

## Database model

DevHolm separates seeds into explicit buckets:

- `bootstrap` seeds: framework-required baseline records
- `demo` seeds: optional sample content
- `user` seeds: site-owned content or operational data

Relevant commands:

```bash
pnpm db:migrate
pnpm db:seed
pnpm db:seed:bootstrap
pnpm db:seed:demo
pnpm db:seed:user
pnpm db:setup
```

Guidance:

- Put framework-required records in `src/core/db/seeds/bootstrap/`.
- Put generic sample content in `src/core/db/seeds/demo/`.
- Put real site data or operational site seeds in `src/user/extensions/db/seeds/`.

## Extension model

DevHolm supports several safe extension surfaces.

### Content changes

Use `src/user/content/` for About, Home, Now, and similar typed content.

### Slots

Use slots when you need to inject small UI pieces into core views without taking over the full page.

Start by finding available slots:

```bash
pnpm devholm list:slots
```

### View overrides

Use ejected views only when a slot is not enough.

```bash
pnpm devholm eject about
```

Once ejected, the view becomes site-owned and no longer auto-tracks upstream changes.

### Admin extensions

Put custom admin navigation and pages under `src/user/extensions/admin/`.

### API extensions

Put custom API handlers under `src/user/extensions/api/` and register them through the extension registry.

### Database extensions

Put site migrations and seeds under `src/user/extensions/db/`.

## CLI workflow

DevHolm ships with a CLI for common site tasks:

```bash
pnpm devholm status
pnpm devholm list:slots
pnpm devholm eject <view>
pnpm devholm new:extension <name>
pnpm devholm new:migration <name>
pnpm devholm new:seed <name>
```

Use the CLI to stay inside the framework conventions instead of inventing custom file shapes.

## How to decide where code belongs

Use this test:

- If the behavior should exist for every DevHolm site, it belongs in DevHolm.
- If the behavior is specific to one site, it belongs in `src/user/`.
- If a site-specific feature currently requires patching framework files, DevHolm probably needs a new extension seam.

## Upgrade-safe rules

To keep downstream upgrades boring:

- do not put site business logic in `src/core/`
- do not put site routing mechanics directly into `src/app/` when an extension seam should exist
- do not store real site data in core demo seeds
- prefer `src/user/` registrations over framework patches
- keep `devholm.config.ts` as the place where site wiring happens

## Deployment model

The production workflow is GitHub Actions driven.

- GitHub Actions builds and publishes the Docker image.
- The deploy job generates `docker-compose.override.yml` from repository secrets.
- The server runs the app container and points it at the host PostgreSQL instance.

Read these before first deployment:

- [Quick Start](./getting-started.md)
- [GitHub Secrets](../GITHUB_SECRETS.md)
- [Deployment](../DEPLOYMENT.md)

## GitHub Actions secrets

The deploy workflow expects these repository secrets:

- `PROJECT_NAME`
- `SITE_URL`
- `SITE_NAME`
- `DEPLOY_HOST`
- `DEPLOY_USER`
- `DEPLOY_KEY`
- `DEPLOY_PATH`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_DB`
- `NEXTAUTH_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

Optional:

- `APP_PORT`
- `CSRF_SECRET`

Important note:

- The workflow uses `NEXTAUTH_SECRET` and also maps it into `AUTH_SECRET` inside the generated production compose override.

## Recommended onboarding order for contributors

1. Read [Quick Start](./getting-started.md).
2. Read [Architecture](./architecture.md).
3. Read [Configuration](./configuration.md).
4. Read [Extensions](./extensions.md).
5. Read [GitHub Secrets](../GITHUB_SECRETS.md) and [Deployment](../DEPLOYMENT.md) if you are touching CI/CD.
