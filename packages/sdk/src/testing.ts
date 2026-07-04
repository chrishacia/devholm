import { SDK_RUNTIME_TESTING } from './internal/runtime-tags';
import type { AccessDeclaration } from './index';

export const sdkRuntimeTesting = SDK_RUNTIME_TESTING;

export function assertAccessDeclarationSerializable(value: AccessDeclaration): string {
  const serialized = JSON.stringify(value);

  if (typeof serialized !== 'string') {
    throw new Error('Access declaration must be JSON serializable to a string payload.');
  }

  return serialized;
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
