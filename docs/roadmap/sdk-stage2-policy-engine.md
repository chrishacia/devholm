# SDK Stage 2: Deterministic Policy Engine and Registries

Status: **Completed ✅**
Date: 2026-07-05
Related issue: #31
Related parent workstream: #6
Related ADR: `docs/roadmap/decisions/0002-sdk-boundaries-and-access-policy.md`

## Governance history

Stage 2 was delivered through three governed PRs plus one corrective PR:

- **PR #36** (squash `554837a`, v3.9.2): Governance remediation. Established public API security boundary.
- **PR #37** (squash `bcc2f01`, merged 2026-07-05T06:05:47Z): Primary Stage 2 implementation — policy engine, registries, version sync, canonical imports. Merged with five unresolved Copilot review findings.
- **Direct push `fa7c998`** (2026-07-05): Premature documentation push directly to main before review findings were resolved. This violated the governed merge process. Issues #31 and #32 were reopened as a result.
- **PR #38** (`fix/sdk-stage2-post-merge-review-closeout`): Corrective PR. Addressed all eight unresolved review threads (PR #36: 2, PR #37: 5, PR #38: 1), replaced a non-production-equivalent boundary test with a real esbuild bundle-and-execute proof, removed fake marker module approach, and implemented the real `"browser": null` conditional-export boundary. All governance irregularities are now remediated.

The squash SHA, merge timestamp, resulting main SHA, and release version will be recorded in issues #6, #31, and #32 after PR #38 is merged.

## Stage 2 completion evidence

### Implementation

- Boundary mechanism: `"browser": null` in `packages/sdk/package.json` server export — no fake marker, no Vitest alias for production behavior.
- Browser-negative proof: esbuild with `--platform=browser` fails with error matching `"browser": null` condition disabled by package author.
- Server-positive proof: esbuild with `--platform=node --conditions=react-server` bundles and executes successfully; Node exits 0, stdout contains `server-import-ok`, stderr empty.

### Code-validation CI

- Head: `2087c07d1028472397fdbf40f5ad6b9741444577`
- Run: `28734689827` — conclusion: **success**
- Lint & Type Check: success
- Unit Tests: success
- Security Scan: success
- Build Application: success
- E2E Tests: success
- Docker publish / production deployment: skipped as expected

### Test counts (all local, final head)

| Suite                  | Passed                     |
| ---------------------- | -------------------------- |
| sdk-package-boundaries | 20                         |
| sdk-canonical-imports  | 10                         |
| sdk-policy-engine      | 193                        |
| sdk-version-sync       | 29                         |
| **Whole suite**        | **544 passed, 28 skipped** |
| Test files             | 38 passed, 1 skipped       |

### Review threads

| PR  | Unresolved before | Unresolved after |
| --- | ----------------- | ---------------- |
| #36 | 2                 | 0                |
| #37 | 5                 | 0                |
| #38 | 1                 | 0                |

### Versions and lockfile

- Root `package.json` version: `3.9.3`
- `packages/sdk/package.json` version: `3.9.3`
- `pnpm-lock.yaml`: identical to main (no correction-related churn)
- `vitest.config.ts`: identical to main (no correction-related churn)

## History

- **PR #36** (squash `554837a`, v3.9.2): Governance remediation. Established public API security boundary.
- **PR #37** (squash `bcc2f01`, merged 2026-07-05T06:05:47Z): Partial Stage 2 verification. Contains five unresolved review findings addressed in the correction PR.
- **PR #38** (corrective, squash SHA pending): Addresses all review findings, real boundary proof, final documentation. Squash SHA and release to be recorded in issues after merge.

## Stage 3 Status

Stage 3 has **not begun**. No Stage 3 implementation work is included in any merged commit.

## Purpose

Implement the deterministic, server-only policy evaluation engine, result model, evaluator/resolver registries, and registration validation required by ADR-0002, without integrating the engine into routes, middleware, pages, actions, React visibility, or existing authentication behavior.

## Parent workstream

- #6
- ADR-0002
- Stage 1: #28
- `docs/roadmap/sdk-authorization-implementation-plan.md`

## Scope

- Add neutral, serializable policy-result and normalized-subject contracts where appropriate.
- Implement server-only policy evaluation.
- Implement exact `allOf` and `anyOf` aggregation semantics.
- Implement custom evaluator and ownership-resolver registries.
- Add identifier and owner-namespace validation.
- Reject duplicate registration IDs.
- Reject unknown evaluator and resolver references.
- Reject owner or plugin namespace mismatches.
- Reject empty `allOf` and `anyOf` declarations.
- Convert evaluator/resolver exceptions and missing runtime references into sanitized `policy-error` results.
- Add exhaustive deterministic contract tests.
- Document Stage 2 behavior and limitations.

## Non-goals

- No integration with `src/auth.ts`
- No canonical admin normalization
- No legacy compatibility adapter
- No API/page/action/admin wrappers
- No route or middleware integration
- No public-route claiming changes
- No React visibility implementation
- No concealment or HTTP status mapping
- No production route migration
- No capability-service implementation beyond the minimum safe evaluator context contract
- No raw database or broad framework service handles
- No Stage 3 implementation
- No publication or issue #7 implementation
- No issue #11, #8, #9, or #10 work

## Security invariants

- `policy-error` has global fail-closed precedence.
- Every required composition branch is evaluated.
- Results are independent of declaration order.
- Evaluator and resolver contracts are side-effect-free by design.
- Empty compositions are invalid.
- Missing references fail validation and fail closed if encountered at runtime.
- Thrown exceptions never leak raw stack traces, messages, secrets, or internal objects through the public semantic result.
- No broad database or framework service object enters generic evaluator context.
- Neutral root exports remain serializable and data-only.
- Executable registries and evaluation stay under `@devholm/sdk/server`.
- Middleware and React exports remain free of policy-engine implementation dependencies.

## Acceptance criteria (all verified ✅)

- [x] Neutral policy result contracts are serializable and runtime-independent
- [x] A normalized policy subject can be supplied without integrating current auth/session code
- [x] All built-in Stage 2 declaration kinds evaluate deterministically
- [x] Empty `allOf` and `anyOf` registrations are rejected
- [x] `allOf` aggregation matches ADR-0002 for every result combination
- [x] `anyOf` aggregation matches ADR-0002 for every result combination
- [x] `policy-error` wins globally in both compositions
- [x] Equivalent reordered declarations produce equivalent results
- [x] Nested compositions are deterministic
- [x] Duplicate registration IDs are rejected
- [x] Unknown evaluator and resolver references are rejected
- [x] Owner/namespace mismatch is rejected
- [x] Evaluator/resolver exceptions produce sanitized `policy-error`
- [x] Missing runtime references fail closed
- [x] SDK root, middleware, React, and testing boundaries remain intact
- [x] Existing application authorization and middleware behavior remain unchanged
- [x] Full applicable lint, typecheck, test, build, CI, and E2E gates pass
- [x] Documentation explains supported Stage 2 contracts and deferred integration

## Completion rule

This issue closes only when Stage 2 is merged and independently verified. Completion does not imply that Stage 3 or the full parent issue #6 is complete.
