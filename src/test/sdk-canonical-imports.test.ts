import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { supportedSdkImportPaths as supportedSdkImportPathsFromRoot } from '@devholm/sdk';
import { supportedSdkImportPaths as supportedSdkImportPathsFromTesting } from '@devholm/sdk/testing';

const repoRoot = resolve(fileURLToPath(import.meta.url), '../../..');

function runNode(script: string) {
  return spawnSync('node', ['--input-type=module', '-e', script], {
    encoding: 'utf8',
    cwd: repoRoot,
  });
}

const CANONICAL_PATHS = [
  '@devholm/sdk',
  '@devholm/sdk/server',
  '@devholm/sdk/middleware',
  '@devholm/sdk/react',
  '@devholm/sdk/testing',
];

describe('SDK canonical import paths', () => {
  it('returns exactly five supported import paths', () => {
    const paths = supportedSdkImportPathsFromRoot();
    expect(paths).toHaveLength(5);
  });

  it('returns expected paths in the documented order', () => {
    expect(supportedSdkImportPathsFromRoot()).toEqual(CANONICAL_PATHS);
  });

  it('root and testing expose the same canonical implementation via direct re-export', () => {
    // Both imports are re-exports of the same function from contracts.ts.
    // They must be reference-identical (same function object) because testing.ts re-exports
    // directly from contracts without wrapping.
    expect(supportedSdkImportPathsFromRoot).toBe(supportedSdkImportPathsFromTesting);
  });

  it('each call returns a fresh runtime copy – mutations do not affect subsequent calls', () => {
    const paths = supportedSdkImportPathsFromRoot();
    const originalLength = paths.length;

    // The contract: each call returns a fresh mutable array.
    // Mutations to the returned array do not affect the next call.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (paths as any[]).push('malicious-path');

    const newPaths = supportedSdkImportPathsFromRoot();
    expect(newPaths).toHaveLength(originalLength);
    expect(newPaths).toEqual(CANONICAL_PATHS);
  });

  it('returned array is not frozen – TypeScript readonly type only; runtime mutation is possible', () => {
    const paths = supportedSdkImportPathsFromRoot();
    expect(Object.isFrozen(paths)).toBe(false);
    expect(() => {
      // @ts-expect-error – intentional mutation to verify non-frozen contract
      paths[0] = '@devholm/sdk/evil';
    }).not.toThrow();
    // Fresh call is unaffected
    expect(supportedSdkImportPathsFromRoot()[0]).toBe('@devholm/sdk');
  });

  it('all five public exports resolve through the package export map', () => {
    const script = CANONICAL_PATHS.map((p) => `import.meta.resolve(${JSON.stringify(p)});`).join(
      '\n'
    );
    const result = runNode(script);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });

  it('non-server paths resolve in a browser-compatible Node module resolution', () => {
    const clientPaths = CANONICAL_PATHS.filter((p) => p !== '@devholm/sdk/server');
    const script = clientPaths
      .map(
        (p, i) =>
          `const r${i} = import.meta.resolve(${JSON.stringify(p)}); if (!r${i}) throw new Error('failed: ${p}');`
      )
      .join('\n');
    const result = runNode(script);
    expect(result.status).toBe(0);
  });

  it('@devholm/sdk/server resolves to the server entrypoint (server-target verification)', () => {
    // Use import.meta.resolve rather than a Vitest alias to prove production-path resolution.
    const script = `
      const resolved = import.meta.resolve('@devholm/sdk/server');
      if (!resolved || !resolved.includes('server')) {
        throw new Error('server path not resolved correctly: ' + resolved);
      }
    `;
    const result = runNode(script);
    expect(result.status).toBe(0);
  });

  it('representative deep/internal import is blocked by the export map', () => {
    const script = `
      let blocked = false;
      try {
        import.meta.resolve('@devholm/sdk/internal/runtime-tags');
      } catch (e) {
        if (e && e.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED') blocked = true;
      }
      if (!blocked) throw new Error('deep import was not blocked');
    `;
    const result = runNode(script);
    expect(result.status).toBe(0);
  });

  it('additional representative deep paths are blocked by the export map', () => {
    const blockedPaths = [
      '@devholm/sdk/contracts',
      '@devholm/sdk/internal',
      '@devholm/sdk/src/server/policy',
    ];
    for (const p of blockedPaths) {
      const script = `
        let blocked = false;
        try {
          import.meta.resolve(${JSON.stringify(p)});
        } catch (e) {
          if (e && (e.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED' || e.code === 'ERR_MODULE_NOT_FOUND')) {
            blocked = true;
          }
        }
        if (!blocked) throw new Error('expected ' + ${JSON.stringify(p)} + ' to be blocked, but it was not');
      `;
      const result = runNode(script);
      expect(result.status).toBe(0);
    }
  });
});
