import { describe, expect, it } from 'vitest';
import {
  normalizeGitHubRepoUrl,
  parseMarketplaceInstallSourceDescriptor,
  validateMarketplaceInstallSourceDescriptor,
} from '@core/lib/plugin-install-source-descriptor.server';
import { marketplaceManifestFixture } from './fixtures/marketplace-manifest-fixture';
import { validMarketplaceInstallSourceDescriptor } from './fixtures/plugin-install-source-descriptor-fixtures';
import { marketplaceStaticFixture } from './fixtures/marketplace-static-fixture';

describe('plugin-marketplace-install-reference-consistency: stable cross-layer mapping', () => {
  it('keeps the stock plugin IDs aligned across static and manifest fixtures', () => {
    const staticIds = marketplaceStaticFixture.plugins.map((plugin) => plugin.pluginId).sort();
    const manifestIds = marketplaceManifestFixture.plugins.map((plugin) => plugin.pluginId).sort();

    expect(staticIds).toEqual(['calendar', 'gallery', 'url-shortener']);
    expect(manifestIds).toEqual(['calendar', 'gallery', 'url-shortener']);
    expect(manifestIds).toEqual(staticIds);
  });

  it('keeps stable shared fields aligned for every stock plugin', () => {
    const staticById = new Map(
      marketplaceStaticFixture.plugins.map((plugin) => [plugin.pluginId, plugin] as const)
    );

    for (const manifestPlugin of marketplaceManifestFixture.plugins) {
      const staticPlugin = staticById.get(manifestPlugin.pluginId);

      expect(staticPlugin).toBeDefined();
      expect(staticPlugin?.pluginId).toBe(manifestPlugin.pluginId);
      expect(staticPlugin?.version).toBe(manifestPlugin.version);

      expect(staticPlugin?.path).toBe(`plugins/${manifestPlugin.pluginId}`);
      expect(manifestPlugin.marketplacePath).toBe(`plugins/${manifestPlugin.pluginId}`);
      expect(manifestPlugin.marketplacePath).toBe(staticPlugin?.path);

      expect(staticPlugin?.manifestPath).toBe(`plugins/${manifestPlugin.pluginId}/manifest.json`);
      expect(manifestPlugin.manifestPath).toBe(`plugins/${manifestPlugin.pluginId}/manifest.json`);
      expect(manifestPlugin.manifestPath).toBe(staticPlugin?.manifestPath);
    }
  });

  it('keeps the existing valid descriptor fixture parseable and policy-valid', () => {
    const parsed = parseMarketplaceInstallSourceDescriptor(validMarketplaceInstallSourceDescriptor);
    const errors = validateMarketplaceInstallSourceDescriptor(
      validMarketplaceInstallSourceDescriptor
    );

    expect(parsed.errors).toEqual([]);
    expect(errors).toEqual([]);

    expect(normalizeGitHubRepoUrl(validMarketplaceInstallSourceDescriptor.repoUrl ?? '')).toBe(
      'https://github.com/chrishacia/devholm-plugins'
    );
    expect((parsed.descriptor?.ref ?? '').length).toBeGreaterThan(0);
  });

  it('keeps descriptor expectations consistent with the matching marketplace fixture plugin', () => {
    const parsed = parseMarketplaceInstallSourceDescriptor(validMarketplaceInstallSourceDescriptor);

    expect(parsed.errors).toEqual([]);
    expect(parsed.descriptor).not.toBeNull();

    const expectedPluginId = parsed.descriptor?.expectedPluginId;
    const staticPlugin = marketplaceStaticFixture.plugins.find(
      (plugin) => plugin.pluginId === expectedPluginId
    );
    const manifestPlugin = marketplaceManifestFixture.plugins.find(
      (plugin) => plugin.pluginId === expectedPluginId
    );

    expect(staticPlugin).toBeDefined();
    expect(manifestPlugin).toBeDefined();

    expect(parsed.descriptor?.expectedPluginId).toBe(staticPlugin?.pluginId);
    expect(parsed.descriptor?.expectedVersion).toBe(staticPlugin?.version);
    expect(parsed.descriptor?.pluginSubdirectory).toBe(`plugins/${staticPlugin?.pluginId}`);
    expect(parsed.descriptor?.manifestPath).toBe(`plugins/${staticPlugin?.pluginId}/manifest.json`);

    expect(parsed.descriptor?.expectedPluginId).toBe(manifestPlugin?.pluginId);
    expect(parsed.descriptor?.expectedVersion).toBe(manifestPlugin?.version);
    expect(parsed.descriptor?.pluginSubdirectory).toBe(manifestPlugin?.marketplacePath);
    expect(parsed.descriptor?.manifestPath).toBe(manifestPlugin?.manifestPath);
  });
});
