import { SDK_RUNTIME_NEUTRAL } from './internal/runtime-tags';

export type OwnerId = 'framework' | 'site' | `plugin:${string}`;

export type PermissionId = string & {
  readonly __brand: 'PermissionId';
};

export type CapabilityId = string & {
  readonly __brand: 'CapabilityId';
};

export type PolicyResultKind =
  | 'allow'
  | 'unauthenticated'
  | 'forbidden'
  | 'not-found'
  | 'policy-error';

export type PolicyErrorCode =
  | 'invalid-declaration'
  | 'invalid-identifier'
  | 'invalid-registration'
  | 'missing-runtime-reference'
  | 'evaluator-failed'
  | 'resolver-failed'
  | 'composition-failed'
  | 'invalid-result';

export interface PolicyErrorDetail {
  readonly code: PolicyErrorCode;
  readonly path?: string;
  readonly owner?: OwnerId;
  readonly referenceId?: string;
  readonly declarationKind?: AccessDeclaration['kind'];
}

export interface AllowPolicyResult {
  readonly kind: 'allow';
}

export interface UnauthenticatedPolicyResult {
  readonly kind: 'unauthenticated';
}

export interface ForbiddenPolicyResult {
  readonly kind: 'forbidden';
}

export interface NotFoundPolicyResult {
  readonly kind: 'not-found';
}

export interface PolicyErrorResult {
  readonly kind: 'policy-error';
  readonly error: PolicyErrorDetail;
}

export type PolicyResult =
  | AllowPolicyResult
  | UnauthenticatedPolicyResult
  | ForbiddenPolicyResult
  | NotFoundPolicyResult
  | PolicyErrorResult;

export interface NormalizedPolicySubject {
  readonly authenticated: boolean;
  readonly subjectId?: string;
  readonly roles: readonly string[];
  readonly permissions: readonly PermissionId[];
}

export interface PolicyEvaluationContext {
  readonly subject: NormalizedPolicySubject;
  readonly resource?: Readonly<Record<string, unknown>>;
  readonly owner?: OwnerId;
  readonly declarationId?: string;
}

export interface PolicyValidationIssue {
  readonly code: PolicyErrorCode;
  readonly path: string;
  readonly owner?: OwnerId;
  readonly referenceId?: string;
  readonly declarationKind?: AccessDeclaration['kind'];
}

export interface PolicyValidationResult {
  readonly valid: boolean;
  readonly issues: readonly PolicyValidationIssue[];
}

export type PolicyEvaluatorId = string & {
  readonly __brand: 'PolicyEvaluatorId';
};

export type PolicyResolverId = string & {
  readonly __brand: 'PolicyResolverId';
};

export type AccessDeclaration =
  | { kind: 'everyone' }
  | { kind: 'anonymous-only' }
  | { kind: 'authenticated' }
  | { kind: 'role-any'; roles: readonly string[] }
  | { kind: 'permission-any'; permissions: readonly PermissionId[] }
  | { kind: 'ownership'; resolverId: PolicyResolverId }
  | { kind: 'custom'; evaluatorId: PolicyEvaluatorId }
  | { kind: 'allOf'; policies: readonly AccessDeclaration[] }
  | { kind: 'anyOf'; policies: readonly AccessDeclaration[] };

export interface RuntimeNeutralContract {
  readonly id: string;
  readonly owner: OwnerId;
  readonly access: AccessDeclaration;
}

export const sdkRuntimeNeutral = SDK_RUNTIME_NEUTRAL;

export function permissionId(value: string): PermissionId {
  return value as PermissionId;
}

export function capabilityId(value: string): CapabilityId {
  return value as CapabilityId;
}

export function policyEvaluatorId(value: string): PolicyEvaluatorId {
  return value as PolicyEvaluatorId;
}

export function policyResolverId(value: string): PolicyResolverId {
  return value as PolicyResolverId;
}

export function defineAccessDeclaration<T extends AccessDeclaration>(declaration: T): T {
  return declaration;
}

export function defineNormalizedPolicySubject<T extends NormalizedPolicySubject>(subject: T): T {
  return subject;
}

export function defineRuntimeNeutralContract<T extends RuntimeNeutralContract>(contract: T): T {
  return contract;
}

export function supportedSdkImportPaths(): readonly string[] {
  return [
    '@devholm/sdk',
    '@devholm/sdk/server',
    '@devholm/sdk/middleware',
    '@devholm/sdk/react',
    '@devholm/sdk/testing',
  ];
}
