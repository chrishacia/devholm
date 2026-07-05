/**
 * SDK Stage 3: Server-Side Authorization Wrappers
 * ================================================
 *
 * Server-enforcement wrappers that bridge Stage 3 canonical subjects to the
 * Stage 2 policy engine and produce deterministic HTTP-mapped authorization results.
 *
 * Design principles:
 * - Registry and declaration are supplied by the caller (dependency injection)
 * - No global mutable state: each call uses the registry passed in
 * - Policy errors fail closed and must never be downgraded to 403 or 404
 * - Deterministic transport mapping: allow → 200, unauthenticated → 401,
 *   forbidden → 403, concealed/not-found → 404, policy-error → 500 or 503
 * - Diagnostics are sanitized; no secrets, raw exceptions, or internal objects leak
 * - Framework-agnostic: no framework-specific imports
 *
 * Transport table for policy-error HTTP status:
 * - missing-runtime-reference → 503 (evaluator/resolver not configured; service temporarily incomplete)
 * - all other error codes      → 500 (policy engine internal failure; fail-closed)
 *
 * Related: ADR-0002, Stage 2 policy engine, Stage 3 implementation
 */

import type {
  PolicyResult,
  NormalizedPolicySubject,
  AccessDeclaration,
  OwnerId,
} from '../contracts';
import { permissionId } from '../contracts';
import type { PolicyRegistry } from './policy';
import {
  type CanonicalAuthorizationSubject,
  AuthenticationStatus,
  normalizeAuthorizationSubject as _normForFallback,
} from './normalization';
import {
  canonicalSubjectFromSession,
  type CompatibilityAdapterOptions,
} from './compatibility-adapter';

/**
 * Deterministic authorization result mapped to HTTP response semantics.
 */
export enum AuthorizationTransportResult {
  /** Policy evaluation succeeded and subject is allowed */
  ALLOW = 'allow',
  /** Subject is unauthenticated; typically maps to 401 */
  UNAUTHENTICATED = 'unauthenticated',
  /** Subject is authenticated but forbidden; typically maps to 403 */
  FORBIDDEN = 'forbidden',
  /** Resource is concealed from this subject; typically maps to 404 */
  CONCEALED = 'concealed',
  /** Policy evaluation failed; fail closed; typically maps to 500 or 503 */
  POLICY_ERROR = 'policy-error',
}

/**
 * Public authorization result for route handlers.
 * Never contains raw policy objects, exceptions, or database data.
 */
export interface AuthorizationResult {
  /** Deterministic result code */
  result: AuthorizationTransportResult;

  /** HTTP status code to use in response */
  httpStatus: number;

  /** Canonical subject that was evaluated */
  subject: CanonicalAuthorizationSubject;

  /** Sanitized error message safe for transport */
  errorMessage?: string;

  /** Diagnostics (only if explicitly enabled; never enable in production) */
  diagnostics?: {
    policyEvaluationDetails?: string;
    migrationType?: 'canonical' | 'legacy-compat';
  };
}

/**
 * Options for authorization evaluation.
 */
export interface AuthorizationEvaluationOptions {
  /** Enable diagnostics output (default: false; do not enable in production) */
  diagnosticsEnabled?: boolean;

  /** Compatibility adapter options for subject extraction */
  compatibilityOptions?: CompatibilityAdapterOptions;
} /**
 * Convert a CanonicalAuthorizationSubject to NormalizedPolicySubject for Stage 2 evaluation.
 *
 * Permissions are individually converted to branded PermissionId values using permissionId().
 * The canonical subject's permissions array has already been validated and sanitized
 * (no empty strings, no prototype-pollution keys) by normalizeAuthorizationSubject,
 * so each entry is safe to brand.
 *
 * @param subject - Canonical authorization subject from Stage 3 normalization
 * @returns Normalized policy subject ready for Stage 2 evaluation
 */
export function canonicalSubjectToNormalizedPolicySubject(
  subject: CanonicalAuthorizationSubject
): NormalizedPolicySubject {
  return {
    authenticated: subject.status === AuthenticationStatus.AUTHENTICATED,
    subjectId: subject.userId ?? undefined,
    roles: subject.roles,
    permissions: subject.permissions.map(permissionId),
  };
}

