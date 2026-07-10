import type { DevholmPluginManifest } from '@core/types/plugins';
import type { MarketplacePluginPackageMetadata } from '@core/types/plugin-marketplace-contract';
import { calendarPluginManifest } from '@user/extensions/plugins/calendar/manifest';
import { galleryPluginManifest } from '@user/extensions/plugins/gallery/manifest';
import { urlShortenerPluginManifest } from '@user/extensions/plugins/url-shortener/manifest';

function unique(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}

function deriveMigrationPolicy(
  manifest: DevholmPluginManifest
): MarketplacePluginPackageMetadata['migrationPolicy'] {
  const migrationCount = manifest.migrations?.length ?? 0;
  const policy = manifest.lifecyclePolicy?.baselineAdoptionNote ? 'baseline-adoption' : 'declared';

  return {
    migrationCount,
    policy: migrationCount === 0 && policy !== 'baseline-adoption' ? 'none' : policy,
    destructiveDataWipe: manifest.lifecyclePolicy?.purge.destructiveDataWipe ?? 'unknown',
  };
}

function fixtureFromManifest(manifest: DevholmPluginManifest): MarketplacePluginPackageMetadata {
  const pluginSubdirectory = `plugins/${manifest.id}`;

  return {
    pluginId: manifest.id,
    displayName: manifest.name,
    version: manifest.version,
    pluginSubdirectory,
    manifestPath: `${pluginSubdirectory}/manifest.json`,
    source: {
      sourceType: 'marketplace',
      repositoryUrl: 'https://github.com/chrishacia/devholm-plugins',
      ref: 'main',
    },
    integrity:
      manifest.id === 'url-shortener'
        ? {
            packageChecksum: 'sha256-placeholder',
            manifestChecksum: 'sha256-manifest-placeholder',
            migrationChecksums: {},
          }
        : undefined,
    permissions: {
      permissionKeys: manifest.permissions?.map((permission) => permission.key) ?? [],
      capabilities: unique(manifest.permissions?.map((permission) => permission.capability) ?? []),
      scopes: unique(manifest.permissions?.map((permission) => permission.scope) ?? []),
    },
    lifecycle: {
      hasAfterInstall: Boolean(manifest.lifecycle?.afterInstall),
      hasAfterUpgrade: Boolean(manifest.lifecycle?.afterUpgrade),
      hasBeforeDisable: Boolean(manifest.lifecycle?.beforeDisable),
      hasBeforeUninstall: Boolean(manifest.lifecycle?.beforeUninstall),
      hasPurge: Boolean(manifest.lifecycle?.purge),
      disablePolicy: manifest.lifecyclePolicy?.disablePolicy,
      uninstallPolicy: manifest.lifecyclePolicy?.uninstallPolicy,
      dataRetention: manifest.lifecyclePolicy?.dataRetention,
    },
    migrationPolicy: deriveMigrationPolicy(manifest),
    publicRoutes: {
      extensionIds: [...(manifest.publicRouteExtensionIds ?? [])],
      claimsReservedRoutes: false,
    },
    adminAndApi: {
      adminPageHrefs: [...(manifest.adminPageHrefs ?? [])],
      apiPaths: [],
    },
    settings: {
      settingKeys: (manifest.settings ?? []).map((setting) => setting.key),
      count: manifest.settings?.length ?? 0,
    },
    documentation: {
      readmePath: `${pluginSubdirectory}/README.md`,
      indexPagePath: `${pluginSubdirectory}/index.html`,
      manifestJsonPath: `${pluginSubdirectory}/manifest.json`,
      docsPath: `${pluginSubdirectory}/docs`,
      assetsPath: `${pluginSubdirectory}/assets`,
      fixturesPath: `${pluginSubdirectory}/fixtures`,
    },
  };
}

export const stockMarketplacePackageFixtures: MarketplacePluginPackageMetadata[] = [
  fixtureFromManifest(calendarPluginManifest),
  fixtureFromManifest(galleryPluginManifest),
  fixtureFromManifest(urlShortenerPluginManifest),
];
