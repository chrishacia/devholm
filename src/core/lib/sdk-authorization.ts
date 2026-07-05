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
 * Users-manage policy: requires 'users.manage' or 'admin.access' permission.
 *
 * Pre-migration behavior: `verifyPermission(request, 'users.manage')` in auth-helpers.ts:
 *   - checks hasPermission(token, 'users.manage')
 *   - falls back to hasAdminAccess(token) for role-based admins
 *
 * Post-migration behavior: evaluates permission-any with both permissions explicitly.
 *
 * Owner: 'site'
 */
export const usersManageDeclaration: AccessDeclaration = defineAccessDeclaration({
  kind: 'permission-any',
  permissions: [permissionId('users.manage'), permissionId('admin.access')],
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
