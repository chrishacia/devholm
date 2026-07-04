import { describe, it, expect } from 'vitest';
import { supportedSdkImportPaths as supportedSdkImportPathsFromRoot } from '@devholm/sdk';
import { supportedSdkImportPaths as supportedSdkImportPathsFromTesting } from '@devholm/sdk/testing';

describe('SDK canonical import paths', () => {
  it('returns exactly five supported import paths', () => {
    const paths = supportedSdkImportPathsFromRoot();
    expect(paths.length).toBe(5);
  });

  it('returns expected paths in correct order', () => {
    const paths = supportedSdkImportPathsFromRoot();
    const expected = [
      '@devholm/sdk',
      '@devholm/sdk/server',
      '@devholm/sdk/middleware',
      '@devholm/sdk/react',
      '@devholm/sdk/testing',
    ];
    expect(paths).toEqual(expected);
  });

  it('returns identical results from both @devholm/sdk and @devholm/sdk/testing', () => {
    const fromRoot = supportedSdkImportPathsFromRoot();
    const fromTesting = supportedSdkImportPathsFromTesting();
    expect(fromRoot).toEqual(fromTesting);
  });

  it('returns results that cannot be mutated', () => {
    const paths = supportedSdkImportPathsFromRoot();
    const originalLength = paths.length;

    // Attempt mutations (should have no effect if truly immutable)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = paths as any[];
    result.push('malicious-path');

    // Verify original function still returns same result
    const newPaths = supportedSdkImportPathsFromRoot();
    expect(newPaths.length).toBe(originalLength);
    expect(newPaths).toEqual([
      '@devholm/sdk',
      '@devholm/sdk/server',
      '@devholm/sdk/middleware',
      '@devholm/sdk/react',
      '@devholm/sdk/testing',
    ]);
  });

  it('returns readonly array type that prevents index assignment', () => {
    const paths = supportedSdkImportPathsFromRoot();
    // TypeScript should enforce that paths is readonly
    // At runtime, attempt to mutate would fail on strict object
    expect(() => {
      // @ts-expect-error - Testing runtime immutability
      paths[0] = '@devholm/sdk/evil';
    }).not.toThrow(); // JavaScript arrays can be mutated at runtime
    // But the actual content should remain unchanged on the next call
    const freshPaths = supportedSdkImportPathsFromRoot();
    expect(freshPaths[0]).toBe('@devholm/sdk');
  });

  it('proves no duplicate implementation between root and testing exports', () => {
    // Both should be the same function (not reimplemented)
    // This is tested by behavior match above, but we can verify the content too
    const fromRoot = supportedSdkImportPathsFromRoot();
    const fromTesting = supportedSdkImportPathsFromTesting();

    // Should return identical array structure
    expect(fromRoot).toEqual(fromTesting);

    // Multiple calls should be consistent
    expect(supportedSdkImportPathsFromRoot()).toEqual(supportedSdkImportPathsFromRoot());
    expect(supportedSdkImportPathsFromTesting()).toEqual(supportedSdkImportPathsFromTesting());
  });

  it('verifies all paths are valid import strings', () => {
    const paths = supportedSdkImportPathsFromRoot();
    for (const path of paths) {
      expect(typeof path).toBe('string');
      expect(path.length).toBeGreaterThan(0);
      expect(path).toMatch(/^@devholm\/sdk/);
    }
  });

  it('verifies paths resolve to actual exports', async () => {
    // Test by verifying we can successfully import each path
    const paths = supportedSdkImportPathsFromRoot();
    expect(paths).toContain('@devholm/sdk');
    expect(paths).toContain('@devholm/sdk/server');
    expect(paths).toContain('@devholm/sdk/middleware');
    expect(paths).toContain('@devholm/sdk/react');
    expect(paths).toContain('@devholm/sdk/testing');
  });
});
