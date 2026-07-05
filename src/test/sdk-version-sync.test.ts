/**
 * sdk-version-sync.test.ts
 *
 * Tests for scripts/sync-sdk-version.ts
 *
 * Covers:
 *  - reads root version correctly
 *  - updates SDK version exactly
 *  - fails visibly when root manifest is absent
 *  - fails visibly when SDK manifest is absent
 *  - fails visibly when root manifest is malformed JSON
 *  - fails visibly when SDK manifest is malformed JSON
 *  - fails when root manifest has no version field
 *  - fails when SDK manifest has no version field
 *  - does not modify unrelated fields in the SDK manifest
 *  - lockstep: root and SDK end up with equal versions
 *  - dry-run fixture bump keeps both versions equal
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { resolve } from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { syncSdkVersion } from '../../scripts/sync-sdk-version.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const repoRoot = resolve(fileURLToPath(import.meta.url), '../../..');

interface Fixture {
  dir: string;
  rootPath: string;
  sdkPath: string;
}

function makeFixture(rootContent: string, sdkContent: string): Fixture {
  const dir = mkdtempSync(resolve(tmpdir(), 'devholm-vsync-'));
  const rootPath = resolve(dir, 'package.json');
  const sdkPath = resolve(dir, 'sdk-package.json');
  writeFileSync(rootPath, rootContent, 'utf8');
  writeFileSync(sdkPath, sdkContent, 'utf8');
  return { dir, rootPath, sdkPath };
}

function cleanFixture(f: Fixture): void {
  rmSync(f.dir, { recursive: true, force: true });
}

const VALID_ROOT = (version: string) =>
  JSON.stringify({ name: 'devholm', version, private: false }, null, 2) + '\n';

const VALID_SDK = (version: string) =>
  JSON.stringify(
    {
      name: '@devholm/sdk',
      version,
      private: true,
      type: 'module',
      sideEffects: false,
    },
    null,
    2
  ) + '\n';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sync-sdk-version', () => {
  let fixture: Fixture;

  afterEach(() => {
    if (fixture) cleanFixture(fixture);
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  it('reads the root version and writes it to the SDK manifest', () => {
    fixture = makeFixture(VALID_ROOT('4.0.0'), VALID_SDK('3.9.0'));
    syncSdkVersion(fixture.rootPath, fixture.sdkPath);
    const sdk = JSON.parse(readFileSync(fixture.sdkPath, 'utf8')) as {
      version: string;
    };
    expect(sdk.version).toBe('4.0.0');
  });

  it('produces identical versions in root and SDK after sync', () => {
    fixture = makeFixture(VALID_ROOT('3.8.1'), VALID_SDK('3.8.0'));
    syncSdkVersion(fixture.rootPath, fixture.sdkPath);
    const root = JSON.parse(readFileSync(fixture.rootPath, 'utf8')) as {
      version: string;
    };
    const sdk = JSON.parse(readFileSync(fixture.sdkPath, 'utf8')) as {
      version: string;
    };
    expect(sdk.version).toBe(root.version);
  });

  it('does not modify unrelated fields in the SDK manifest', () => {
    fixture = makeFixture(VALID_ROOT('5.0.0'), VALID_SDK('4.9.9'));
    syncSdkVersion(fixture.rootPath, fixture.sdkPath);
    const sdk = JSON.parse(readFileSync(fixture.sdkPath, 'utf8')) as Record<string, unknown>;
    expect(sdk['name']).toBe('@devholm/sdk');
    expect(sdk['private']).toBe(true);
    expect(sdk['type']).toBe('module');
    expect(sdk['sideEffects']).toBe(false);
  });

  it('is idempotent when versions already match', () => {
    fixture = makeFixture(VALID_ROOT('3.8.1'), VALID_SDK('3.8.1'));
    syncSdkVersion(fixture.rootPath, fixture.sdkPath);
    const sdk = JSON.parse(readFileSync(fixture.sdkPath, 'utf8')) as {
      version: string;
    };
    expect(sdk.version).toBe('3.8.1');
  });

  it('simulates a fixture bump: incrementing root version keeps both in lockstep', () => {
    // Simulate what release-it does: bumps root manifest, then hook syncs SDK.
    fixture = makeFixture(VALID_ROOT('3.8.0'), VALID_SDK('3.8.0'));
    // Pretend release-it has already bumped root to 3.9.0
    writeFileSync(fixture.rootPath, VALID_ROOT('3.9.0'), 'utf8');
    syncSdkVersion(fixture.rootPath, fixture.sdkPath);
    const root = JSON.parse(readFileSync(fixture.rootPath, 'utf8')) as {
      version: string;
    };
    const sdk = JSON.parse(readFileSync(fixture.sdkPath, 'utf8')) as {
      version: string;
    };
    expect(root.version).toBe('3.9.0');
    expect(sdk.version).toBe('3.9.0');
  });

  // -------------------------------------------------------------------------
  // Failure cases — root manifest problems
  // -------------------------------------------------------------------------

  it('throws a clear error when root manifest is absent', () => {
    fixture = makeFixture(VALID_ROOT('1.0.0'), VALID_SDK('1.0.0'));
    expect(() =>
      syncSdkVersion('/nonexistent/does-not-exist/package.json', fixture.sdkPath)
    ).toThrow(/cannot read root manifest/);
  });

  it('throws a clear error when root manifest is malformed JSON', () => {
    fixture = makeFixture('{ this is not json }', VALID_SDK('1.0.0'));
    expect(() => syncSdkVersion(fixture.rootPath, fixture.sdkPath)).toThrow(
      /root manifest is not valid JSON/
    );
  });

  it('throws a clear error when root manifest has no version field', () => {
    fixture = makeFixture(
      JSON.stringify({ name: 'devholm', private: false }, null, 2) + '\n',
      VALID_SDK('1.0.0')
    );
    expect(() => syncSdkVersion(fixture.rootPath, fixture.sdkPath)).toThrow(
      /root manifest has no valid "version" field/
    );
  });

  it('throws a clear error when root manifest version is an empty string', () => {
    fixture = makeFixture(VALID_ROOT(''), VALID_SDK('1.0.0'));
    expect(() => syncSdkVersion(fixture.rootPath, fixture.sdkPath)).toThrow(
      /root manifest has no valid "version" field/
    );
  });

  // -------------------------------------------------------------------------
  // Failure cases — SDK manifest problems
  // -------------------------------------------------------------------------

  it('throws a clear error when SDK manifest is absent', () => {
    fixture = makeFixture(VALID_ROOT('1.0.0'), VALID_SDK('1.0.0'));
    expect(() => syncSdkVersion(fixture.rootPath, '/nonexistent/sdk/package.json')).toThrow(
      /cannot read SDK manifest/
    );
  });

  it('throws a clear error when SDK manifest is malformed JSON', () => {
    fixture = makeFixture(VALID_ROOT('1.0.0'), '{ invalid }');
    expect(() => syncSdkVersion(fixture.rootPath, fixture.sdkPath)).toThrow(
      /SDK manifest is not valid JSON/
    );
  });

  it('throws a clear error when SDK manifest has no version field', () => {
    fixture = makeFixture(
      VALID_ROOT('1.0.0'),
      JSON.stringify({ name: '@devholm/sdk', private: true }, null, 2) + '\n'
    );
    expect(() => syncSdkVersion(fixture.rootPath, fixture.sdkPath)).toThrow(
      /SDK manifest has no "version" field/
    );
  });

  // -------------------------------------------------------------------------
  // CLI execution tests (spawnSync – checks actual exit codes in child process)
  // -------------------------------------------------------------------------

  it('CLI exits zero and synchronizes versions on success', () => {
    fixture = makeFixture(VALID_ROOT('5.0.0'), VALID_SDK('4.9.9'));
    const result = spawnSync(
      'pnpm',
      [
        'exec',
        'tsx',
        resolve(repoRoot, 'scripts/sync-sdk-version-cli.ts'),
        fixture.rootPath,
        fixture.sdkPath,
      ],
      { encoding: 'utf8', cwd: repoRoot }
    );
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    const sdk = JSON.parse(readFileSync(fixture.sdkPath, 'utf8')) as { version: string };
    expect(sdk.version).toBe('5.0.0');
  });

  it('CLI exits non-zero when root manifest is missing', () => {
    fixture = makeFixture(VALID_ROOT('1.0.0'), VALID_SDK('1.0.0'));
    const result = spawnSync(
      'pnpm',
      [
        'exec',
        'tsx',
        resolve(repoRoot, 'scripts/sync-sdk-version-cli.ts'),
        '/nonexistent/package.json',
        fixture.sdkPath,
      ],
      { encoding: 'utf8', cwd: repoRoot }
    );
    expect(result.status).not.toBe(0);
  });

  it('CLI exits non-zero when SDK manifest is missing', () => {
    fixture = makeFixture(VALID_ROOT('1.0.0'), VALID_SDK('1.0.0'));
    const result = spawnSync(
      'pnpm',
      [
        'exec',
        'tsx',
        resolve(repoRoot, 'scripts/sync-sdk-version-cli.ts'),
        fixture.rootPath,
        '/nonexistent/sdk/package.json',
      ],
      { encoding: 'utf8', cwd: repoRoot }
    );
    expect(result.status).not.toBe(0);
  });

  it('CLI exits non-zero when root manifest is malformed JSON', () => {
    fixture = makeFixture('{ invalid }', VALID_SDK('1.0.0'));
    const result = spawnSync(
      'pnpm',
      [
        'exec',
        'tsx',
        resolve(repoRoot, 'scripts/sync-sdk-version-cli.ts'),
        fixture.rootPath,
        fixture.sdkPath,
      ],
      { encoding: 'utf8', cwd: repoRoot }
    );
    expect(result.status).not.toBe(0);
  });

  it('CLI exits non-zero when SDK manifest is malformed JSON', () => {
    fixture = makeFixture(VALID_ROOT('1.0.0'), '{ invalid }');
    const result = spawnSync(
      'pnpm',
      [
        'exec',
        'tsx',
        resolve(repoRoot, 'scripts/sync-sdk-version-cli.ts'),
        fixture.rootPath,
        fixture.sdkPath,
      ],
      { encoding: 'utf8', cwd: repoRoot }
    );
    expect(result.status).not.toBe(0);
  });

  it('CLI produces success message on stdout and exits zero', () => {
    fixture = makeFixture(VALID_ROOT('5.0.0'), VALID_SDK('4.9.9'));
    const result = spawnSync(
      'pnpm',
      [
        'exec',
        'tsx',
        resolve(repoRoot, 'scripts/sync-sdk-version-cli.ts'),
        fixture.rootPath,
        fixture.sdkPath,
      ],
      { encoding: 'utf8', cwd: repoRoot }
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('5.0.0');
    expect(result.stderr).toBe('');
  });

  it('importing the library module in a fresh child process performs no sync, writes no output', () => {
    fixture = makeFixture(VALID_ROOT('5.0.0'), VALID_SDK('4.9.9'));
    const rootBefore = readFileSync(fixture.rootPath, 'utf8');
    const sdkBefore = readFileSync(fixture.sdkPath, 'utf8');

    // Write a temp script that imports the library but calls nothing
    const scriptPath = resolve(fixture.dir, 'import-only.ts');
    writeFileSync(
      scriptPath,
      `import { syncSdkVersion } from '${resolve(repoRoot, 'scripts/sync-sdk-version.ts').replace(/\\/g, '/')}'; void (syncSdkVersion satisfies unknown);\n`,
      'utf8'
    );

    const result = spawnSync('pnpm', ['exec', 'tsx', scriptPath], {
      encoding: 'utf8',
      cwd: repoRoot,
    });

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('');
    expect(result.stderr.trim()).toBe('');
    // Files must be unchanged
    expect(readFileSync(fixture.rootPath, 'utf8')).toBe(rootBefore);
    expect(readFileSync(fixture.sdkPath, 'utf8')).toBe(sdkBefore);
  });

  it('sync-sdk-version.ts library source has no top-level process.exit or console calls', () => {
    const src = readFileSync(resolve(repoRoot, 'scripts/sync-sdk-version.ts'), 'utf8');
    // Strip all comment lines – lines starting with //, and block comment delimiters (/** /* *)
    const codeOnly = src
      .split('\n')
      .filter((line) => {
        const t = line.trim();
        return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
      })
      .join('\n');
    expect(codeOnly).not.toMatch(/process\.exit\s*\(/);
    expect(codeOnly).not.toMatch(/console\.(log|warn|error)\s*\(/);
  });

  it('.release-it.json after:bump hook calls sync-sdk-version-cli.ts', () => {
    const releaseIt = JSON.parse(readFileSync(resolve(repoRoot, '.release-it.json'), 'utf8')) as {
      hooks?: Record<string, string[]>;
    };
    const afterBump = releaseIt.hooks?.['after:bump'] ?? [];
    expect(afterBump.some((cmd) => cmd.includes('sync-sdk-version-cli.ts'))).toBe(true);
  });

  it('root package.json contains a script that invokes sync-sdk-version-cli.ts', () => {
    const pkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const scripts = Object.values(pkg.scripts ?? {});
    expect(scripts.some((s) => s.includes('sync-sdk-version-cli.ts'))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // CLI coverage – additional failure cases
  // -------------------------------------------------------------------------

  it('CLI exits non-zero when root version is an empty string', () => {
    fixture = makeFixture(VALID_ROOT(''), VALID_SDK('1.0.0'));
    const result = spawnSync(
      'pnpm',
      [
        'exec',
        'tsx',
        resolve(repoRoot, 'scripts/sync-sdk-version-cli.ts'),
        fixture.rootPath,
        fixture.sdkPath,
      ],
      { encoding: 'utf8', cwd: repoRoot }
    );
    expect(result.status).not.toBe(0);
  });

  it('CLI exits non-zero when root manifest has no version field', () => {
    fixture = makeFixture(
      JSON.stringify({ name: 'devholm', private: false }, null, 2) + '\n',
      VALID_SDK('1.0.0')
    );
    const result = spawnSync(
      'pnpm',
      [
        'exec',
        'tsx',
        resolve(repoRoot, 'scripts/sync-sdk-version-cli.ts'),
        fixture.rootPath,
        fixture.sdkPath,
      ],
      { encoding: 'utf8', cwd: repoRoot }
    );
    expect(result.status).not.toBe(0);
  });

  it('CLI exits non-zero when SDK manifest has no version field', () => {
    fixture = makeFixture(
      VALID_ROOT('1.0.0'),
      JSON.stringify({ name: '@devholm/sdk', private: true, type: 'module' }, null, 2) + '\n'
    );
    const result = spawnSync(
      'pnpm',
      [
        'exec',
        'tsx',
        resolve(repoRoot, 'scripts/sync-sdk-version-cli.ts'),
        fixture.rootPath,
        fixture.sdkPath,
      ],
      { encoding: 'utf8', cwd: repoRoot }
    );
    expect(result.status).not.toBe(0);
  });

  it('CLI preserves unrelated SDK manifest fields after sync', () => {
    fixture = makeFixture(VALID_ROOT('5.0.0'), VALID_SDK('4.9.9'));
    const before = JSON.parse(readFileSync(fixture.sdkPath, 'utf8')) as Record<string, unknown>;
    const result = spawnSync(
      'pnpm',
      [
        'exec',
        'tsx',
        resolve(repoRoot, 'scripts/sync-sdk-version-cli.ts'),
        fixture.rootPath,
        fixture.sdkPath,
      ],
      { encoding: 'utf8', cwd: repoRoot }
    );
    expect(result.status).toBe(0);
    const after = JSON.parse(readFileSync(fixture.sdkPath, 'utf8')) as Record<string, unknown>;
    expect(after['name']).toBe(before['name']);
    expect(after['private']).toBe(before['private']);
    expect(after['type']).toBe(before['type']);
    expect(after['sideEffects']).toBe(before['sideEffects']);
    expect(after['version']).toBe('5.0.0');
  });

  // -------------------------------------------------------------------------
  // In-process syncSdkVersion() behavioral tests
  // (not import tests – call the exported function directly)
  // -------------------------------------------------------------------------

  it('syncSdkVersion() call produces no console output', () => {
    const consoleLogSpy = vi.spyOn(console, 'log');
    const consoleErrorSpy = vi.spyOn(console, 'error');
    fixture = makeFixture(VALID_ROOT('5.0.0'), VALID_SDK('4.9.9'));
    syncSdkVersion(fixture.rootPath, fixture.sdkPath);
    expect(consoleLogSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('syncSdkVersion() call does not mutate filesystem beyond the SDK manifest', () => {
    fixture = makeFixture(VALID_ROOT('5.0.0'), VALID_SDK('4.9.9'));
    const rootBefore = readFileSync(fixture.rootPath, 'utf8');
    syncSdkVersion(fixture.rootPath, fixture.sdkPath);
    const rootAfter = readFileSync(fixture.rootPath, 'utf8');
    expect(rootAfter).toBe(rootBefore);
  });

  it('syncSdkVersion() call does not invoke process.exit', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit should not be called');
    });
    fixture = makeFixture(VALID_ROOT('5.0.0'), VALID_SDK('4.9.9'));
    syncSdkVersion(fixture.rootPath, fixture.sdkPath);
    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });
});
