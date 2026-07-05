# SDK Stage 2: Deterministic Policy Engine and Registries

Status: **Completed** ✅
Date: 2026-07-05
Related issue: #31
Related parent workstream: #6
Related ADR: `docs/roadmap/decisions/0002-sdk-boundaries-and-access-policy.md`

## Completion Evidence

- **PR #36** (governance remediation, squash SHA `554837a`) — v3.9.2: Fixed governance violation (direct push `dee3946`), established public API security boundary (`PolicyErrorDetail` minimal), added initial 78 test cases.
- **PR #37** (final verification, squash SHA `bcc2f01cf11fc0b5bf89b8c16071f92f440749b3`) — merged 2026-07-05T06:05:47Z: Completed all remaining Stage 2 requirements.
  - Removed unused `diagnostics` parameter from `policyError()` (dead code)
  - Added invalid-owner validation matrix (10 invalid types × 3 assertions each)
  - Added full 16-pair validation-time and runtime owner-reference matrices for both evaluators and resolvers
  - Added nested allOf/anyOf cross-owner violation tests
  - Added extended hostile evaluator result canonicalization suite
  - Replaced false `execSync` exitCode tests with `spawnSync` in version-sync tests
  - Fixed misleading test names in canonical-imports and package-boundary tests
- **CI Run 28730973872**: All 8 checks passing (Sync DevHolm Framework, Detect Non-Docs Changes, Lint & Type Check, Unit Tests, Security Scan, Build Application, E2E Tests, GitGuardian Security Checks)
- **Test counts**: sdk-policy-engine.test.ts: 193, sdk-version-sync.test.ts: 24, sdk-canonical-imports.test.ts: 8, sdk-package-boundaries.test.ts: 17, total suite: 534 passed / 28 skipped
- **Starting main**: `27b97a27cc78c5cf1fdfc8a1cb6ab864004733f6`
- **Resulting main**: `bcc2f01cf11fc0b5bf89b8c16071f92f440749b3`

## Stage 3 Status

Stage 3 has **not begun**. Issue #12 (product and framework evolution roadmap) remains open. No Stage 3 implementation work is included in this merge.

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