/**
 * Map a real Stage 2 PolicyResult to an HTTP-mapped AuthorizationResult.
 *
 * Transport table:
 * - allow                   → 200  ALLOW
 * - forbidden (auth)        → 403  FORBIDDEN
 * - forbidden (unauth)      → 401  UNAUTHENTICATED (authentication takes precedence)
 * - unauthenticated         → 401  UNAUTHENTICATED
 * - not-found               → 404  CONCEALED
 * - policy-error (missing-runtime-reference) → 503  POLICY_ERROR
 * - policy-error (all other codes)           → 500  POLICY_ERROR
 *
 * Invariant: policy-error NEVER maps to 403, 404, or 200.
 *
 * @param policyResult - Real PolicyResult from Stage 2 engine (kind discriminated union)
 * @param subject - Canonical subject (used for authentication-status determination)
 * @param options - Evaluation options
 * @returns Deterministic HTTP-mapped authorization result
 */
export function mapPolicyToAuthorizationResult(
  policyResult: PolicyResult,
  subject: CanonicalAuthorizationSubject,
  options?: AuthorizationEvaluationOptions
): AuthorizationResult {
  const diagnosticsEnabled = options?.diagnosticsEnabled ?? false;

  switch (policyResult.kind) {
    case 'allow': {
      return {
        result: AuthorizationTransportResult.ALLOW,
        httpStatus: 200,
        subject,
      };
    }

    case 'forbidden': {
      // Authenticated and forbidden → 403
      // Unauthenticated with forbidden decision → 401 (authentication takes precedence)
      if (subject.status === AuthenticationStatus.AUTHENTICATED) {
        return {
          result: AuthorizationTransportResult.FORBIDDEN,
          httpStatus: 403,
          subject,
          errorMessage: 'Access denied',
        };
      }
      return {
        result: AuthorizationTransportResult.UNAUTHENTICATED,
        httpStatus: 401,
        subject,
        errorMessage: 'Authentication required',
      };
    }

    case 'not-found': {
      return {
        result: AuthorizationTransportResult.CONCEALED,
        httpStatus: 404,
        subject,
        errorMessage: 'Not found',
      };
    }

    case 'unauthenticated': {
      return {
        result: AuthorizationTransportResult.UNAUTHENTICATED,
        httpStatus: 401,
        subject,
        errorMessage: 'Authentication required',
      };
    }

    case 'policy-error': {
      // Transport table: missing-runtime-reference → 503; all other error codes → 500.
      // Derived exclusively from the documented PolicyErrorCode; never parse error messages.
      // Invariant: policy-error NEVER becomes 403, 404, or 200.
      const { code } = policyResult.error;
      const httpStatus = code === 'missing-runtime-reference' ? 503 : 500;
      return {
        result: AuthorizationTransportResult.POLICY_ERROR,
        httpStatus,
        subject,
        errorMessage: 'Policy evaluation error',
        diagnostics: diagnosticsEnabled ? { policyEvaluationDetails: code } : undefined,
      };
    }

    default: {
      // Exhaustive assertion on the entire policyResult value (not just .kind after narrowing)
      const _exhaustiveCheck: never = policyResult;
      void _exhaustiveCheck;
      return {
        result: AuthorizationTransportResult.POLICY_ERROR,
        httpStatus: 500,
        subject,
        errorMessage: 'Policy evaluation error',
      };
    }
  }
}

/**
 * Evaluate authorization for a server route or action using a raw session object.
 *
 * The registry and declaration are provided by the caller; there is no global state.
 * Each call site owns its registry and declares its policy explicitly.
 *
 * For token-based API routes (e.g., JWT from `getAdminToken()`), use
 * `canonicalSubjectFromToken()` and `mapPolicyToAuthorizationResult()` directly.
 *
 * @example
 * ```ts
 * // Application registry (created once, shared across routes)
 * const registry = createPolicyRegistry();
 * registry.registerEvaluator({ ... });
 *
 * // Route handler
 * const session = await auth(); // NextAuth auth()
 * const authResult = await evaluateApiAuthorization(
 *   session,
 *   defineAccessDeclaration({ kind: 'role-any', roles: ['admin'] }),
 *   'site',
 *   registry
 * );
 * if (authResult.result !== AuthorizationTransportResult.ALLOW) {
 *   return Response.json({ error: authResult.errorMessage }, { status: authResult.httpStatus });
 * }
 * ```
 *
 * @param session - Raw session value (e.g., NextAuth session or null)
 * @param declaration - Access declaration defining the authorization policy
 * @param owner - Policy owner (framework, site, or plugin namespace)
 * @param registry - Stage 2 policy registry with required evaluator registrations
 * @param options - Evaluation options
 * @returns Deterministic HTTP-mapped authorization result
 */
