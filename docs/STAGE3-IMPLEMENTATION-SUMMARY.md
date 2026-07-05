/\*\*

- SDK Stage 3: Server Enforcement Implementation Summary
- ========================================================
-
- This document summarizes the Stage 3 implementation that integrates the
- Stage 2 policy engine with canonical subject normalization for server-side
- authorization enforcement.
-
- Related: ADR-0002, Stage 2 (#31), Stage 3 (#39), Governance (#6)
  \*/

// =============================================================================
// WHAT IS STAGE 3?
// =============================================================================
//
// Stage 3 is the server enforcement layer that:
// 1. Normalizes auth data to a canonical subject
// 2. Evaluates Stage 2 policies using real policy engine
// 3. Deterministically maps policy results to HTTP responses
// 4. Fails closed on all error conditions
// 5. Provides sanitized diagnostics for debugging
//
// Stage 3 is NOT responsible for:
// - Client-side visibility (Stage 4)
// - Middleware integration (Stage 4)
// - React hooks (Stage 5)
// - Acceptance testing (Stage 6)

// =============================================================================
// IMPLEMENTATION COMPONENTS
// =============================================================================
//
// 1. NORMALIZATION (packages/sdk/src/server/normalization.ts)
// ============================================================
// Canonical subject model that handles:
// - Null/undefined/malformed inputs defensively
// - Prototype pollution protection
// - Array deduplication and sorting
// - Consistent field types
//
// Input: Any auth data (session, token, etc.)
// Output: CanonicalAuthorizationSubject with status, userId, email, role,
// roles[], permissions[], isAdmin
// Properties:
// - Never throws; returns UNAUTHENTICATED on invalid input
// - All arrays are sorted and deduplicated
// - No null-prototype pollution keys
//
// Example:
// `ts
// const subject = normalizeAuthorizationSubject(sessionUser);
// if (subject.status === AuthenticationStatus.AUTHENTICATED) {
//   console.log(subject.userId);      // Safe to use
//   console.log(subject.roles);       // Sorted, deduplicated []
//   console.log(subject.permissions); // Safe []
// }
// `

// 2. COMPATIBILITY ADAPTER (packages/sdk/src/server/compatibility-adapter.ts)
// ===========================================================================
// Bridges legacy auth patterns to canonical form during migration.
//
// Functions:
// - adaptLegacyToCanonical(): Explicit legacy→canonical mapping
// - canonicalSubjectFromSession(): Extract canonical subject from session
//
// Admin determination has three configurable strategies:
// - 'legacy': isAdmin field AND role/roles in ['admin','superadmin'] are both considered
// - 'canonical': only the explicit isAdmin=true field is accepted
// - 'union': either legacy (isAdmin, role/roles) OR canonical rule grants admin
//
// Used by: Authorization wrappers to extract subject with optional
// legacy compatibility path for gradual migration.

// 3. AUTHORIZATION WRAPPERS (packages/sdk/src/server/authorization-wrappers.ts)
// ============================================================================
// Server enforcement for API routes and server actions.
//
// Key functions:
// - evaluateApiAuthorization(session, declaration, owner, registry, options?)
// Returns: AuthorizationResult with HTTP mapping
// Does: Normalizes subject, evaluates real Stage 2 engine with provided registry,
// maps result to HTTP status
// Registry and declaration are injected by the caller (no global state)
//
// - mapPolicyToAuthorizationResult(policyResult, subject, options?)
// Maps Stage 2 PolicyResult kinds to AuthorizationTransportResult
// Enforces fail-closed: policy-error → 500 or 503, never 403
//
// Result types:
// - ALLOW (200): Policy evaluated to allow
// - UNAUTHENTICATED (401): Required authentication missing
// - FORBIDDEN (403): Authenticated but not allowed
// - CONCEALED (404): Resource hidden from this subject
// - POLICY_ERROR (500/503): Policy evaluation failed; fail closed

// 4. APPLICATION AUTHORIZATION ADAPTER (src/core/lib/sdk-authorization.ts)
// =========================================================================
// Application-owned policy registry — NOT a global SDK singleton.
// The SDK exports createPolicyRegistry() only; the application owns its instance.
//
// Contents:
// - appRegistry: application PolicyRegistry instance
// - adminAccessDeclaration: anyOf[role-any[admin,superadmin], permission-any[admin.access]]
// - usersManageDeclaration: permission-any[users.manage, admin.access]
// - authorizeRequest(): JWT token → canonical subject → policy evaluation

// =============================================================================
// DATA FLOW: From Session to Authorization Decision
// =============================================================================
//
// 1. Application calls: evaluateApiAuthorization(session, declaration, owner, registry)
//
// 2. Stage 3 normalizes session:
// canonicalSubjectFromSession(session, options)
// → CanonicalAuthorizationSubject
// → Protected against null/undefined/malformed
//
// 3. Convert to Stage 2 format:
// canonicalSubjectToNormalizedPolicySubject(subject)
// → NormalizedPolicySubject with branded PermissionId values
//
// 4. Call Stage 2 policy engine:
// registry.evaluateDeclaration(declaration, context)
// → PolicyResult (kind: allow|forbidden|unauthenticated|not-found|policy-error)
//
// 5. Map result to HTTP:
// mapPolicyToAuthorizationResult(policyResult, subject)
// → AuthorizationResult {
// result: ALLOW|FORBIDDEN|UNAUTHENTICATED|CONCEALED|POLICY_ERROR,
// httpStatus: 200|403|401|404|500/503,
// subject: canonical subject,
// errorMessage?: sanitized message,
// diagnostics?: (if enabled)
// }
//
// 6. Application handles result:
// if (authResult.result !== AuthorizationTransportResult.ALLOW) {
// return NextResponse(status: authResult.httpStatus);
// }
// // Use authResult.subject for business logic

// =============================================================================
// REAL STAGE 2 INTEGRATION EVIDENCE
// =============================================================================
//
// Stage 3 wrappers call the REAL Stage 2 policy engine, not a mock:
//
// 1. getPolicyRegistry() returns the real createPolicyRegistry() instance
// 2. Policy registrations use real Stage 2 PolicyRegistry.registerEvaluator()
// 3. Evaluation calls real registry.evaluateDeclaration()
// 4. Result types are real Stage 2 PolicyResult kinds
// 5. All PolicyEvaluatorRegistrations must be registered before evaluation
// 6. Fail-closed semantics follow Stage 2 precedence exactly
// 7. No global mutable state: registry passed by caller
//
// Test file: src/test/sdk-stage3-real-integration.test.ts
// - Registers real Stage 2 evaluators
// - Calls evaluateApiAuthorization() with real policies
// - Verifies Stage 2 engine was invoked (captures context subject)
// - Tests all PolicyResult kinds
// - Tests fail-closed on engine errors

// =============================================================================
// PRODUCTION SURFACE MIGRATIONS
// =============================================================================
//
// Two migration examples (docs/):
//
// 1. stage3-example-admin-profile-api.ts
// - Role-based policy: 'admin:profile-read'
// - Parity tests showing old vs new behavior matches
// - Rollback strategy
//
// 2. stage3-example-posts-api.ts
// - Permission-based policy: 'posts:write', 'posts:delete'
// - Complex allOf composition example
// - Comprehensive parity test suite
//
// 3. stage3-production-surface-migration.md
// - Migration guide for real surfaces
// - Policy registration patterns
// - Testing strategy
// - Rollback patterns

// =============================================================================
// SECURITY INVARIANTS (All enforced by Stage 3)
// =============================================================================
//
// 1. Fail-closed on policy errors
// - policy-error NEVER becomes 403
// - All errors map to 500 or 503, never 200
//
// 2. Deterministic subject normalization
// - No exceptions; null/undefined inputs return UNAUTHENTICATED
// - Array mutations are impossible (sorted + deduplicated)
// - Prototype pollution keys are filtered
//
// 3. Real Stage 2 policy engine is authoritative
// - No hardcoded allow/deny shortcuts
// - All policy logic delegated to Stage 2
// - No caching that could cause stale decisions
//
// 4. Sanitized diagnostics
// - No secrets, stack traces, or internal objects leak
// - Diagnostics are only enabled in non-production
// - Error messages are safe for client transport
//
// 5. Canonical subjects are immutable by design
// - All fields are readonly
// - Arrays are sorted and deduplicated
// - No ability to mutate after creation

// =============================================================================
// FILES CHANGED
// =============================================================================
//
// New files:
// - packages/sdk/src/server/normalization.ts
// - packages/sdk/src/server/compatibility-adapter.ts
// - packages/sdk/src/server/authorization-wrappers.ts
// - src/core/lib/sdk-authorization.ts (application layer, NOT SDK)
// - src/test/sdk-stage3-authorization.test.ts
// - src/test/sdk-stage3-integration.test.ts
// - src/test/sdk-stage3-real-integration.test.ts
// - src/test/sdk-stage3-production-surfaces.test.ts
//
// Modified files:
// - packages/sdk/src/server.ts: exports normalization, compatibility-adapter, authorization-wrappers
// - src/app/api/admin/dashboard/route.ts: migrated to Stage 3 adminAccessDeclaration
// - src/app/api/admin/auth/users/route.ts: migrated to Stage 3 usersManageDeclaration
// - e2e/admin.spec.ts: added Stage 3 surface enforcement tests
// - eslint.config.mjs: added playwright-report/** and test-results/** to ignores

// =============================================================================
// VALIDATION
// =============================================================================
//
// All code compiles without errors (verified via TypeScript)
// Test file demonstrates real Stage 2 integration
// Documentation shows migration patterns for production surfaces
// Examples include comprehensive parity test suites
//
// To validate before merge:
// pnpm install --frozen-lockfile # No lockfile churn
// pnpm lint # Code style
// pnpm typecheck # TypeScript
// pnpm test # All tests including Stage 3
// pnpm build # Production build

// =============================================================================
// RELATED ISSUES & ADRs
// =============================================================================
//
// Issue #39: SDK Stage 3 Implementation (this work)
// Issue #31: SDK Stage 2 (completed, merged via #38)
// Issue #6: Governance workstream (parent)
// ADR-0002: SDK boundaries and access policy
// PR #38: Stage 2 post-merge review closeout (merged)
