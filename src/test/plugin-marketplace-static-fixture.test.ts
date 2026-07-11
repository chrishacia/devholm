import { describe, expect, it, vi } from 'vitest';
import { validateMarketplacePackageMetadata } from '@core/lib/plugin-marketplace-contract.server';
import {
  parseMarketplaceInstallSourceDescriptor,
  validateMarketplaceInstallSourceDescriptor,
} from '@core/lib/plugin-install-source-descriptor.server';
import type {
  MarketplaceInstallSourceDescriptorInput,
  MarketplacePluginPackageMetadata,
} from '@core/types/plugin-marketplace-contract';
import { marketplaceStaticFixture } from './fixtures/marketplace-static-fixture';

function toMarketplacePackageMetadata(
  entry: (typeof marketplaceStaticFixture.plugins)[number]
): MarketplacePluginPackageMetadata {
  return {
    pluginId: entry.pluginId,
    displayName: entry.displayName,
    version: entry.version,
    pluginSubdirectory: entry.path,
    manifestPath: entry.manifestPath,
    source: {
      sourceType: 'marketplace',
      repositoryUrl: 'https://github.com/chrishacia/devholm-plugins',
      ref: 'main',
    },
    permissions: {
      permissionKeys: [],
      capabilities: [],
      scopes: [],
    },
    lifecycle: {
      hasAfterInstall: false,
      hasAfterUpgrade: false,
      hasBeforeDisable: false,
      hasBeforeUninstall: false,
      hasPurge: false,
    },
    migrationPolicy: {
      migrationCount: 0,
      policy: 'none',
      destructiveDataWipe: 'unknown',
    },
    publicRoutes: {
      extensionIds: [],
      claimsReservedRoutes: false,
    },
    adminAndApi: {
      adminPageHrefs: [],
      apiPaths: [],
    },
    settings: {
      settingKeys: [],
      count: 0,
    },
    documentation: {
      readmePath: entry.readmePath,
      indexPagePath: entry.landingPage,
      manifestJsonPath: entry.manifestPath,
      docsPath: `${entry.path}/docs`,
      assetsPath: `${entry.path}/assets`,
      fixturesPath: `${entry.path}/fixtures`,
    },
  };
}

function toInstallSourceDescriptorInput(
  entry: (typeof marketplaceStaticFixture.plugins)[number]
): MarketplaceInstallSourceDescriptorInput {
  return {
    sourceType: 'marketplace',
    repoUrl: 'https://github.com/chrishacia/devholm-plugins.git',
    ref: 'main',
    pluginSubdirectory: entry.path,
    manifestPath: entry.manifestPath,
    expectedPluginId: entry.pluginId,
    expectedVersion: entry.version,
    integrity: {
      packageChecksum: 'sha256-placeholder',
      manifestChecksum: 'sha256-manifest-placeholder',
      migrationChecksums: {},
    },
  };
}

describe('plugin-marketplace-static-fixture: static shape mirror', () => {
  it('mirrors root scaffold flags as non-runtime metadata', () => {
    expect(marketplaceStaticFixture.runtimeInstallSupported).toBe(false);
    expect(marketplaceStaticFixture.bundledFallbackRequired).toBe(true);
  });

  it('contains calendar, gallery, and url-shortener with plugins/<plugin-id> paths', () => {
    const pluginIds = marketplaceStaticFixture.plugins.map((plugin) => plugin.pluginId).sort();
    expect(pluginIds).toEqual(['calendar', 'gallery', 'url-shortener']);

    for (const plugin of marketplaceStaticFixture.plugins) {
      expect(plugin.path).toBe(`plugins/${plugin.pluginId}`);
      expect(plugin.landingPage).toBe(`${plugin.path}/index.html`);
      expect(plugin.readmePath).toBe(`${plugin.path}/README.md`);
      expect(plugin.packageStatus).toBe('scaffold-only');
      expect(plugin.runtimeInstallSupported).toBe(false);
      expect(plugin.bundledFallbackRequired).toBe(true);
    }
  });
});

describe('plugin-marketplace-static-fixture: contract compatibility', () => {
  it('maps to existing phase 1 marketplace package contract validator', () => {
    for (const plugin of marketplaceStaticFixture.plugins) {
      const metadata = toMarketplacePackageMetadata(plugin);
      expect(validateMarketplacePackageMetadata(metadata)).toEqual([]);
    }
  });

  it('maps to install-source descriptor parsing and validation without network access', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      throw new Error('network call should not happen');
    });

    for (const plugin of marketplaceStaticFixture.plugins) {
      const descriptor = toInstallSourceDescriptorInput(plugin);
      const parsed = parseMarketplaceInstallSourceDescriptor(descriptor);
      const errors = validateMarketplaceInstallSourceDescriptor(descriptor);

      expect(parsed.errors).toEqual([]);
      expect(parsed.descriptor?.pluginSubdirectory).toBe(plugin.path);
      expect(parsed.descriptor?.manifestPath).toBe(plugin.manifestPath);
      expect(parsed.descriptor?.expectedPluginId).toBe(plugin.pluginId);
      expect(parsed.descriptor?.expectedVersion).toBe(plugin.version);
      expect(errors).toEqual([]);
    }

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
