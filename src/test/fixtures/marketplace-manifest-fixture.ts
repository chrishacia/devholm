export type MarketplaceManifestPluginId = 'calendar' | 'gallery' | 'url-shortener';

export interface MarketplaceManifestIntegrityPlaceholder {
  checksum: null;
  signature: null;
  enforcement: 'disabled';
}

export interface MarketplaceManifestLifecycleMetadata {
  hasLifecycleHooks: boolean;
  notes: string;
}

export interface MarketplaceManifestMigrationsMetadata {
  hasMigrations: boolean;
  strategy: 'none' | 'metadata-only';
}

export interface MarketplaceManifestPublicRoutesMetadata {
  extensionIds: string[];
  notes: string;
}

export interface MarketplaceManifestAdminMetadata {
  adminPageHrefs: string[];
  notes: string;
}

export interface MarketplaceManifestSettingsMetadata {
  settingKeys: string[];
  notes: string;
}

export interface MarketplaceManifestDocsMetadata {
  readmePath: string;
  landingPage: string;
  notes: string;
}

export interface MarketplaceManifestFixtureEntry {
  pluginId: MarketplaceManifestPluginId;
  displayName: string;
  description: string;
  version: string;
  packageStatus: 'scaffold-only';
  runtimeInstallSupported: false;
  bundledFallbackRequired: true;
  marketplacePath: string;
  manifestPath: string;
  readmePath: string;
  landingPage: string;
  capabilities: string[];
  permissions: string[];
  lifecycle: MarketplaceManifestLifecycleMetadata;
  migrations: MarketplaceManifestMigrationsMetadata;
  publicRoutes: MarketplaceManifestPublicRoutesMetadata;
  admin: MarketplaceManifestAdminMetadata;
  settings: MarketplaceManifestSettingsMetadata;
  docs: MarketplaceManifestDocsMetadata;
  integrity: MarketplaceManifestIntegrityPlaceholder;
}

export interface MarketplaceManifestFixture {
  schemaVersion: string;
  plugins: readonly MarketplaceManifestFixtureEntry[];
}

export const marketplaceManifestFixture: MarketplaceManifestFixture = {
  schemaVersion: '1.0.0',
  plugins: [
    {
      pluginId: 'calendar',
      displayName: 'Calendar',
      description: 'Static marketplace manifest-shape fixture for Calendar.',
      version: '0.1.0',
      packageStatus: 'scaffold-only',
      runtimeInstallSupported: false,
      bundledFallbackRequired: true,
      marketplacePath: 'plugins/calendar',
      manifestPath: 'plugins/calendar/manifest.json',
      readmePath: 'plugins/calendar/README.md',
      landingPage: 'plugins/calendar/index.html',
      capabilities: ['metadata-only'],
      permissions: [],
      lifecycle: {
        hasLifecycleHooks: false,
        notes: 'Metadata only; does not imply lifecycle execution.',
      },
      migrations: {
        hasMigrations: false,
        strategy: 'metadata-only',
      },
      publicRoutes: {
        extensionIds: [],
        notes: 'Metadata only; does not imply runtime route registration.',
      },
      admin: {
        adminPageHrefs: [],
        notes: 'Metadata only; does not imply admin endpoint behavior.',
      },
      settings: {
        settingKeys: [],
        notes: 'Metadata only; no runtime settings application.',
      },
      docs: {
        readmePath: 'plugins/calendar/README.md',
        landingPage: 'plugins/calendar/index.html',
        notes: 'Documentation references only.',
      },
      integrity: {
        checksum: null,
        signature: null,
        enforcement: 'disabled',
      },
    },
    {
      pluginId: 'gallery',
      displayName: 'Gallery',
      description: 'Static marketplace manifest-shape fixture for Gallery.',
      version: '0.1.0',
      packageStatus: 'scaffold-only',
      runtimeInstallSupported: false,
      bundledFallbackRequired: true,
      marketplacePath: 'plugins/gallery',
      manifestPath: 'plugins/gallery/manifest.json',
      readmePath: 'plugins/gallery/README.md',
      landingPage: 'plugins/gallery/index.html',
      capabilities: ['metadata-only'],
      permissions: [],
      lifecycle: {
        hasLifecycleHooks: false,
        notes: 'Metadata only; does not imply lifecycle execution.',
      },
      migrations: {
        hasMigrations: false,
        strategy: 'metadata-only',
      },
      publicRoutes: {
        extensionIds: [],
        notes: 'Metadata only; does not imply runtime route registration.',
      },
      admin: {
        adminPageHrefs: [],
        notes: 'Metadata only; does not imply admin endpoint behavior.',
      },
      settings: {
        settingKeys: [],
        notes: 'Metadata only; no runtime settings application.',
      },
      docs: {
        readmePath: 'plugins/gallery/README.md',
        landingPage: 'plugins/gallery/index.html',
        notes: 'Documentation references only.',
      },
      integrity: {
        checksum: null,
        signature: null,
        enforcement: 'disabled',
      },
    },
    {
      pluginId: 'url-shortener',
      displayName: 'URL Shortener',
      description: 'Static marketplace manifest-shape fixture for URL Shortener.',
      version: '0.1.0',
      packageStatus: 'scaffold-only',
      runtimeInstallSupported: false,
      bundledFallbackRequired: true,
      marketplacePath: 'plugins/url-shortener',
      manifestPath: 'plugins/url-shortener/manifest.json',
      readmePath: 'plugins/url-shortener/README.md',
      landingPage: 'plugins/url-shortener/index.html',
      capabilities: ['metadata-only'],
      permissions: [],
      lifecycle: {
        hasLifecycleHooks: false,
        notes: 'Metadata only; does not imply lifecycle execution.',
      },
      migrations: {
        hasMigrations: false,
        strategy: 'metadata-only',
      },
      publicRoutes: {
        extensionIds: [],
        notes: 'Metadata only; does not imply runtime route registration.',
      },
      admin: {
        adminPageHrefs: [],
        notes: 'Metadata only; does not imply admin endpoint behavior.',
      },
      settings: {
        settingKeys: [],
        notes: 'Metadata only; no runtime settings application.',
      },
      docs: {
        readmePath: 'plugins/url-shortener/README.md',
        landingPage: 'plugins/url-shortener/index.html',
        notes: 'Documentation references only.',
      },
      integrity: {
        checksum: null,
        signature: null,
        enforcement: 'disabled',
      },
    },
  ],
};
