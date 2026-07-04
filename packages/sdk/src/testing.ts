import { SDK_RUNTIME_TESTING } from './internal/runtime-tags';
import type { AccessDeclaration } from './contracts';
import { supportedSdkImportPaths } from './contracts';

export const sdkRuntimeTesting = SDK_RUNTIME_TESTING;

export function assertAccessDeclarationSerializable(value: AccessDeclaration): string {
  assertSerializableAccessDeclaration(value);

  const serialized = JSON.stringify(value);

  if (typeof serialized !== 'string') {
    throw new Error('Access declaration must be JSON serializable to a string payload.');
  }

  return serialized;
}

function assertSerializableAccessDeclaration(value: unknown): void {
  if (!isPlainObject(value)) {
    throw new Error('Access declaration must be a plain object with JSON-safe properties.');
  }

  assertSerializableNode(value, '$', new Set<object>());
}

function assertSerializableNode(value: unknown, path: string, ancestors: Set<object>): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Access declaration contains a non-finite number at ${path}.`);
    }

    return;
  }

  if (
    typeof value === 'undefined' ||
    typeof value === 'function' ||
    typeof value === 'symbol' ||
    typeof value === 'bigint'
  ) {
    throw new Error(`Access declaration contains an unsupported value at ${path}.`);
  }

  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      throw new Error(`Access declaration contains a circular reference at ${path}.`);
    }

    ancestors.add(value);

    try {
      for (const key of Reflect.ownKeys(value)) {
        if (typeof key === 'symbol') {
          throw new Error(`Access declaration contains a symbol-keyed array entry at ${path}.`);
        }

        if (key === 'length') {
          continue;
        }

        if (!/^(0|[1-9]\d*)$/.test(key)) {
          throw new Error(`Access declaration contains a non-index array key at ${path}.${key}.`);
        }

        const descriptor = Object.getOwnPropertyDescriptor(value, key);

        if (!descriptor || !descriptor.enumerable || descriptor.get || descriptor.set) {
          throw new Error(
            `Access declaration contains a non-serializable array entry at ${path}.${key}.`
          );
        }
      }

      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) {
          throw new Error(
            `Access declaration contains a missing array entry at ${path}[${index}].`
          );
        }

        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));

        if (!descriptor || !descriptor.enumerable || descriptor.get || descriptor.set) {
          throw new Error(
            `Access declaration contains a non-serializable array entry at ${path}[${index}].`
          );
        }

        assertSerializableNode(value[index], `${path}[${index}]`, ancestors);
      }
    } finally {
      ancestors.delete(value);
    }

    return;
  }

  if (!isPlainObject(value)) {
    throw new Error(`Access declaration contains a non-plain object at ${path}.`);
  }

  if (ancestors.has(value)) {
    throw new Error(`Access declaration contains a circular reference at ${path}.`);
  }

  ancestors.add(value);

  try {
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key === 'symbol') {
        throw new Error(`Access declaration contains a symbol-keyed property at ${path}.`);
      }

      const descriptor = Object.getOwnPropertyDescriptor(value, key);

      if (!descriptor || !descriptor.enumerable || descriptor.get || descriptor.set) {
        throw new Error(
          `Access declaration contains a non-serializable property at ${path}.${key}.`
        );
      }

      assertSerializableNode((value as Record<string, unknown>)[key], `${path}.${key}`, ancestors);
    }
  } finally {
    ancestors.delete(value);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

export { supportedSdkImportPaths };
