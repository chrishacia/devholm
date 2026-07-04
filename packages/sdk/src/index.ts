import { SDK_RUNTIME_NEUTRAL } from './internal/runtime-tags';

export type OwnerId = 'framework' | 'site' | `plugin:${string}`;

export type PermissionId = string & {
  readonly __brand: 'PermissionId';
};

export type CapabilityId = string & {
  readonly __brand: 'CapabilityId';
};

export type AccessDeclaration =
  | { kind: 'everyone' }
  | { kind: 'anonymous-only' }
  | { kind: 'authenticated' }
  | { kind: 'role-any'; roles: readonly string[] }
  | { kind: 'permission-any'; permissions: readonly PermissionId[] }
  | { kind: 'ownership'; resolverId: string }
  | { kind: 'custom'; evaluatorId: string }
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

export function defineAccessDeclaration<T extends AccessDeclaration>(declaration: T): T {
  return declaration;
}

export function defineRuntimeNeutralContract<T extends RuntimeNeutralContract>(contract: T): T {
  return contract;
}
