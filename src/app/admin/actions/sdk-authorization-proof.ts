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
  // Step 1: Obtain session internally — no caller-supplied auth context
  const session = await auth();

  // Step 2: Evaluate authorization via Stage 3 SDK
  const authorization = await authorizeSessionAction(
    session,
    adminAccessDeclaration,
    adminAccessOwner
  );

  // Step 3: Reject non-allowed results (fail closed)
  if (!authorization.allowed) {
    return {
      success: false,
      result: authorization.result,
      error: authorization.errorMessage ?? 'Not authorized',
    };
  }

  // Step 4: Action body — only reached when authorization.allowed is true.
  // Proof operation: return the authorized subject's userId as evidence the
  // action body executed. In production this would call dismissAuthOnboardingStatus().
  return {
    success: true,
    result: authorization.result,
    data: {
      dismissed: true,
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
  // Obtain session internally — caller cannot supply or forge auth context
  const session = await auth();

  const authorization = await authorizeSessionAction(
    session,
    usersManageDeclaration,
    usersManageOwner
  );

  if (!authorization.allowed) {
    return {
      success: false,
      result: authorization.result,
      error: authorization.errorMessage ?? 'Not authorized',
    };
  }

  // Action body — proof operation only (returns empty list)
  // In production this would call listAuthUsers() etc.
  return {
    success: true,
    result: authorization.result,
    data: {
      users: [],
      authorizedUserId: authorization.subject.userId,
    },
  };
}
