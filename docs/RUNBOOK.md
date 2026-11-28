# devholm runbook

Operational notes for this repo. Add deploy, backup and recovery steps here as they are documented.

## CI standard (Actions minutes)

Owner: Thor · DevOps. Set 2026-11-28 after Chris asked to stop spending money on Actions every month
(30-day audit: about 48.6k Linux minutes, roughly $365). Applies to every repo the same way:

1. **Full gate only on pull requests into `main`.** Docker builds, Playwright or e2e, coverage and heavy
   suites run there (and on manual `workflow_dispatch` where the repo has one), and nowhere else.
2. **Light CI on `release/*`.** Pull requests into `release/*` and pushes to `release/*` run lint and unit
   tests only. Heavy suites wait for the release PR into `main`.
3. **Cancel superseded runs on PR workflows only.** `concurrency` is keyed by workflow plus PR number with
   `cancel-in-progress` true only for `pull_request`. Never on pushes to `main` and never on deploy workflows.
4. **`retention-days: 3`** on every `upload-artifact`.
5. **No bare push triggers.** No `push: ['**']` and no `push:` without a branch list; push triggers name
   `main` and `release/**` (or tags) only.
6. **Required check names do not change.** If a job must not run on a path, keep the job and its `name:` and make
   it a fast no-op, because a skipped or missing required check blocks merges or releases. Do not rename jobs
   without reading branch protection / rulesets first.
7. **One run per change.** No reruns or run loops to hunt for green; fix, push once, look.

### devholm: what this repo does

- **Base:** `release/analytics-2026-11-28` (the active branch; open PR #160 targets it). It reaches `main` with the release PR.
- **Required checks on `main`** (ruleset *protect main branch*): **Lint & Type Check**, **Unit Tests**, **E2E Tests**. Job names are unchanged, and nothing here skips or renames them.
- `ci.yml` (**CI/CD Pipeline**) triggers are unchanged: PRs into `main` or `develop` and pushes to `main` or `develop`, with a docs-only `paths-ignore`. There is no PR or push trigger for `release/*`, so the full gate (Postgres integration, E2E with Playwright, Docker build) runs only for PRs into `main` and on pushes to `main`, never for release branches. Docker image build, push and the production deploy stay on `main` push or manual dispatch only. Do not add `release/**` triggers without a light-CI job split.
- New workflow-level concurrency, keyed by workflow plus PR number or SHA: superseded **PR** runs are cancelled, every `main` push runs to completion. The deploy job keeps its own non-cancelling `production-deploy-<repo>` group.
- Artifact retention 7 to 3 days (coverage report, Playwright report, security audit report); the one-day `build-output` artifact is already shorter.
- `release.yml` and `recover-admin.yml` are manual-dispatch only and untouched.

### Checking the standard

`actionlint` every workflow before pushing. Look at `gh run list` for the repo once a week; a workflow with
more than a few runs a day, a run over 10 minutes, or an artifact with more than 3 days of retention is a bug
to fix in the workflow, not something to rerun. Full policy lives in Thor's DevOps notes (Brain `Areas/DevOps/`).
