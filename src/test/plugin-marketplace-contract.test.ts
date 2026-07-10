import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MARKETPLACE_DIRECTORY_CONTRACT,
  validateMarketplaceDirectorySnapshot,
  validateMarketplacePackageMetadata,
} from '@core/lib/plugin-marketplace-contract.server';
import { getBundledPluginManifests } from '@core/lib/plugin-registry.server';
import type {
  MarketplaceDirectorySnapshot,
  MarketplacePluginPackageMetadata,
} from '@core/types/plugin-marketplace-contract';
import { stockMarketplacePackageFixtures } from './fixtures/marketplace-package-fixtures';

function cloneFixture(
  override?: Partial<MarketplacePluginPackageMetadata>
): MarketplacePluginPackageMetadata {
  const base = stockMarketplacePackageFixtures[0];
  return {
    ...base,
    ...override,
    source: {
      ...base.source,
      ...(override?.source ?? {}),
    },
    documentation: {
      ...base.documentation,
      ...(override?.documentation ?? {}),
    },
    permissions: {
      ...base.permissions,
      ...(override?.permissions ?? {}),
    },
    lifecycle: {
      ...base.lifecycle,
      ...(override?.lifecycle ?? {}),
    },
    migrationPolicy: {
      ...base.migrationPolicy,
      ...(override?.migrationPolicy ?? {}),
    },
    publicRoutes: {
      ...base.publicRoutes,
      ...(override?.publicRoutes ?? {}),
    },
    adminAndApi: {
      ...base.adminAndApi,
      ...(override?.adminAndApi ?? {}),
    },
    settings: {
      ...base.settings,
      ...(override?.settings ?? {}),
    },
    integrity:
      override?.integrity === undefined
        ? base.integrity
        : {
            ...(base.integrity ?? {}),
            ...override.integrity,
          },
  };
}

describe('plugin-marketplace-contract: package metadata validation', () => {
  it('accepts valid marketplace package metadata', () => {
    const errors = validateMarketplacePackageMetadata(cloneFixture());
    expect(errors).toEqual([]);
  });

  it('fails when pluginId is missing', () => {
    const errors = validateMarketplacePackageMetadata(cloneFixture({ pluginId: '' }));
    expect(errors).toContain('pluginId is required');
  });

  it('fails when version is invalid semver', () => {
    const errors = validateMarketplacePackageMetadata(cloneFixture({ version: 'v1' }));
    expect(errors.some((error) => error.includes('version must be valid semver'))).toBe(true);
  });

  it('fails when manifest path is missing', () => {
    const errors = validateMarketplacePackageMetadata(cloneFixture({ manifestPath: '' }));
    expect(errors.some((error) => error.includes('manifestPath'))).toBe(true);
  });

  it('fails when repository URL is invalid', () => {
    const errors = validateMarketplacePackageMetadata(
      cloneFixture({
        source: {
          sourceType: 'marketplace',
          repositoryUrl: 'notaurl',
          ref: 'main',
        },
      })
    );
    expect(errors.some((error) => error.includes('source.repositoryUrl'))).toBe(true);
  });

  it('fails when plugin subdirectory path is invalid', () => {
    const errors = validateMarketplacePackageMetadata(
      cloneFixture({ pluginSubdirectory: '../plugins/calendar' })
    );
    expect(errors.some((error) => error.includes('pluginSubdirectory'))).toBe(true);
  });

  it('requires README.md and index.html documentation references', () => {
    const errors = validateMarketplacePackageMetadata(
      cloneFixture({
        documentation: {
          readmePath: 'plugins/calendar/readme.txt',
          indexPagePath: 'plugins/calendar/home.html',
          manifestJsonPath: 'plugins/calendar/manifest.json',
        },
      })
    );
    expect(errors.some((error) => error.includes('README.md'))).toBe(true);
    expect(errors.some((error) => error.includes('index.html'))).toBe(true);
  });

  it('accepts integrity metadata shape without enforcing runtime verification', () => {
    const errors = validateMarketplacePackageMetadata(
      cloneFixture({
        integrity: {
          packageChecksum: 'sha256-test',
          manifestChecksum: 'sha256-manifest',
          migrationChecksums: { 'calendar:001': 'sha256-migration' },
          publisherSignature: 'sig-placeholder',
        },
      })
    );
    expect(errors).toEqual([]);
  });

  it('represents Calendar, Gallery, and URL Shortener as metadata fixtures', () => {
    const pluginIds = stockMarketplacePackageFixtures.map((fixture) => fixture.pluginId).sort();
    expect(pluginIds).toEqual(['calendar', 'gallery', 'url-shortener']);

    for (const fixture of stockMarketplacePackageFixtures) {
      expect(validateMarketplacePackageMetadata(fixture)).toEqual([]);
    }
  });
});

describe('plugin-marketplace-contract: directory contract validation', () => {
  it('supports the expected marketplace directory shape', () => {
    const snapshot: MarketplaceDirectorySnapshot = {
      rootEntries: ['marketplace.json', 'index.html', 'plugins'],
      plugins: {
        calendar: ['README.md', 'index.html', 'manifest.json', 'docs', 'assets', 'fixtures'],
        gallery: ['README.md', 'index.html', 'manifest.json', 'docs', 'assets', 'fixtures'],
        'url-shortener': ['README.md', 'index.html', 'manifest.json', 'docs', 'assets', 'fixtures'],
      },
    };

    const errors = validateMarketplaceDirectorySnapshot(snapshot);
    expect(errors).toEqual([]);
  });

  it('enforces required root and plugin entries from default contract', () => {
    const snapshot: MarketplaceDirectorySnapshot = {
      rootEntries: ['index.html', 'plugins'],
      plugins: {
        calendar: ['README.md', 'manifest.json'],
      },
    };

    const errors = validateMarketplaceDirectorySnapshot(
      snapshot,
      DEFAULT_MARKETPLACE_DIRECTORY_CONTRACT
    );
    expect(errors.some((error) => error.includes('marketplace.json'))).toBe(true);
    expect(errors.some((error) => error.includes('missing required entry index.html'))).toBe(true);
  });
});

describe('plugin-marketplace-contract: non-runtime guardrails', () => {
  it('keeps bundled fallback manifests untouched', () => {
    const bundledPluginIds = getBundledPluginManifests()
      .map((manifest) => manifest.id)
      .sort();

    expect(bundledPluginIds).toEqual(['calendar', 'gallery', 'url-shortener']);
  });

  it('keeps generated registry ordering deterministic', () => {
    const registryPath = path.join(process.cwd(), 'generated/plugins/registry.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as {
      plugins: Array<{ id: string }>;
    };

    const pluginIds = registry.plugins.map((plugin) => plugin.id);
    const sorted = [...pluginIds].sort((a, b) => a.localeCompare(b));
    expect(pluginIds).toEqual(sorted);
  });
});
