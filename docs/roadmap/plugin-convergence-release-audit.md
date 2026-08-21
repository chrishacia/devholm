# Plugin Convergence Release Audit

Status: active closeout record for Issues #104 and #92.

## Purpose

This audit closes the dependency-ordered plugin-convergence sequence without weakening the
completion doctrine. A successful workflow badge is supporting evidence, not proof by itself.
Every applicable contract must be exercised, the Docker image must bind to the exact source SHA,
and production must report that same SHA after deployment.

## Scope

The release boundary covers the canonical plugin configuration and resolver, verified artifacts,
deterministic registry generation, development and production build preparation, lifecycle and
recovery orchestration, first-party Calendar/Gallery/URL Shortener packages, Plugin Management,
marketplace presentation, migration reconciliation, and legacy-path decommissioning delivered by
Issues #93 through #103.

This audit does not introduce new plugin features or a second package architecture.

## Required evidence matrix

| Gate | Required proof | Authoritative source |
| --- | --- | --- |
| Dependency closure | Issues #93 through #103 closed as completed | GitHub issue state |
| Canonical resolution | config, compatibility, immutable identity, digest/signature/trust failure paths, deterministic registry, and production override rejection tests pass | unit and integration jobs |
| First-party packages | Calendar, Gallery, and URL Shortener resolve through canonical package/build contracts | unit, PostgreSQL, build, and E2E jobs |
| Lifecycle safety | install/update/enable/disable, migration gating, rollback, recovery, restart reconciliation, and fail-closed state tests pass | full PostgreSQL and runtime-gate job |
| Administrative truth | Plugin Management state/action/remediation contract and URL Shortener admin flows pass | unit and E2E jobs |
| Browser behavior | exact Firefox smoke, Chromium URL Shortener flow, and full Playwright matrix pass | E2E job |
| Production build | prepared plugin inputs and Next.js production build succeed | build job |
| Container provenance | Docker image builds and is labeled with the exact source SHA; registry digest is recorded | Docker job |
| Deployment | exact-SHA image becomes healthy; homepage, core route, plugin probe, and unknown-route behavior pass | deployment job and `/api/health` |
| Marketplace presentation | current `devholm-plugins` main SHA is successfully published and reachable | GitHub Pages workflow and live Pages endpoint |
| Security | repository production dependency policy passes; remaining advisories are explicitly recorded | Security Scan artifact/log |
| Final merged health | every applicable job is terminal-success on the exact merge SHA | post-merge `main` workflow |

## CI audit correction

The pre-closeout audit found that the job named `PostgreSQL Lifecycle & Runtime Gates` executed only
`plugin-lifecycle-postgres.integration.test.ts`. Eleven additional files matching
`postgres.integration.test.ts` were discovered by the unit run but skipped because that job did not
set the integration URL.

Issue #104 therefore adds `test:postgres:all:ci` and makes the dedicated PostgreSQL job run all
twelve PostgreSQL integration files serially before runtime gates. This converts the previously
implicit/skipped coverage into an explicit release gate and avoids cross-file database concurrency
from weakening deterministic proof.

## Documented exceptions and limits

- The URL Shortener's shared-state browser scenario remains intentionally Chromium-only. The exact
  Firefox smoke and complete browser matrix still run separately. The owner, rationale, exit
  condition, and evidence remain recorded in `docs/roadmap/baseline-failures.md`.
- The production security policy blocks high and critical production dependency advisories. Any
  lower-severity advisory present at the final boundary must be named in the Issue #104 closeout
  evidence rather than silently described as a clean audit.
- DevHolm does not claim OS-level plugin sandboxing, CPU quotas, or memory quotas unless separately
  implemented and proven.

## Closure procedure

1. Run the full PR workflow on the Issue #104 branch.
2. Resolve every failed, skipped-but-applicable, pending, flaky, or unknown gate.
3. Merge through the normal pull-request path.
4. Require terminal success for every applicable job on the exact merge SHA.
5. Confirm production `/api/health` reports the exact merge SHA and healthy state.
6. Confirm the marketplace Pages endpoint remains healthy.
7. Add exactly one evidence closeout comment and close Issue #104 as completed.
8. Add exactly one parent closeout comment and close Issue #92 as completed.

The final workflow URLs, image digest, merge SHA, deployed SHA, test counts, advisory disposition,
and marketplace deployment proof belong in the GitHub closeout comments because those values are
not authoritative until after merge.
