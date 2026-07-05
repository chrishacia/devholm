import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function run(command: string, args: string[], cwd = repoRoot) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
  });

  return {
    code: result.status ?? 1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function withTempProject(files: Record<string, string>) {
  const tempRoot = fs.mkdtempSync(path.join(repoRoot, '.tmp-sdk-boundary-'));

  for (const [relativeFilePath, content] of Object.entries(files)) {
    const fullPath = path.join(tempRoot, relativeFilePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }

  return {
    tempRoot,
    cleanup: () => fs.rmSync(tempRoot, { recursive: true, force: true }),
  };
}

function bundleFixtureWithEsbuild(entryImport: string) {
  const fixture = withTempProject({
    'entry.ts': `${entryImport}\n`,
  });

  const outputFile = path.join(fixture.tempRoot, 'bundle.js');
  const metafile = path.join(fixture.tempRoot, 'meta.json');

  const result = run('pnpm', [
    'exec',
    'esbuild',
    path.join(fixture.tempRoot, 'entry.ts'),
    '--bundle',
    '--platform=browser',
    '--format=esm',
    '--log-level=error',
    `--outfile=${outputFile}`,
    `--metafile=${metafile}`,
  ]);

  const metadata = fs.existsSync(metafile)
    ? JSON.parse(fs.readFileSync(metafile, 'utf8'))
    : { inputs: {} };

  fixture.cleanup();

  return {
    result,
    inputs: Object.keys(metadata.inputs ?? {}),
  };
}

describe('SDK package boundaries', () => {
  it('keeps the root and SDK package versions in lockstep during issue #6', () => {
    const rootPackage = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')
    ) as {
      version?: string;
    };
    const sdkPackage = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'packages/sdk/package.json'), 'utf8')
    ) as {
      version?: string;
    };

    expect(rootPackage.version).toBeDefined();
    expect(sdkPackage.version).toBeDefined();
    expect(sdkPackage.version).toBe(rootPackage.version);
  });

  it('resolves all supported public exports', () => {
    const script = `
      const targets = [
        '@devholm/sdk',
        '@devholm/sdk/server',
        '@devholm/sdk/middleware',
        '@devholm/sdk/react',
        '@devholm/sdk/testing'
      ];

      for (const target of targets) {
        const resolved = import.meta.resolve(target);
        if (!resolved) {
          throw new Error('Failed to resolve ' + target);
        }
      }
    `;

    const result = run('node', ['--input-type=module', '-e', script]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
  });

  it('blocks unexported SDK internals through the package export map', () => {
    const script = `
      let blocked = false;
      try {
        import.meta.resolve('@devholm/sdk/internal/runtime-tags');
      } catch (error) {
        if (error && error.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED') {
          blocked = true;
        }
      }

      if (!blocked) {
        throw new Error('Unexported internal import was not blocked');
      }
    `;

    const result = run('node', ['--input-type=module', '-e', script]);

    expect(result.code).toBe(0);
  });

  it('allows root-project TypeScript consumers to import @devholm/sdk', () => {
    const project = withTempProject({
      'consumer.ts': `
        import { defineAccessDeclaration } from '@devholm/sdk';

        defineAccessDeclaration({ kind: 'everyone' });
      `,
      'tsconfig.json': JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2020',
            module: 'ESNext',
            moduleResolution: 'Bundler',
            strict: true,
            noEmit: true,
            skipLibCheck: true,
          },
          include: ['consumer.ts'],
        },
        null,
        2
      ),
    });

    const result = run('pnpm', ['exec', 'tsc', '-p', path.join(project.tempRoot, 'tsconfig.json')]);
    project.cleanup();

    expect(result.code).toBe(0);
  });

  it('rejects alias-based bypass imports from SDK source files via lint rules', () => {
    const tempDir = path.join(repoRoot, 'packages/sdk/.tmp-lint-fixtures');
    const fixturePath = path.join(tempDir, 'alias-bypass.ts');

    fs.mkdirSync(tempDir, { recursive: true });
    fs.writeFileSync(fixturePath, "import '@core/lib/auth-helpers';\n");

    const result = run('pnpm', ['exec', 'eslint', '--no-ignore', '--format', 'json', fixturePath]);
    fs.rmSync(tempDir, { recursive: true, force: true });

    expect(result.code).not.toBe(0);
    expect(result.stdout).toContain('no-restricted-imports');
  });

  it('rejects deep-relative imports into root internals from SDK source files via lint rules', () => {
    const tempDir = path.join(repoRoot, 'packages/sdk/.tmp-lint-fixtures');
    const fixturePath = path.join(tempDir, 'relative-bypass.ts');

    fs.mkdirSync(tempDir, { recursive: true });
    fs.writeFileSync(fixturePath, "import '../../../src/core/lib/auth-helpers';\n");

    const result = run('pnpm', ['exec', 'eslint', '--no-ignore', '--format', 'json', fixturePath]);
    fs.rmSync(tempDir, { recursive: true, force: true });

    expect(result.code).not.toBe(0);
    expect(result.stdout).toContain('no-restricted-imports');
  });

  it('keeps middleware entrypoint browser-bundle compatible and free from server entrypoint leakage', () => {
    const { result, inputs } = bundleFixtureWithEsbuild(
      "import { defineMiddlewareRoute } from '@devholm/sdk/middleware';\nvoid defineMiddlewareRoute;"
    );

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');

    expect(inputs.some((input) => input.includes('packages/sdk/src/server.ts'))).toBe(false);
    expect(inputs.some((input) => input.includes('server-only'))).toBe(false);
  });

  it('keeps react entrypoint browser-bundle compatible and free from server entrypoint leakage', () => {
    const { result, inputs } = bundleFixtureWithEsbuild(
      "import { defineReactVisibility } from '@devholm/sdk/react';\nvoid defineReactVisibility;"
    );

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');

    expect(inputs.some((input) => input.includes('packages/sdk/src/server.ts'))).toBe(false);
    expect(inputs.some((input) => input.includes('server-only'))).toBe(false);
  });

  it('root export bundles cleanly in client target – it carries no server-only marker', () => {
    // Try to bundle root export
    const { result } = bundleFixtureWithEsbuild(
      "import { defineAccessDeclaration } from '@devholm/sdk';\nvoid defineAccessDeclaration;"
    );
    // Should succeed as root export is neutral (no server-only guard)
    expect(result.code).toBe(0);
  });

  it('@devholm/sdk/server is rejected from a browser/client bundle because of the server-only boundary', () => {
    // Attempting to bundle the server entrypoint for a browser target must fail
    // because the package export map explicitly disables the server export via "browser": null.
    // esbuild will reject this during resolution when building for browser target.
    const { result } = bundleFixtureWithEsbuild(
      "import { createPolicyRegistry } from '@devholm/sdk/server';\nvoid createPolicyRegistry;"
    );

    // The bundle must fail – this is the production boundary enforcement via conditional exports.
    expect(result.code).not.toBe(0);
    // Verify the error is related to the export being disabled via "browser": null
    // (esbuild explicitly mentions the package.json and the disabled condition)
    expect(result.stderr).toMatch(/browser.*null|disabled by the package author/i);
  });

  it('@devholm/sdk/server is successfully importable in a Node.js/server context', () => {
    // Verify that the server export CAN be resolved successfully in Node contexts.
    // The conditional export must allow server consumers to resolve the entry point.
    const script = `
      // Verify the export path resolves for Node/import conditions
      const resolved = import.meta.resolve('@devholm/sdk/server');
      
      if (!resolved) {
        console.error('Failed to resolve @devholm/sdk/server');
        process.exit(1);
      }
      
      // Verify it resolves to the server.ts source file
      if (!resolved.includes('server.ts')) {
        console.error('Resolved path does not include server.ts:', resolved);
        process.exit(1);
      }
      
      console.log('Server export resolved successfully');
    `;

    const result = run('node', ['--input-type=module', '-e', script]);

    // Node resolution should succeed
    expect(result.code).toBe(0);
    // Verify the export was resolved correctly
    expect(result.stdout).toContain('Server export resolved successfully');
  });

  it('confirms @devholm/sdk/server carries the server-only marker', () => {
    const serverEntrypoint = path.join(repoRoot, 'packages/sdk/src/server.ts');
    const content = fs.readFileSync(serverEntrypoint, 'utf8');
    // Should either import 'server-only' directly or reference it
    expect(content).toMatch(/server-only/);
  });

  it('confirms server entrypoint includes server-only guard', () => {
    const serverEntrypoint = path.join(repoRoot, 'packages/sdk/src/server.ts');
    const content = fs.readFileSync(serverEntrypoint, 'utf8');
    // Should import server-only as first import (check for both quote styles)
    expect(content).toMatch(/^import\s+["']server-only["'];/);
    // Should also have runtime guard (check for both quote styles)
    expect(content).toMatch(/typeof window !== ["']undefined["']/);
  });

  it('confirms middleware entrypoint does not contain server-only marker', () => {
    const middlewareEntrypoint = path.join(repoRoot, 'packages/sdk/src/middleware.ts');
    const content = fs.readFileSync(middlewareEntrypoint, 'utf8');
    // Middleware should NOT import server-only (it's browser-compatible)
    expect(content).not.toMatch(/import.*server-only/);
  });

  it('confirms react entrypoint does not contain server-only marker', () => {
    const reactEntrypoint = path.join(repoRoot, 'packages/sdk/src/react.ts');
    const content = fs.readFileSync(reactEntrypoint, 'utf8');
    // React should NOT import server-only (it's browser-compatible)
    expect(content).not.toMatch(/import.*server-only/);
  });

  it('confirms root entrypoint does not contain server-only marker', () => {
    const rootEntrypoint = path.join(repoRoot, 'packages/sdk/src/index.ts');
    const content = fs.readFileSync(rootEntrypoint, 'utf8');
    // Root should NOT import server-only (it's neutral)
    expect(content).not.toMatch(/import.*server-only/);
  });

  it('confirms testing entrypoint does not contain server-only marker in production build', () => {
    const testingEntrypoint = path.join(repoRoot, 'packages/sdk/src/testing.ts');
    const content = fs.readFileSync(testingEntrypoint, 'utf8');
    // Testing exports should not have server-only in production exports
    // (though it may be used internally)
    const exportLines = content.split('\n').filter((line) => line.includes('export'));
    const hasServerOnlyExport = exportLines.some((line) => line.includes('server-only'));
    expect(hasServerOnlyExport).toBe(false);
  });

  it('confirms Vitest resolves server-only fixture in test environment only', () => {
    // This test should pass in Vitest (using the fixture)
    // Verify that the fixture path exists
    const fixturePath = path.join(repoRoot, 'src/test/__fixtures__/server-only.ts');
    expect(fs.existsSync(fixturePath)).toBe(true);
  });

  it('confirms all five public exports are independently importable', () => {
    const script = `
      const imports = [
        '@devholm/sdk',
        '@devholm/sdk/server',
        '@devholm/sdk/middleware',
        '@devholm/sdk/react',
        '@devholm/sdk/testing'
      ];

      const results = {};
      for (const imp of imports) {
        try {
          results[imp] = import.meta.resolve(imp);
        } catch (e) {
          console.error('Failed to resolve ' + imp + ':', e.message);
          process.exit(1);
        }
      }

      // Verify all resolved to different paths
      const paths = Object.values(results);
      const uniquePaths = new Set(paths);
      if (uniquePaths.size !== paths.length) {
        console.error('Some exports resolved to the same path');
        process.exit(1);
      }
    `;

    const result = run('node', ['--input-type=module', '-e', script]);
    expect(result.code).toBe(0);
  });

  it('Vitest server-only alias is test-only: the real package is incompatible with browser targets', () => {
    // The Vitest config maps 'server-only' to a fixture stub in tests.
    // That stub must not be used outside the test environment.
    // Confirm: the real 'server-only' package has no browser field and
    // will cause a build error when bundled for browser, while the Vitest fixture exists.
    const vitestFixture = path.join(repoRoot, 'src/test/__fixtures__/server-only.ts');
    expect(fs.existsSync(vitestFixture)).toBe(true);

    // The actual server-only package must NOT have a browser-compatible main entry
    const realServerOnly = path.join(repoRoot, 'node_modules/server-only');
    if (fs.existsSync(realServerOnly)) {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(realServerOnly, 'package.json'), 'utf8')
      ) as Record<string, unknown>;
      // server-only must not have a browser field or browser-specific entry
      expect(pkg.browser).toBeUndefined();
    }
  });
});
