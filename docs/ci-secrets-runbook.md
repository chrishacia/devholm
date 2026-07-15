# CI and Secrets Runbook

This runbook is for first-time DevHolm operators setting up GitHub Actions deployment securely.

Use it with:

- [GitHub Secrets Setup](../GITHUB_SECRETS.md)
- [Deployment Guide](../DEPLOYMENT.md)

## Goal

Reach a state where:

- CI validates each change with test and build checks.
- Deploy workflow can connect to your server through SSH.
- Production environment is configured only from repository secrets.

## Step 1: Confirm Workflow Is Present

Verify file exists:

- .github/workflows/ci.yml

Validate expected jobs:

- lint or type checks
- tests
- production build
- deploy (typically on main)

## Step 2: Generate Secure Values

Run locally:

- openssl rand -base64 32 for NEXTAUTH_SECRET
- openssl rand -base64 24 for POSTGRES_PASSWORD
- openssl rand -base64 16 for ADMIN_PASSWORD seed value

Generate deploy key pair:

- ssh-keygen -t ed25519 -C github-actions-deploy -f ~/.ssh/deploy_key -N ""

Add public key to server deploy user authorized_keys.

## Step 3: Configure Required Repository Secrets

In GitHub repo settings, add all required keys:

Project identity:

- PROJECT_NAME
- SITE_URL
- SITE_NAME

Server connection:

- DEPLOY_HOST
- DEPLOY_USER
- DEPLOY_KEY
- DEPLOY_PATH

Database:

- POSTGRES_USER
- POSTGRES_PASSWORD
- POSTGRES_DB

Authentication:

- NEXTAUTH_SECRET
- ADMIN_EMAIL
- ADMIN_PASSWORD

Optional but common:

- APP_PORT
- CSRF_SECRET

## Step 4: Prepare Target Host

On server:

- Docker Engine and Docker Compose installed
- deployment directory exists at DEPLOY_PATH
- nginx configured for SITE_URL hostnames
- TLS certificate provisioned
- upstream proxy port matches resolved APP_PORT (from DEPLOY_PATH/.devholm/deploy-state.env)

First-install behavior:

- `APP_PORT` secret is optional and treated as a preferred port hint.
- If the requested port is unavailable, deploy auto-selects a free host port in `3000-3999`.
- The resolved port is persisted for future deploys so updates do not rewire existing sites.

## Step 5: Dry Run Validation

Before first production deploy, validate locally:

- pnpm typecheck
- pnpm test
- pnpm build

Push branch and verify CI status on pull request.

## Step 6: First Deployment Execution

Merge to main and watch CI workflow:

1. Build image succeeds
2. Deploy step connects to host over SSH
3. Compose services start successfully
4. Migrations run (if configured in deploy flow)

## Step 7: Post-Deploy Verification

Check:

- public site loads over HTTPS
- admin login works
- API health endpoint returns healthy payload
- expected app version and build sha are visible

## Step 8: Incident Recovery Basics

If deploy fails:

1. Inspect workflow logs in Actions
2. Confirm secret names and values are not malformed
3. Confirm server disk, docker daemon, and compose state
4. Re-run workflow only after root cause is corrected

If admin password is lost, use one-off reset procedure from [GitHub Secrets Setup](../GITHUB_SECRETS.md).

## Security Operating Rules

- Never commit credentials into repository files.
- Rotate secrets every 6 to 12 months.
- Use dedicated deploy SSH key, not personal keys.
- Restrict deploy workflow to protected branch.
- Require pull request checks before merge.

## Security Scan Gate

CI security scan policy is enforced through the repository-owned command:

- `pnpm audit:prod`

Implementation notes:

- command executes `pnpm audit --prod --json` through `scripts/security-audit-prod.ts`
- policy fails when production dependency vulnerabilities include any `high` or `critical`
- scanner/tooling failures are treated as hard failures (fail-closed) and are distinct from policy failures
- low/moderate findings are reported in logs but do not fail the gate
- CI Security Scan pins pnpm `11.2.2` for this job to avoid retired v10 audit endpoint behavior

Operational check:

- if Security Scan fails with scanner errors, treat downstream skipped build/e2e/deploy jobs as incomplete evidence and resolve the scanner failure before closing feature work

## Recommended Automation Hardening

- Enable branch protection on main.
- Require CI checks before merge.
- Require at least one reviewer.
- Consider GitHub environments with manual approval for production deploy.

## Related Docs

- [Documentation Wiki](./wiki.md)
- [First-Time Setup Path](./first-time-setup-path.md)
- [Getting Started](./getting-started.md)
- [Developer Guide](./developer-guide.md)
- [Deployment Guide](../DEPLOYMENT.md)
