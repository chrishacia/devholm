'use server';
/**
 * SDK Stage 3: Representative Server Action Authorization Proof
 * ==============================================================
 *
 * Demonstrates the Stage 3 server-action authorization pattern using
 * `authorizeServerAction` from the application adapter.
 *
 * This file satisfies the issue #39 requirement for a server-action wrapper
 * distinct from the HTTP (route handler) wrapper.
 *
 * Usage pattern for server actions:
 * - Obtain the NextRequest (from function parameters in server actions with request context)
 * - Or use auth() / getSession() to obtain a session directly
 * - Call authorizeServerAction() or evaluateServerActionAuthorization()
 * - Check result.allowed before executing the action body
 *
 * Related: ADR-0002, Stage 3 implementation
 */

import {
  authorizeServerAction,
  adminAccessDeclaration,
  adminAccessOwner,
  usersManageDeclaration,
  usersManageOwner,
} from '@/lib/sdk-authorization';
import type { NextRequest } from 'next/server';

/**
 * Example: Trigger onboarding dismissal (admin-only server action).
 *
 * Stage 3 authorization: evaluates adminAccessDeclaration.
 * Returns structured result suitable for server action callers.
 */
export async function dismissOnboardingAction(
  request: NextRequest
): Promise<{ success: boolean; error?: string }> {
  const auth = await authorizeServerAction(request, adminAccessDeclaration, adminAccessOwner);

  if (!auth.allowed) {
    // errorMessage is sanitized — no raw exception content leaks
    return { success: false, error: auth.errorMessage ?? 'Not authorized' };
  }

  // Action body — only reached if allowed
  // (Implementation would call dismissAuthOnboardingStatus() etc.)
  return { success: true };
}

/**
 * Example: List users (users-manage server action).
 *
 * Stage 3 authorization: evaluates usersManageDeclaration.
 * Allowed for: users.manage permission, admin.access permission,
 *              admin role, superadmin role.
 */
export async function listUsersAction(
  request: NextRequest
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const auth = await authorizeServerAction(request, usersManageDeclaration, usersManageOwner);

  if (!auth.allowed) {
    return { success: false, error: auth.errorMessage ?? 'Not authorized' };
  }

  // Action body
  // (Implementation would call listAuthUsers() etc.)
  return { success: true, data: [] };
}
