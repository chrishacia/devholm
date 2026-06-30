# Admin-Triggered Updates Strategy (Future)

This document outlines a future path to trigger framework updates from an admin UI while preserving the build-time deployment model used by DevHolm.

## Constraint

DevHolm is not a runtime PHP-like app. Updates require source control operations, CI build, image publish, and deployment.

## Near-term posture

Use admin UI for visibility and orchestration, not direct mutation of running code.

## Recommended architecture

1. Add an Update Status service in the app:

- reads current version/build metadata
- queries latest template release metadata
- reports update availability in admin

2. Add a deployment orchestration endpoint:

- authenticated admin action triggers a webhook to CI/CD
- webhook payload references target template tag/commit
- CI performs merge/rebase in a controlled branch and runs checks

3. Keep merge logic in CI, not in app runtime:

- run boundary checks
- run migrations in dry-run/check mode
- run tests/build
- require approval for production deploy

4. Add a rollback and audit model:

- track requested-by, target version, started-at, completed-at
- retain deploy artifacts and rollback target

## Prerequisites implemented now

- Baseline-aware sync checker (`pnpm devholm sync:check --against <ref>`)
- Clear downstream boundary policy
- Extension-first customization model

## Suggested phased implementation

### Phase A: Read-only Update Center

- Admin page shows:
  - current app version
  - current commit SHA (short)
  - latest template release/tag
  - compatibility notes and migration warnings

### Phase B: One-click "Prepare Update"

- Admin action opens a CI workflow dispatch.
- CI creates a candidate branch and posts a status report.

### Phase C: Approved Deploy

- Authorized approver confirms deploy from candidate branch.
- CI builds, runs migrations, and deploys.

## Security requirements

- Require admin role plus explicit deploy permission.
- Use signed webhooks/tokens for CI trigger endpoints.
- Never allow arbitrary git command execution from user input.
- Record all update actions in audit logs.
