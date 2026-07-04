import { SDK_RUNTIME_MIDDLEWARE } from './internal/runtime-tags';
import type { AccessDeclaration, OwnerId } from './contracts';

export interface MiddlewareRouteContract {
  readonly routeId: string;
  readonly owner: OwnerId;
  readonly access: AccessDeclaration;
}

export const sdkRuntimeMiddleware = SDK_RUNTIME_MIDDLEWARE;

export function defineMiddlewareRoute<T extends MiddlewareRouteContract>(contract: T): T {
  return contract;
}
