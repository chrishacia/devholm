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
});
