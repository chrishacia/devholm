# DevHolm Quick Start

This guide gets a new DevHolm site running locally and points you to the docs you need for deployment.

For the complete onboarding runbook from first clone to production readiness, start with [First-Time Setup Path](./first-time-setup-path.md).

## Prerequisites

- Node.js 20+
- pnpm 10+
- PostgreSQL 16+ locally, or Docker with `docker compose`

## 1. Clone and install

```bash
git clone https://github.com/devholm/devholm.com.git my-site
cd my-site
pnpm install
```

## 2. Create your local environment file

```bash
cp .env.example .env
```

At minimum, set these values in `.env`:

```env
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=mysite_dev
DATABASE_USER=postgres
DATABASE_PASSWORD=postgres

AUTH_SECRET=replace-this-for-local-dev
AUTH_URL=http://localhost:3000

ADMIN_EMAIL=admin@localhost.com
ADMIN_PASSWORD=change-me
ADMIN_NAME=Admin
```

Notes:

- `AUTH_SECRET` is the local auth secret used by the app.
- `AUTH_URL` should be your local app URL.
- `ADMIN_*` values are used by `pnpm seed:admin`.

Local port note:

- If you want to run locally on a non-default port, set `PORT` in `.env` and update both `AUTH_URL` and `NEXT_PUBLIC_APP_URL` to match.
- Example for port 3001:

```env
PORT=3001
AUTH_URL=http://localhost:3001
NEXT_PUBLIC_APP_URL=http://localhost:3001
```

- `APP_PORT` is different: it is a production deploy secret used by CI/CD for Docker host port mapping.

## 3. Start PostgreSQL

### Option A: local PostgreSQL

Create a database that matches your `.env` values.

```bash
createdb mysite_dev
```

### Option B: Docker PostgreSQL

If you want a disposable local database, start only the database service:

```bash
docker compose up -d postgres
```

## 4. Apply the database setup

For a clean local install, run:

```bash
pnpm db:setup
pnpm seed:admin
```

What this does:

- `pnpm db:setup` runs all migrations and the core bootstrap seeds.
- `pnpm seed:admin` creates your admin user from `.env`.

Optional demo content:

```bash
pnpm db:seed:demo
```

Use this if you want sample posts, tags, and other framework demo data in your local environment.

## 5. Start the app

```bash
pnpm dev
```

Open:

- Site: `http://localhost:3000`
- Admin: `http://localhost:3000/admin`

Log in with the `ADMIN_EMAIL` and `ADMIN_PASSWORD` values from `.env`.

## 6. Make your first customizations

Start in these places:

- `devholm.config.ts` for framework wiring
- `src/user/content/` for your site narrative content
- `src/user/extensions/` for site-owned features

Useful first commands:

```bash
pnpm devholm status
pnpm devholm list:slots
pnpm devholm eject about
pnpm devholm new:extension my-feature
pnpm devholm new:migration add_example_table
pnpm devholm new:seed seed-example-data
```

## 7. Validate before you commit

```bash
pnpm typecheck
pnpm test
pnpm build
```

## 8. Prepare for deployment

When you are ready to deploy with GitHub Actions:

1. Read [GITHUB_SECRETS.md](../GITHUB_SECRETS.md) and create the required repository secrets.
2. Read [DEPLOYMENT.md](../DEPLOYMENT.md) and prepare the target server.
3. Push to `main` once your secrets and server are ready.

## Next docs

- [Documentation Wiki](./wiki.md)
- [First-Time Setup Path](./first-time-setup-path.md)
- [CI and Secrets Runbook](./ci-secrets-runbook.md)
- [Developer Guide](./developer-guide.md)
- [Architecture](./architecture.md)
- [Configuration](./configuration.md)
- [Extensions](./extensions.md)
- [CLI](./cli.md)
- [Upgrading](./upgrading.md)
