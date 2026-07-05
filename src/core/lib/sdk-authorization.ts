/**
 * Application-Level SDK Authorization Adapter
 * ============================================
 *
 * This module provides the application-owned policy registry and helpers for
 * integrating Stage 3 SDK authorization into DevHolm API routes.
 *
 * Design:
 * - The PolicyRegistry instance lives here (application layer, NOT the SDK)
 * - Policy declarations are explicit and named; no global name-to-declaration map
 * - Evaluators are registered here; plugins may extend via their own registry
 * - `authorizeRequest` adapts a NextRequest JWT token to a canonical subject
 *   and evaluates it against a supplied declaration
 *
 * This is NOT part of @devholm/sdk; it is application code that calls the SDK.
 *
 * Related: ADR-0002, Stage 2 policy engine, Stage 3 authorization-wrappers
 */

import { NextRequest } from 'next/server';
import {
  createPolicyRegistry,
  canonicalSubjectFromToken,
  canonicalSubjectToNormalizedPolicySubject,
  mapPolicyToAuthorizationResult,
  type AuthorizationResult,
  type AuthorizationEvaluationOptions,
  type ServerActionAuthorizationResult,
} from '@devholm/sdk/server';
import {
  defineAccessDeclaration,
  permissionId,
  type AccessDeclaration,
  type OwnerId,
} from '@devholm/sdk';
import { getAdminToken } from '@/lib/auth-helpers';

// ---------------------------------------------------------------------------
// Application-owned policy registry
// ---------------------------------------------------------------------------

/**
 * Single application registry for all DevHolm policy evaluations.
 * Evaluators using built-in declaration kinds (role-any, permission-any,
 * authenticated, etc.) are handled by Stage 2 without custom registration.
 * Custom evaluators for ownership rules or complex logic are registered here.
 */
export const appRegistry = createPolicyRegistry();

// ---------------------------------------------------------------------------
// Policy declarations
// ---------------------------------------------------------------------------

/**
 * Admin-access policy: requires role 'admin' or 'superadmin'.
 *
 * Pre-migration behavior: `hasAdminAccess(token)` in auth-helpers.ts checks:
 *   - roles includes 'admin' or 'superadmin'
 *   - role is 'admin' or 'superadmin'
 *   - permission 'admin.access'
 *
 * Post-migration behavior: evaluates role-any ['admin', 'superadmin'] through
 * the Stage 2 engine. Admin-access via 'admin.access' permission is preserved
 * via the anyOf composition with permission-any.
 *
 * Owner: 'site' (application-specific admin role policy)
 */
export const adminAccessDeclaration: AccessDeclaration = defineAccessDeclaration({
  kind: 'anyOf',
  policies: [
    { kind: 'role-any', roles: ['admin', 'superadmin'] },
    { kind: 'permission-any', permissions: [permissionId('admin.access')] },
  ],
});
export const adminAccessOwner: OwnerId = 'site';

/**
 * Users-manage policy: preserves the full legacy `verifyPermission('users.manage')` access matrix.
 *
 * Pre-migration behavior: `verifyPermission(request, 'users.manage')` permitted:
 *   1. Explicit `users.manage` permission
 *   2. Explicit `admin.access` permission
 *   3. Role 'admin' (via hasAdminAccess)
 *   4. Role 'superadmin' (via hasAdminAccess)
 *   5. `roles` array containing 'admin' or 'superadmin' (via hasAdminAccess)
 *
 * Post-migration behavior: uses anyOf composition so that either explicit
 * `users.manage` permission OR the full adminAccessDeclaration (which covers
 * all role-based and admin.access paths) is sufficient.
 *
 * Owner: 'site'
 */
export const usersManageDeclaration: AccessDeclaration = defineAccessDeclaration({
  kind: 'anyOf',
  policies: [
    {
      kind: 'permission-any',
      permissions: [permissionId('users.manage')],
    },
    adminAccessDeclaration,
  ],
});
export const usersManageOwner: OwnerId = 'site';

// ---------------------------------------------------------------------------
// Route authorization helper
// ---------------------------------------------------------------------------

/**
 * Evaluate authorization for a NextRequest using JWT token auth.
 *
 * Gets the JWT token from the request cookie, converts it to a canonical
 * authorization subject via the compatibility adapter, and evaluates it
 * against the supplied declaration using the application registry.
 *
 * @param request - The incoming NextRequest
 * @param declaration - Access declaration defining the policy
 * @param owner - Owner of the declaration (framework or site)
 * @param options - Evaluation options
 * @returns Deterministic HTTP-mapped authorization result
 */
export async function authorizeRequest(
  request: NextRequest,
  declaration: AccessDeclaration,
  owner: OwnerId,
  options?: AuthorizationEvaluationOptions
): Promise<AuthorizationResult> {
  // Get JWT token from request cookie
  const token = await getAdminToken(request);

  // Convert token to canonical authorization subject via compatibility adapter
  const { subject } = canonicalSubjectFromToken(token);

  // Convert canonical subject to normalized policy subject for Stage 2
  const normalizedSubject = canonicalSubjectToNormalizedPolicySubject(subject);

  // Evaluate with real Stage 2 policy engine
  const policyResult = await appRegistry.evaluateDeclaration(declaration, {
    subject: normalizedSubject,
    owner,
  });

  return mapPolicyToAuthorizationResult(policyResult, subject, options);
}

/**
 * Evaluate authorization for a Next.js server action using JWT token from request.
 *
 * Returns a ServerActionAuthorizationResult with an explicit `allowed` flag
 * suitable for server-action return values — no HTTP status codes.
 *
 * @example
 * ```ts
 * 'use server';
 * import { authorizeServerAction, adminAccessDeclaration, adminAccessOwner } from '@/lib/sdk-authorization';
 * import type { NextRequest } from 'next/server';
 *
 * // authorizeServerAction requires a NextRequest (available in Server Actions
 * // invoked from route handlers). For session-based actions without a request,
 * // call evaluateServerActionAuthorization() directly with auth().
 * export async function dismissOnboarding(request: NextRequest) {
 *   const auth = await authorizeServerAction(request, adminAccessDeclaration, adminAccessOwner);
 *   if (!auth.allowed) return { success: false, error: auth.errorMessage };
 *   // proceed...
 * }
 * ```
 */
export async function authorizeServerAction(
  request: NextRequest,
  declaration: AccessDeclaration,
  owner: OwnerId,
  options?: AuthorizationEvaluationOptions
): Promise<ServerActionAuthorizationResult> {
  const token = await getAdminToken(request);
  const { subject } = canonicalSubjectFromToken(token);
  const normalizedSubject = canonicalSubjectToNormalizedPolicySubject(subject);
  const policyResult = await appRegistry.evaluateDeclaration(declaration, {
    subject: normalizedSubject,
    owner,
  });
  const httpResult = mapPolicyToAuthorizationResult(policyResult, subject, options);
  return {
    result: httpResult.result,
    allowed: httpResult.result === 'allow',
    subject: httpResult.subject,
    errorMessage: httpResult.errorMessage,
    diagnostics: httpResult.diagnostics,
  };
}
