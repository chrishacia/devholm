import { describe, expect, it, vi } from 'vitest';
import {
  parseMarketplaceInstallSourceDescriptor,
  validateMarketplaceInstallSourceDescriptor,
} from '@core/lib/plugin-install-source-descriptor.server';
import type { MarketplaceInstallSourceDescriptorInput } from '@core/types/plugin-marketplace-contract';
import { marketplaceManifestFixture } from './fixtures/marketplace-manifest-fixture';
import { marketplaceStaticFixture } from './fixtures/marketplace-static-fixture';

describe('plugin-marketplace-manifest-fixture: manifest shape', () => {
  it('contains exactly calendar, gallery, and url-shortener entries', () => {
    const pluginIds = marketplaceManifestFixture.plugins.map((plugin) => plugin.pluginId).sort();
    expect(pluginIds).toEqual(['calendar', 'gallery', 'url-shortener']);
  });

  it('uses scaffold-safe path conventions and non-runtime flags for every entry', () => {
    for (const plugin of marketplaceManifestFixture.plugins) {
      expect(plugin.marketplacePath).toBe(`plugins/${plugin.pluginId}`);
      expect(plugin.manifestPath).toBe(`plugins/${plugin.pluginId}/manifest.json`);
      expect(plugin.readmePath).toBe(`plugins/${plugin.pluginId}/README.md`);
      expect(plugin.landingPage).toBe(`plugins/${plugin.pluginId}/index.html`);

      expect(plugin.packageStatus).toBe('scaffold-only');
      expect(plugin.runtimeInstallSupported).toBe(false);
      expect(plugin.bundledFallbackRequired).toBe(true);
    }
  });

  it('keeps integrity/checksum/signature placeholder-only and not enforced', () => {
    for (const plugin of marketplaceManifestFixture.plugins) {
      expect(plugin.integrity.checksum).toBeNull();
      expect(plugin.integrity.signature).toBeNull();
      expect(plugin.integrity.enforcement).toBe('disabled');
    }
  });

  it('treats lifecycle/migrations/publicRoutes/admin/settings/docs as metadata-only', () => {
    for (const plugin of marketplaceManifestFixture.plugins) {
      expect(plugin.lifecycle.hasLifecycleHooks).toBe(false);
      expect(plugin.lifecycle.notes.toLowerCase()).toContain('metadata');

      expect(plugin.migrations.hasMigrations).toBe(false);
      expect(plugin.migrations.strategy).toBe('metadata-only');

      expect(plugin.publicRoutes.extensionIds).toEqual([]);
      expect(plugin.publicRoutes.notes.toLowerCase()).toContain('metadata');

      expect(plugin.admin.adminPageHrefs).toEqual([]);
      expect(plugin.admin.notes.toLowerCase()).toContain('metadata');

      expect(plugin.settings.settingKeys).toEqual([]);
      expect(plugin.settings.notes.toLowerCase()).toContain('metadata');

      expect(plugin.docs.readmePath).toBe(plugin.readmePath);
      expect(plugin.docs.landingPage).toBe(plugin.landingPage);
      expect(plugin.docs.notes.toLowerCase()).toContain('documentation');
    }
  });
});

function toInstallSourceDescriptorInput(
  entry: (typeof marketplaceManifestFixture.plugins)[number]
): MarketplaceInstallSourceDescriptorInput {
  return {
    sourceType: 'marketplace',
    repoUrl: 'https://github.com/chrishacia/devholm-plugins.git',
    ref: 'main',
    pluginSubdirectory: entry.marketplacePath,
    manifestPath: entry.manifestPath,
    expectedPluginId: entry.pluginId,
    expectedVersion: entry.version,
    integrity: {
      packageChecksum: undefined,
      manifestChecksum: undefined,
      publisherSignature: undefined,
      migrationChecksums: {},
    },
  };
}

describe('plugin-marketplace-manifest-fixture: compatibility and safety', () => {
  it('is path-compatible with the existing Phase 4A static fixture', () => {
    const staticById = new Map(
      marketplaceStaticFixture.plugins.map((entry) => [entry.pluginId, entry] as const)
    );

    for (const manifestEntry of marketplaceManifestFixture.plugins) {
      const staticEntry = staticById.get(manifestEntry.pluginId);
      expect(staticEntry).toBeDefined();
      expect(manifestEntry.marketplacePath).toBe(staticEntry?.path);
      expect(manifestEntry.manifestPath).toBe(staticEntry?.manifestPath);
      expect(manifestEntry.readmePath).toBe(staticEntry?.readmePath);
      expect(manifestEntry.landingPage).toBe(staticEntry?.landingPage);
      expect(manifestEntry.runtimeInstallSupported).toBe(staticEntry?.runtimeInstallSupported);
      expect(manifestEntry.bundledFallbackRequired).toBe(staticEntry?.bundledFallbackRequired);
    }
  });

  it('remains compatible with install-source descriptor parsing/validation without network fetch', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      throw new Error('network call should not happen');
    });

    for (const plugin of marketplaceManifestFixture.plugins) {
      const descriptor = toInstallSourceDescriptorInput(plugin);
      const parsed = parseMarketplaceInstallSourceDescriptor(descriptor);
      const errors = validateMarketplaceInstallSourceDescriptor(descriptor);

      expect(parsed.errors).toEqual([]);
      expect(errors).toEqual([]);
      expect(parsed.descriptor?.pluginSubdirectory).toBe(plugin.marketplacePath);
      expect(parsed.descriptor?.manifestPath).toBe(plugin.manifestPath);
      expect(parsed.descriptor?.expectedPluginId).toBe(plugin.pluginId);
      expect(parsed.descriptor?.expectedVersion).toBe(plugin.version);
    }

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('does not imply runtime install readiness', () => {
    expect(
      marketplaceManifestFixture.plugins.every((plugin) => !plugin.runtimeInstallSupported)
    ).toBe(true);
  });
});
