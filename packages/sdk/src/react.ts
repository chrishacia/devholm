'use client';

import { SDK_RUNTIME_REACT } from './internal/runtime-tags';
import type { AccessDeclaration, OwnerId } from './index';

export interface ReactVisibilityContract {
  readonly id: string;
  readonly owner: OwnerId;
  readonly visibleWhen: AccessDeclaration;
}

export const sdkRuntimeReact = SDK_RUNTIME_REACT;

export function defineReactVisibility<T extends ReactVisibilityContract>(contract: T): T {
  return contract;
}
