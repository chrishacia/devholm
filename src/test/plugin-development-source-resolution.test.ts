import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildCanonicalPluginSourceResolution,
  LOCAL_PLUGIN_OVERRIDE_ENV,
  resolveCanonicalPluginSourceStatus,
} from '@core/lib/plugin-development-source-resolution.server';
import { bundledPlugins } from '@user/extensions/plugins/registry';

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devholm-plugin-source-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('plugin development source resolution', () => {
  it('uses bundled defaults when no local overrides are configured', () => {
    const result = buildCanonicalPluginSourceResolution({
      environment: 'development',
      rootDir: process.cwd(),
    });

    expect(result.diagnostics.errors).toEqual([]);
    expect(result.entries).toHaveLength(bundledPlugins.length);
    expect(result.appliedOverrides).toEqual([]);
    expect(
      result.entries.every((entry) => entry.source.sourceKind === 'bundled-fallback-artifact')
    ).toBe(true);
  });

  it('applies local development override for an existing plugin identity', () => {
    const overrideDir = createTempDir();
    const overrideRaw = JSON.stringify({ calendar: overrideDir });

    const result = buildCanonicalPluginSourceResolution({
      environment: 'development',
      rootDir: process.cwd(),
      overrideRaw,
    });

    const calendar = result.entries.find((entry) => entry.pluginId === 'calendar');
    expect(calendar).toBeDefined();
    expect(calendar?.source.sourceKind).toBe('local-development-checkout');
    expect(calendar?.localSourceOverride?.enabled).toBe(true);
    expect(result.appliedOverrides).toEqual([
      {
        pluginId: 'calendar',
        requestedPath: overrideDir,
        filesystemPath: overrideDir,
      },
    ]);
  });

  it('rejects unknown plugin identities in override map', () => {
    const overrideDir = createTempDir();
    const overrideRaw = JSON.stringify({ 'not-a-real-plugin': overrideDir });

    expect(() =>
      buildCanonicalPluginSourceResolution({
        environment: 'development',
        rootDir: process.cwd(),
        overrideRaw,
      })
    ).toThrow(/Only configured plugin identities may be overridden/);
  });

  it('rejects local overrides outside development', () => {
    const overrideRaw = JSON.stringify({ calendar: createTempDir() });

    expect(() =>
      buildCanonicalPluginSourceResolution({
        environment: 'ci',
        rootDir: process.cwd(),
        overrideRaw,
      })
    ).toThrow(new RegExp(`${LOCAL_PLUGIN_OVERRIDE_ENV} is development-only`));
  });

  it('reports resolver source status for plugin management surfaces', () => {
    const status = resolveCanonicalPluginSourceStatus({
      environment: 'development',
      rootDir: process.cwd(),
    });

    expect(status.diagnostics.errors).toEqual([]);
    expect(status.plugins).toHaveLength(bundledPlugins.length);
    expect(status.plugins.every((entry) => entry.pluginId.length > 0)).toBe(true);
  });

  it('applies url-shortener local override in development and surfaces status without resolver failures', () => {
    const overrideDir = createTempDir();
    const overrideRaw = JSON.stringify({ 'url-shortener': overrideDir });

    const status = resolveCanonicalPluginSourceStatus({
      environment: 'development',
      rootDir: process.cwd(),
      overrideRaw,
    });

    const shortener = status.plugins.find((entry) => entry.pluginId === 'url-shortener');
    expect(shortener).toBeDefined();
    expect(shortener?.configuredSourceKind).toBe('local-development-checkout');
    expect(shortener?.resolvedSourceKind).toBe('local-development-checkout');
    expect(shortener?.localOverrideEnabled).toBe(true);
    expect(shortener?.localOverrideFilesystemPath).toBe(overrideDir);
    expect(shortener?.resolverFailureCodes).toEqual([]);
  });

  it('rejects malformed override payloads and missing override paths', () => {
    expect(() =>
      buildCanonicalPluginSourceResolution({
        environment: 'development',
        rootDir: process.cwd(),
        overrideRaw: '["url-shortener"]',
      })
    ).toThrow(new RegExp(`${LOCAL_PLUGIN_OVERRIDE_ENV} must be a JSON object`));

    expect(() =>
      buildCanonicalPluginSourceResolution({
        environment: 'development',
        rootDir: process.cwd(),
        overrideRaw: JSON.stringify({ 'url-shortener': '' }),
      })
    ).toThrow(/must be a non-empty string path/);

    expect(() =>
      buildCanonicalPluginSourceResolution({
        environment: 'development',
        rootDir: process.cwd(),
        overrideRaw: JSON.stringify({ 'url-shortener': './does-not-exist' }),
      })
    ).toThrow(/must point to an existing directory/);
  });

  it('returns url-shortener to canonical source without identity or version drift after override removal', () => {
    const overrideDir = createTempDir();
    const overrideRaw = JSON.stringify({ 'url-shortener': overrideDir });

    const withOverride = buildCanonicalPluginSourceResolution({
      environment: 'development',
      rootDir: process.cwd(),
      overrideRaw,
    });
    const canonical = buildCanonicalPluginSourceResolution({
      environment: 'development',
      rootDir: process.cwd(),
    });

    const overriddenEntry = withOverride.entries.find(
      (entry) => entry.pluginId === 'url-shortener'
    );
    const canonicalEntry = canonical.entries.find((entry) => entry.pluginId === 'url-shortener');

    expect(overriddenEntry).toBeDefined();
    expect(canonicalEntry).toBeDefined();

    expect(overriddenEntry?.pluginId).toBe('url-shortener');
    expect(canonicalEntry?.pluginId).toBe('url-shortener');
    expect(overriddenEntry?.desiredVersion).toBe(canonicalEntry?.desiredVersion);
    expect(overriddenEntry?.source.sourceKind).toBe('local-development-checkout');
    expect(canonicalEntry?.source.sourceKind).toBe('bundled-fallback-artifact');
    expect(canonicalEntry?.localSourceOverride?.enabled ?? false).toBe(false);
  });
});
