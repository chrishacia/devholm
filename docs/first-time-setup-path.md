# First-Time Setup Path

This guide is the full onboarding path for new DevHolm users, from first clone through production readiness.

It is written as a practical runbook with explicit checks at each stage.

## Stage 0: Prerequisites

Install and verify:

- Node.js 20+
- pnpm 10+
- Docker Desktop or a local PostgreSQL 16+
- Git

Sanity check:

- node -v
- pnpm -v
- docker --version

## Stage 1: Create Your Site Workspace

1. Clone and install

- git clone https://github.com/devholm/devholm.com.git my-site
- cd my-site
- pnpm install

2. Create local environment file

- cp .env.example .env

3. Fill minimum required values in .env

- database settings
- auth settings
- admin seed user values

Suggested minimum keys:

- DATABASE_HOST
- DATABASE_PORT
- DATABASE_NAME
- DATABASE_USER
- DATABASE_PASSWORD
- AUTH_SECRET
- AUTH_URL
- ADMIN_EMAIL
- ADMIN_PASSWORD
- ADMIN_NAME

Optional local port keys:

- PORT (for local server port)
- NEXT_PUBLIC_APP_URL (match PORT)
- AUTH_URL (match PORT)

Example local port setup:

- PORT=3001
- NEXT_PUBLIC_APP_URL=http://localhost:3001
- AUTH_URL=http://localhost:3001

Production note:

- Production port mapping is controlled by the `APP_PORT` GitHub Actions secret, not `.env`.

## Stage 2: Start Database And Bootstrap

Option A: Docker database

- docker compose up -d postgres

Option B: Local PostgreSQL

- createdb mysite_dev

Then initialize app data:

- pnpm db:setup
- pnpm seed:admin

Optional sample content:

- pnpm db:seed:demo

## Stage 3: Run And Verify Local App

Start app:

- pnpm dev

Check URLs:

- Site: http://localhost:3000
- Admin: http://localhost:3000/admin

Login with ADMIN_EMAIL and ADMIN_PASSWORD from .env.

## Stage 4: Make First Safe Customizations

Keep custom work in site-owned seams:

- devholm.config.ts
- src/user/content
- src/user/extensions
- src/user/views

Useful commands:

- pnpm devholm status
- pnpm devholm list:slots
- pnpm devholm eject about
- pnpm devholm new:extension my-feature
- pnpm devholm new:migration add_example_table
- pnpm devholm new:seed seed-example-data

Boundary rule:

- Avoid site-specific edits in src/core.
- Keep src/app changes thin and routing-focused unless an extension seam is impossible.

## Stage 5: Quality Gate Before First Push

Run full checks:

- pnpm typecheck
- pnpm test
- pnpm build

Optional boundary check against template baseline:

- pnpm devholm sync:check --against template/main

## Stage 6: Prepare CI/CD

Follow these guides in order:

1. [CI and Secrets Runbook](./ci-secrets-runbook.md)
2. [GitHub Secrets Setup](../GITHUB_SECRETS.md)
3. [Deployment Guide](../DEPLOYMENT.md)

At minimum, configure required repository secrets before deployment workflow runs.

## Stage 7: Production Readiness Checklist

Use this as your release gate:

- Domain DNS points to deploy host
- TLS certificates are available on host
- Nginx upstream matches resolved APP_PORT from DEPLOY_PATH/.devholm/deploy-state.env
- Required GitHub secrets all configured
- Deployment path exists and is writable by deploy user
- CI test and build jobs are green
- Health endpoint responds successfully after deployment
- Admin login works after deployment

## Stage 8: First Production Deployment

Typical flow:

1. Push validated code to main
2. Let GitHub Actions build and deploy
3. Confirm container and nginx are healthy on host
4. Verify critical routes and admin access

Post-deploy checks:

- Home, blog, projects, contact pages load
- API health endpoint returns expected version/build metadata
- Admin routes load and data writes succeed

## Stage 9: Ongoing Maintenance

Weekly:

- Pull latest changes
- Run local validation suite

Per framework release:

- Read upgrade notes
- Merge or rebase to latest baseline
- Run sync check and resolve out-of-bounds edits
- Re-run typecheck, test, build
- Deploy

## Companion References

- [Documentation Wiki](./wiki.md)
- [Getting Started](./getting-started.md)
- [Developer Guide](./developer-guide.md)
- [Upgrading](./upgrading.md)
