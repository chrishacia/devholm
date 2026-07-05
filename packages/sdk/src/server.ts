import 'server-only';
import './__server-only-marker__';

import { SDK_RUNTIME_SERVER } from './internal/runtime-tags';
import type { AccessDeclaration, OwnerId, PermissionId } from './contracts';

export * from './server/policy';

if (typeof window !== 'undefined') {
  throw new Error(
    'This module cannot be imported from a Client Component module. It should only be used from a Server Component.'
  );
}

export interface ServerRegistrationContract {
  readonly id: string;
  readonly owner: OwnerId;
  readonly access: AccessDeclaration;
  readonly requiredPermissions?: readonly PermissionId[];
}

export const sdkRuntimeServer = SDK_RUNTIME_SERVER;

export function defineServerRegistration<T extends ServerRegistrationContract>(contract: T): T {
  return contract;
}
