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
// - 'legacy': Use database/token isAdmin field (current behavior)
// - 'canonical': Derive from roles=['admin']/'superadmin' (new strict)
// - 'union': Allow either legacy OR roles-based (permissive during migration)
//
// Used by: Authorization wrappers to extract subject with optional
// legacy compatibility path for gradual migration.

// 3. AUTHORIZATION WRAPPERS (packages/sdk/src/server/authorization-wrappers.ts)
// ============================================================================
// Server enforcement for API routes and server actions.
//
// Key functions:
// - evaluateApiAuthorization(session, policyName, options)
// Returns: AuthorizationResult with HTTP mapping
// Does: Normalizes subject, looks up policy, calls Stage 2 engine,
// maps result to HTTP status
//
// - mapPolicyToAuthorizationResult(policyResult, subject, options)
// Maps Stage 2 PolicyResult kinds to AuthorizationTransportResult
// Enforces fail-closed: policy-error → 500, never 403
//
// - authorizedApiResponse(authResult, allowedHandler)
// Helper for common pattern: check auth, then handle if allowed
//
// Result types:
// - ALLOW (200): Policy evaluated to allow
// - UNAUTHENTICATED (401): Required authentication missing
// - FORBIDDEN (403): Authenticated but not allowed
// - CONCEALED (404): Resource hidden from this subject
// - POLICY_ERROR (500/503): Policy evaluation failed; fail closed

// 4. POLICY REGISTRY INSTANCE (packages/sdk/src/server/policy-registry-instance.ts)
// =================================================================================
// Manages the global PolicyRegistry singleton.
//
// Functions:
// - getPolicyRegistry(): Get or create the global registry
// - setPolicyRegistry(registry): Set for testing
// - resetPolicyRegistry(): Clear for testing
//
// Purpose: Provide a centralized registry that can be configured at
// application startup and shared across all authorization checks.

// 5. POLICY DECLARATIONS (packages/sdk/src/server/policy-declarations.ts)
// ======================================================================
// Registry of policy names to AccessDeclaration mappings.
//
// Functions:
// - registerPolicyDeclaration(name, declaration, owner)
// Register a policy by name for later lookup
//
// - getPolicyDeclaration(name): Find a policy by name
// - isPolicyRegistered(name): Check if registered
// - getRegisteredPolicies(): List all registered policies
// - clearPolicyDeclarations(): Flush all (testing only)
//
// Usage:
// `ts
// registerPolicyDeclaration(
//   'admin:access',
//   defineAccessDeclaration({ kind: 'role-any', roles: ['admin'] }),
//   'framework'
// );
// `

// =============================================================================
// DATA FLOW: From Session to Authorization Decision
// =============================================================================
//
// 1. Application calls: evaluateApiAuthorization(session, 'my-policy')
//
// 2. Stage 3 normalizes session:
// canonicalSubjectFromSession(session, options)
// → CanonicalAuthorizationSubject
// → Protected against null/undefined/malformed
//
// 3. Look up policy by name:
// getPolicyDeclaration('my-policy')
// → AccessDeclaration
//
// 4. Create evaluation context:
// {
// subject: NormalizedPolicySubject (mapped from canonical),
// owner: 'framework' or 'site',
// }
//
// 5. Call Stage 2 policy engine:
// registry.evaluateDeclaration(declaration, context)
// → PolicyResult (kind: allow|forbidden|unauthenticated|not-found|policy-error)
//
// 6. Map result to HTTP:
// mapPolicyToAuthorizationResult(policyResult, subject)
// → AuthorizationResult {
// result: ALLOW|FORBIDDEN|UNAUTHENTICATED|CONCEALED|POLICY_ERROR,
// httpStatus: 200|403|401|404|500/503,
// subject: canonical subject,
// errorMessage?: sanitized message,
// diagnostics?: (if enabled)
// }
//
// 7. Application handles result:
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
// - packages/sdk/src/server/policy-registry-instance.ts
// - packages/sdk/src/server/policy-declarations.ts
// - src/test/sdk-stage3-real-integration.test.ts
// - docs/stage3-production-surface-migration.md
// - docs/stage3-example-admin-profile-api.ts
// - docs/stage3-example-posts-api.ts
//
// Modified files:
// - packages/sdk/src/server/authorization-wrappers.ts
// - Replaced PolicyEvaluationResult with real PolicyResult
// - Replaced placeholder evaluateApiAuthorization() with real Stage 2 call
// - Updated mapPolicyToAuthorizationResult() to handle real PolicyResult kinds
//
// - packages/sdk/src/server.ts
// - Added exports for policy-registry-instance
// - Added exports for policy-declarations

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

export {};