export async function evaluateApiAuthorization(
  session: unknown,
  declaration: AccessDeclaration,
  owner: OwnerId,
  registry: PolicyRegistry,
  options?: AuthorizationEvaluationOptions
): Promise<AuthorizationResult> {
  try {
    // Extract canonical subject using compatibility adapter
    const { subject, diagnostics: compatDiagnostics } = canonicalSubjectFromSession(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      session as any,
      options?.compatibilityOptions
    );

    // Convert to normalized policy subject for Stage 2
    const normalizedSubject = canonicalSubjectToNormalizedPolicySubject(subject);

    // Evaluate with real Stage 2 policy engine
    const policyResult = await registry.evaluateDeclaration(declaration, {
      subject: normalizedSubject,
      owner,
    });

    // Map Stage 2 result to HTTP-mapped authorization result
    const authResult = mapPolicyToAuthorizationResult(policyResult, subject, options);

    // Append compatibility diagnostics if enabled
    if (options?.diagnosticsEnabled && compatDiagnostics) {
      authResult.diagnostics = {
        ...authResult.diagnostics,
        migrationType: compatDiagnostics.usedCompatibilityPath ? 'legacy-compat' : 'canonical',
      };
    }

    return authResult;
  } catch {
    // Unexpected exception in wrapper infrastructure; fail closed.
    // Raw exceptions, stack traces, and internal state are never exposed.
    return {
      result: AuthorizationTransportResult.POLICY_ERROR,
      httpStatus: 500,
      // Use the frozen unauthenticated subject constant via normalizeAuthorizationSubject(null).
      subject: _normForFallback(null),
      errorMessage: 'Authorization evaluation error',
    };
  }
}

// ---------------------------------------------------------------------------
// Server-action authorization wrapper
// ---------------------------------------------------------------------------

/**
 * Result of a server-action authorization evaluation.
 *
 * Unlike the HTTP-mapped result, this result is oriented for use in server
 * actions where HTTP status codes are not directly relevant. The `allowed`
 * flag provides a simple boolean gate, while `result` gives the full
 * discriminated outcome for callers that need the distinction.
 *
 * Never contains raw exceptions, stack traces, or internal implementation details.
 */
export interface ServerActionAuthorizationResult {
  /** Deterministic authorization result code */
  result: AuthorizationTransportResult;

  /** Whether the action is allowed to proceed */
  allowed: boolean;

  /** Canonical subject that was evaluated */
  subject: CanonicalAuthorizationSubject;

  /** Sanitized error message for display to callers (when not allowed) */
  errorMessage?: string;

  /** Diagnostics (only if explicitly enabled) */
  diagnostics?: {
    policyEvaluationDetails?: string;
    migrationType?: 'canonical' | 'legacy-compat';
  };
}

/**
 * Evaluate authorization for a Next.js server action.
 *
 * Functionally equivalent to `evaluateApiAuthorization` but returns a
 * result oriented for server-action consumers: no HTTP status code;
 * includes an explicit `allowed` boolean flag.
 *
 * The session may be obtained via `auth()` (NextAuth) or any other
 * dependency-injected subject source. Framework types are not imported
 * into this module.
 *
 * @example
 * ```ts
 * // server-action file:
 * 'use server';
 *
 * import { auth } from '@/auth';
 * import { evaluateServerActionAuthorization } from '@devholm/sdk/server';
 * import { appRegistry, adminAccessDeclaration, adminAccessOwner } from '@/lib/sdk-authorization';
 *
 * export async function deleteUser(userId: string) {
 *   const session = await auth();
 *   const authResult = await evaluateServerActionAuthorization(
 *     session,
 *     adminAccessDeclaration,
 *     adminAccessOwner,
 *     appRegistry,
 *   );
 *   if (!authResult.allowed) {
 *     return { success: false, error: authResult.errorMessage };
 *   }
 *   // proceed with action...
 * }
 * ```
 *
 * @param session - Raw session value (e.g., NextAuth session or null)
 * @param declaration - Access declaration defining the authorization policy
 * @param owner - Policy owner (framework, site, or plugin namespace)
 * @param registry - Stage 2 policy registry with required evaluator registrations
 * @param options - Evaluation options
 * @returns Action-oriented authorization result with explicit allowed flag
 */
export async function evaluateServerActionAuthorization(
  session: unknown,
  declaration: AccessDeclaration,
  owner: OwnerId,
  registry: PolicyRegistry,
  options?: AuthorizationEvaluationOptions
): Promise<ServerActionAuthorizationResult> {
  const httpResult = await evaluateApiAuthorization(session, declaration, owner, registry, options);
  return {
    result: httpResult.result,
    allowed: httpResult.result === AuthorizationTransportResult.ALLOW,
    subject: httpResult.subject,
    errorMessage: httpResult.errorMessage,
    diagnostics: httpResult.diagnostics,
  };
}
