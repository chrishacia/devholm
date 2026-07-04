# SDK Stage 2: Deterministic Policy Engine and Registries

Status: Under Verification  
Date: 2026-07-04
Related issue: #31
Related parent workstream: #6
Related ADR: `docs/roadmap/decisions/0002-sdk-boundaries-and-access-policy.md`

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

## Acceptance criteria

- [ ] Neutral policy result contracts are serializable and runtime-independent
- [ ] A normalized policy subject can be supplied without integrating current auth/session code
- [ ] All built-in Stage 2 declaration kinds evaluate deterministically
- [ ] Empty `allOf` and `anyOf` registrations are rejected
- [ ] `allOf` aggregation matches ADR-0002 for every result combination
- [ ] `anyOf` aggregation matches ADR-0002 for every result combination
- [ ] `policy-error` wins globally in both compositions
- [ ] Equivalent reordered declarations produce equivalent results
- [ ] Nested compositions are deterministic
- [ ] Duplicate registration IDs are rejected
- [ ] Unknown evaluator and resolver references are rejected
- [ ] Owner/namespace mismatch is rejected
- [ ] Evaluator/resolver exceptions produce sanitized `policy-error`
- [ ] Missing runtime references fail closed
- [ ] SDK root, middleware, React, and testing boundaries remain intact
- [ ] Existing application authorization and middleware behavior remain unchanged
- [ ] Full applicable lint, typecheck, test, build, CI, and E2E gates pass
- [ ] Documentation explains supported Stage 2 contracts and deferred integration

## Completion rule

This issue closes only when Stage 2 is merged and independently verified. Completion does not imply that Stage 3 or the full parent issue #6 is complete.
