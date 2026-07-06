'use server';
/**
 * SDK Stage 3: Real Server Action Authorization Proof
 * ===================================================
 *
 * Demonstrates the Stage 3 server-action authorization pattern using the
 * `authorizeSessionAction` helper with session obtained from `auth()`.
 *
 * A real Next.js Server Action MUST NOT accept a NextRequest argument from the
 * caller. Authentication context is obtained INSIDE the action via `auth()`,
 * which reads the server-side session from the cookie store. No client-supplied
 * value can influence the authorization decision.
 *
 * This file exports real Server Actions that:
 * - Accept only serializable FormData (or no arguments)
 * - Obtain the session internally via auth()
 * - Pass the session to authorizeSessionAction (not the caller-supplied request)
 * - Return only serializable values
 * - Execute action body only after authorization succeeds
 * - Distinguish policy-error from forbidden (both result in success: false)
 *
 * Related: ADR-0002, Stage 3 implementation
 */

import { auth } from '@/auth';
import {
  authorizeSessionAction,
  adminAccessDeclaration,
  adminAccessOwner,
  usersManageDeclaration,
  usersManageOwner,
} from '@/lib/sdk-authorization';
import type { ServerActionAuthorizationResult } from '@devholm/sdk/server';
import type { AccessDeclaration, OwnerId } from '@devholm/sdk';

/**
 * Serializable result shape for all proof server actions.
 * All fields are serializable across the server/client boundary.
 */
export interface ServerActionResult {
  success: boolean;
  /** SDK result kind — 'allow' | 'unauthenticated' | 'forbidden' | 'not-found' | 'policy-error' */
  result?: string;
  /** Sanitized error message (no raw exception content) */
  error?: string;
  /** Proof payload — present only when action body executed */
  data?: Record<string, unknown>;
}

/**
 * Internal helper: Evaluate authorization with fail-closed error handling.
 *
 * Wraps both auth() and authorizeSessionAction() in a single sanitized boundary:
 * - auth() rejection → policy-error with sanitized message
 * - authorizeSessionAction() rejection → policy-error with sanitized message
 * - authorizeSessionAction() policy-error result → passed through unchanged
 * - authorizeSessionAction() normal result → returned for action to handle
 *
 * This ensures infrastructure failures are never exposed to the caller.
 */
async function evaluateProofAuthorization(
  declaration: AccessDeclaration,
  owner: OwnerId
): Promise<ServerActionAuthorizationResult | ServerActionResult> {
  try {
    // Step 1: Obtain session internally
    const session = await auth();

    // Step 2: Evaluate authorization
    // Both auth() and authorizeSessionAction() are now inside the try block
    const authorization = await authorizeSessionAction(session, declaration, owner);

    // Return the authorization result for caller to handle
    // (may contain allowed: true, allowed: false, or policy-error result)
    return authorization;
  } catch (
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _error
  ) {
    // Catch auth() or authorizeSessionAction() exceptions
    // Return sanitized policy-error result
    return {
      success: false,
      result: 'policy-error',
      error: 'Authorization service unavailable',
    };
  }
}

/**
 * Stage 3 admin access authorization proof (admin-only Server Action).
 *
 * Stage 3 pattern: session is obtained INSIDE the action via auth().
 * Evaluates adminAccessDeclaration (role-any[admin,superadmin] OR permission-any[admin.access]).
 * The action body is a harmless proof operation (returns the authorized userId).
 *
 * NOTE: This is a proof-of-authorization Server Action for testing Stage 3 enforcement.
 * In production, this would connect to a real admin operation.
 */
export async function stage3AdminAccessAuthorizationProofAction(): Promise<ServerActionResult> {
  // Evaluate authorization with fail-closed error handling for both auth() and authorizeSessionAction()
  const authResult = await evaluateProofAuthorization(adminAccessDeclaration, adminAccessOwner);

  // Check if this is an error result (success field present)
  if ('success' in authResult) {
    // Authorization service failure (policy-error)
    return authResult as ServerActionResult;
  }

  // authResult is a ServerActionAuthorizationResult
  const authorization = authResult as ServerActionAuthorizationResult;

  // Reject non-allowed results (fail closed)
  if (!authorization.allowed) {
    return {
      success: false,
      result: authorization.result,
      error: authorization.errorMessage ?? 'Not authorized',
    };
  }

  // Action body — only reached when authorization.allowed is true.
  // Proof payload: return proof of authorization with authorized subject ID.
  return {
    success: true,
    result: authorization.result,
    data: {
      proof: 'admin-access-authorized',
      authorizedUserId: authorization.subject.userId,
    },
  };
}

/**
 * Stage 3 users management authorization proof (users.manage permission or admin Server Action).
 *
 * Evaluates usersManageDeclaration:
 *   anyOf[permission-any[users.manage], adminAccessDeclaration]
 *
 * Allowed for: users.manage permission, admin.access permission,
 *              admin role, superadmin role.
 * Denied for: ordinary members, anonymous callers.
 *
 * NOTE: This is a proof-of-authorization Server Action for testing Stage 3 enforcement.
 * In production, this would connect to a real users management operation.
 */
export async function stage3UsersManageAuthorizationProofAction(): Promise<ServerActionResult> {
  // Evaluate authorization with fail-closed error handling for both auth() and authorizeSessionAction()
  const authResult = await evaluateProofAuthorization(usersManageDeclaration, usersManageOwner);

  // Check if this is an error result (success field present)
  if ('success' in authResult) {
    // Authorization service failure (policy-error)
    return authResult as ServerActionResult;
  }

  // authResult is a ServerActionAuthorizationResult
  const authorization = authResult as ServerActionAuthorizationResult;

  // Reject non-allowed results (fail closed)
  if (!authorization.allowed) {
    return {
      success: false,
      result: authorization.result,
      error: authorization.errorMessage ?? 'Not authorized',
    };
  }

  // Action body — proof payload: return proof of authorization with authorized subject ID.
  return {
    success: true,
    result: authorization.result,
    data: {
      proof: 'users-manage-authorized',
      authorizedUserId: authorization.subject.userId,
    },
  };
}
