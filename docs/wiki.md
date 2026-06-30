# DevHolm Documentation Wiki

This is the central navigation page for DevHolm users and maintainers.

Use this page as your starting point whether you are evaluating DevHolm for the first time, building a site in local development, or preparing production deployment and CI/CD.

## How To Use This Wiki

Choose one of these tracks:

- First-time setup track: start from a clean machine and reach production readiness.
- Day-to-day development track: build features safely inside DevHolm boundaries.
- Platform and operations track: CI/CD, secrets, deployment, and maintenance.
- Upgrade track: absorb new framework releases with low conflict.

## Track 1: First-Time Setup To Production

1. [First-Time Setup Path](./first-time-setup-path.md)
2. [Getting Started](./getting-started.md)
3. [Developer Guide](./developer-guide.md)
4. [CI and Secrets Runbook](./ci-secrets-runbook.md)
5. [Deployment Guide](../DEPLOYMENT.md)

## Track 2: Build Features Safely

1. [Architecture](./architecture.md)
2. [Configuration](./configuration.md)
3. [Extensions](./extensions.md)
4. [Plugin Development Guide](./plugin-development.md)
5. [CLI](./cli.md)
6. [Downstream Boundaries](./downstream-boundaries.md)

## Track 3: Platform Operations

1. [CI and Secrets Runbook](./ci-secrets-runbook.md)
2. [GitHub Secrets Setup](../GITHUB_SECRETS.md)
3. [Deployment Guide](../DEPLOYMENT.md)
4. [Admin Triggered Updates Strategy](./admin-triggered-updates-strategy.md)

## Track 4: Framework Evolution And Upgrade

1. [Upgrading](./upgrading.md)
2. [Framework Packaging Roadmap](./framework-packaging-roadmap.md)
3. [Migration v1 to v2](./migration-v1-to-v2.md)

## Canonical Workflow Checklists

Use these lightweight checklists as an operational standard.

### Local Development Checklist

- Clone repository
- Create .env from .env.example
- Start database
- Run db setup and admin seed
- Run dev server
- Validate with typecheck, test, and build

### Production Readiness Checklist

- Required GitHub repository secrets created
- Deployment host and path prepared
- SSH key pair configured for workflow deployment
- Nginx and TLS configured on server
- CI pipeline green on main
- Health endpoint returns expected version and build sha

### Upgrade Readiness Checklist

- Site customizations live in src/user and devholm.config.ts
- sync:check passes against template baseline
- Allowlist contains only intentional exceptions
- Test, typecheck, and build all green before deployment

## For Future Docs-As-Content Implementation

If DevHolm docs are later surfaced inside a site-admin or public docs app, this wiki can become the navigation source.

Recommended next step:

- Treat each markdown file in docs as a content node with metadata fields for category, audience, and stage.
- Generate sidebar and breadcrumbs from this index page and section headings.

See [Docs Information Architecture](./docs-information-architecture.md) for the proposed wiki metadata model and migration plan.
