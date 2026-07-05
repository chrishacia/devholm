/**
 * SDK Stage 3: Internal Normalization Helpers
 * =============================================
 *
 * Shared safe-property-reading utilities used internally by `normalization.ts`
 * and `compatibility-adapter.ts`.
 *
 * This module is intentionally NOT re-exported from `server.ts`. It is an
 * implementation detail of the Stage 3 normalization layer; its API surface is
 * not stable and is not part of `@devholm/sdk/server`.
 *
 * Related: ADR-0002, Stage 3 normalization
 */

// ---------------------------------------------------------------------------
// Prototype-pollution key set
// ---------------------------------------------------------------------------

export const SAFE_POLLUTION_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
  'hasOwnProperty',
  'toString',
  'valueOf',
]);

// ---------------------------------------------------------------------------
// Accessor-safe property reading helpers
// ---------------------------------------------------------------------------

/**
 * Read an own data-property value from `obj` without invoking accessor traps.
 *
 * Uses `Object.getOwnPropertyDescriptor` to distinguish data properties
 * (which have `value`) from accessor properties (which have `get`/`set`).
 * Accessor properties are NOT accessed; undefined is returned instead.
 *
 * If `obj` is a Proxy, the `[[GetOwnProperty]]` trap is invoked, which cannot
 * be avoided. Exceptions from revoked proxies or throwing traps are caught and
 * undefined is returned.
 */
export function safeReadOwnProperty(obj: object, key: string): unknown {
  try {
    const desc = Object.getOwnPropertyDescriptor(obj, key);
    if (desc === undefined) return undefined;
    if ('get' in desc || 'set' in desc) return undefined;
    return desc.value;
  } catch {
    return undefined;
  }
}

/**
 * Safely extract a non-empty string from an own data property.
 */
export function safeOwnString(obj: object, key: string): string | null {
  const val = safeReadOwnProperty(obj, key);
  if (typeof val !== 'string' || val.length === 0) return null;
  return val;
}

/**
 * Safely extract a literal boolean true from an own data property.
 * Only `true` returns true; any other value returns false.
 */
export function safeOwnBoolean(obj: object, key: string): boolean {
  return safeReadOwnProperty(obj, key) === true;
}

/**
 * Safely extract string elements from an array without invoking accessor-backed indices.
 * Returns sorted, deduplicated, pollution-filtered strings.
 *
 * Every potentially trapping operation — including `Array.isArray`, `Object.getOwnPropertyNames`,
 * and per-element `Object.getOwnPropertyDescriptor` — is wrapped in an exception boundary.
 * A revoked proxy, a proxy whose `isArray` internal slot throws, or a proxy whose
 * `[[OwnPropertyKeys]]` trap throws will return a frozen empty array instead of propagating
 * an exception to the caller.
 */
export function safeStringElements(val: unknown): readonly string[] {
  // Array.isArray invokes the [[IsArray]] internal method which can throw on a revoked proxy
  // or a proxy whose handler has been configured to throw. Must be inside a try/catch.
  let isArr: boolean;
  try {
    isArr = Array.isArray(val);
  } catch {
    return Object.freeze([]);
  }
  if (!isArr) return Object.freeze([]);

  const result: string[] = [];

  let ownKeys: string[];
  try {
    ownKeys = Object.getOwnPropertyNames(val);
  } catch {
    return Object.freeze([]);
  }

  for (const key of ownKeys) {
    const idx = Number(key);
    if (!Number.isFinite(idx) || idx < 0 || idx !== Math.floor(idx) || String(idx) !== key) {
      continue;
    }
    try {
      const desc = Object.getOwnPropertyDescriptor(val, key);
      if (desc === undefined) continue;
      if ('get' in desc || 'set' in desc) continue;
      const el = desc.value;
      if (typeof el !== 'string' || el.length === 0) continue;
      if (!SAFE_POLLUTION_KEYS.has(el)) result.push(el);
    } catch {
      continue;
    }
  }

  return Object.freeze(Array.from(new Set(result)).sort());
}

/**
 * Safely extract a sorted, deduplicated, pollution-filtered string array
 * from an own data property.
 */
export function safeOwnStringArray(obj: object, key: string): readonly string[] {
  const val = safeReadOwnProperty(obj, key);
  return safeStringElements(val);
}
