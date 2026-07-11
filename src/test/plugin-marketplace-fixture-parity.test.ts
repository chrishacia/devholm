import { describe, expect, it, vi } from 'vitest';
import { marketplaceManifestFixture } from './fixtures/marketplace-manifest-fixture';
import { marketplaceStaticFixture } from './fixtures/marketplace-static-fixture';

describe('plugin-marketplace-fixture-parity: static vs manifest fixture consistency', () => {
  it('contains identical stock plugin IDs in both fixtures', () => {
    const staticIds = marketplaceStaticFixture.plugins.map((plugin) => plugin.pluginId).sort();
    const manifestIds = marketplaceManifestFixture.plugins.map((plugin) => plugin.pluginId).sort();

    expect(staticIds).toEqual(['calendar', 'gallery', 'url-shortener']);
    expect(manifestIds).toEqual(['calendar', 'gallery', 'url-shortener']);
    expect(manifestIds).toEqual(staticIds);
  });

  it('keeps path conventions aligned between fixtures', () => {
    const staticById = new Map(
      marketplaceStaticFixture.plugins.map((plugin) => [plugin.pluginId, plugin] as const)
    );

    for (const manifestPlugin of marketplaceManifestFixture.plugins) {
      const staticPlugin = staticById.get(manifestPlugin.pluginId);
      expect(staticPlugin).toBeDefined();

      expect(manifestPlugin.marketplacePath).toBe(`plugins/${manifestPlugin.pluginId}`);
      expect(manifestPlugin.manifestPath).toBe(`plugins/${manifestPlugin.pluginId}/manifest.json`);
      expect(manifestPlugin.readmePath).toBe(`plugins/${manifestPlugin.pluginId}/README.md`);
      expect(manifestPlugin.landingPage).toBe(`plugins/${manifestPlugin.pluginId}/index.html`);

      expect(manifestPlugin.marketplacePath).toBe(staticPlugin?.path);
      expect(manifestPlugin.manifestPath).toBe(staticPlugin?.manifestPath);
      expect(manifestPlugin.readmePath).toBe(staticPlugin?.readmePath);
      expect(manifestPlugin.landingPage).toBe(staticPlugin?.landingPage);
    }
  });

  it('preserves scaffold-only and non-runtime flags everywhere', () => {
    for (const manifestPlugin of marketplaceManifestFixture.plugins) {
      expect(manifestPlugin.packageStatus).toBe('scaffold-only');
      expect(manifestPlugin.runtimeInstallSupported).toBe(false);
      expect(manifestPlugin.bundledFallbackRequired).toBe(true);
    }

    for (const staticPlugin of marketplaceStaticFixture.plugins) {
      expect(staticPlugin.packageStatus).toBe('scaffold-only');
      expect(staticPlugin.runtimeInstallSupported).toBe(false);
      expect(staticPlugin.bundledFallbackRequired).toBe(true);
    }
  });

  it('keeps integrity and metadata-only sections in non-runtime placeholder form', () => {
    for (const manifestPlugin of marketplaceManifestFixture.plugins) {
      expect(manifestPlugin.integrity.checksum).toBeNull();
      expect(manifestPlugin.integrity.signature).toBeNull();
      expect(manifestPlugin.integrity.enforcement).toBe('disabled');

      expect(manifestPlugin.lifecycle.hasLifecycleHooks).toBe(false);
      expect(manifestPlugin.lifecycle.notes.toLowerCase()).toContain('metadata');

      expect(manifestPlugin.migrations.hasMigrations).toBe(false);
      expect(manifestPlugin.migrations.strategy).toBe('metadata-only');

      expect(manifestPlugin.publicRoutes.extensionIds).toEqual([]);
      expect(manifestPlugin.publicRoutes.notes.toLowerCase()).toContain('metadata');

      expect(manifestPlugin.admin.adminPageHrefs).toEqual([]);
      expect(manifestPlugin.admin.notes.toLowerCase()).toContain('metadata');

      expect(manifestPlugin.settings.settingKeys).toEqual([]);
      expect(manifestPlugin.settings.notes.toLowerCase()).toContain('metadata');

      expect(manifestPlugin.docs.readmePath).toBe(manifestPlugin.readmePath);
      expect(manifestPlugin.docs.landingPage).toBe(manifestPlugin.landingPage);
      expect(manifestPlugin.docs.notes.toLowerCase()).toContain('documentation');
    }
  });

  it('does not require network fetch or runtime install behavior', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      throw new Error('network call should not happen');
    });

    const parityStable = marketplaceManifestFixture.plugins.every((manifestPlugin) => {
      const staticPlugin = marketplaceStaticFixture.plugins.find(
        (plugin) => plugin.pluginId === manifestPlugin.pluginId
      );

      return (
        Boolean(staticPlugin) &&
        manifestPlugin.runtimeInstallSupported === false &&
        staticPlugin?.runtimeInstallSupported === false
      );
    });

    expect(parityStable).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
