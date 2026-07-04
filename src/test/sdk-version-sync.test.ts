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

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { resolve } from 'path';
import { tmpdir } from 'os';
import { syncSdkVersion } from '../../scripts/sync-sdk-version.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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
});
