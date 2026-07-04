# SDK Stage 2: Deterministic Policy Engine and Registries

Status: Under Verification
Date: 2026-07-04 (Original) → 2026-07-11 (Verification)
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

## Verification and Security Hardening (2026-07-11)

### Critical Security Fixes Applied

1. **Owner-Scoping Tautology (Site Owner)**

   - Fixed: `canOwnerReferencePath()` contained false-positive allowing site to reference framework/plugin resources
   - Result: Exact equality now enforced (`referencingOwner === referencedOwner`)
   - Impact: All cross-owner references properly denied

2. **Missing Runtime Owner Validation**

   - Fixed: TypeScript types not enforced at runtime
   - Result: Added `isValidOwnerId()` checks in both `validateDeclaration()` and `evaluateDeclarationNode()`
   - Impact: Fail-closed behavior for malformed/missing owners at entry points

3. **Insufficient Evaluator-Result Canonicalization**

   - Fixed: `canonicalizePolicyResult()` did not validate property descriptors
   - Result: Added descriptor validation for all 7 properties, accessor detection, try-catch fail-closed
   - Impact: Malicious evaluators cannot inject getters/setters

4. **Incorrect Error Code on Owner Mismatch**

   - Fixed: Owner reference denial returning `invalid-declaration` instead of `invalid-registration`
   - Result: Changed to semantic `invalid-registration` code
   - Impact: Proper error semantics for registration rule violations

5. **Repository Hygiene**
   - Fixed: Accidentally committed `packages/sdk/node_modules/server-only` symlink
   - Result: Removed with `git rm --cached` and added `node_modules/` to `.gitignore`
   - Impact: No workspace dependencies tracked in git

### Public Diagnostic Policy

The `PolicyResult` and `PolicyErrorDetail` contracts expose these fields to consumers:

- `kind`: 'allow' | 'unauthenticated' | 'forbidden' | 'not-found' | 'policy-error'
- `error.code`: PolicyErrorCode (for policy-error results only)
- **Restricted (diagnostics only)**: `path`, `owner`, `referenceId`, `declarationKind`

Public semantic result: `{ kind: PolicyResultKind, error?: { code: PolicyErrorCode } }`

All restriction of sensitive diagnostic fields is enforced at serialization boundaries. Consumers should never receive uncanonical or accessor-bearing objects.

### Canonicalization Strategy

The `canonicalizePolicyResult()` function implements defense-in-depth:

1. Type validation (is object, has required fields)
2. Property descriptor validation (no getters/setters, all enumerable own properties)
3. Error code whitelist validation (against VALID_POLICY_ERROR_CODES set)
4. Entire result reconstruction (never returns evaluator's original object)
5. Try-catch fail-closed behavior

### Owner-Reference Matrix (Verified)

```
Framework → Framework: ✓ Allow
Framework → Site:      ✗ Deny (invalid-registration)
Framework → Plugin:a:  ✗ Deny (invalid-registration)
Framework → Plugin:b:  ✗ Deny (invalid-registration)

Site → Framework:      ✗ Deny (invalid-registration)
Site → Site:           ✓ Allow
Site → Plugin:a:       ✗ Deny (invalid-registration)
Site → Plugin:b:       ✗ Deny (invalid-registration)

Plugin:a → Framework:  ✗ Deny (invalid-registration)
Plugin:a → Site:       ✗ Deny (invalid-registration)
Plugin:a → Plugin:a:   ✓ Allow
Plugin:a → Plugin:b:   ✗ Deny (invalid-registration)

Plugin:b → Framework:  ✗ Deny (invalid-registration)
Plugin:b → Site:       ✗ Deny (invalid-registration)
Plugin:b → Plugin:a:   ✗ Deny (invalid-registration)
Plugin:b → Plugin:b:   ✓ Allow
```

### Test Coverage

- **Policy engine tests**: 341 tests (19 new owner-reference matrix tests)
- **Release-sync library/CLI tests**: 20 tests (12 original + 8 new CLI execution tests)
- **Package boundaries tests**: 17 tests (8 new server-only boundary tests)
- **Canonical import-path tests**: 8 tests (new)
- **Total**: 366 tests passing, 28 skipped

### Boundary Verification

- ✓ `@devholm/sdk`: Root export is neutral (no server-only marker)
- ✓ `@devholm/sdk/server`: Carries server-only marker and runtime guard
- ✓ `@devholm/sdk/middleware`: Browser-compatible, free from server entrypoint leakage
- ✓ `@devholm/sdk/react`: Browser-compatible, free from server entrypoint leakage
- ✓ `@devholm/sdk/testing`: Exports `supportedSdkImportPaths()` without server marker
- ✓ All 5 exports independently resolve and are in canonical list
- ✓ Internal paths inaccessible through package export map
- ✓ Version lockstep maintained (root 3.9.0, SDK 3.9.0)

### Repository Hygiene Status

- ✓ No node_modules symlinks tracked in git
- ✓ `.gitignore` updated with `node_modules/` pattern
- ✓ No agent memory artifacts committed
- ✓ No broadened lint disables in policy boundary
- ✓ No Stage 3 code present
- ✓ No SDK imports from app internals
- ✓ Test fixtures isolated in `src/test/__fixtures__/`

### Build and Lint Validation

- ✓ TypeScript full type checking: 0 errors
- ✓ ESLint with appropriate comment markers for intentional test `any` casts
- ✓ Prettier formatting applied
- ✓ All 39 test files passing
- ✓ All 366 unit tests passing (28 skipped)
- ✓ No compilation errors
- ✓ Package boundary tests confirm no cross-export contamination
