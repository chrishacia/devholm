import 'server-only';

import { SDK_RUNTIME_SERVER } from './internal/runtime-tags';
import type { AccessDeclaration, OwnerId, PermissionId } from './index';

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
