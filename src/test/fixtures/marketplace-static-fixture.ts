export interface MarketplaceStaticPluginEntry {
  pluginId: 'calendar' | 'gallery' | 'url-shortener';
  displayName: string;
  version: string;
  path: string;
  manifestPath: string;
  readmePath: string;
  landingPage: string;
  packageStatus: 'scaffold-only';
  runtimeInstallSupported: false;
  bundledFallbackRequired: true;
}

export interface MarketplaceStaticFixture {
  schemaVersion: string;
  runtimeInstallSupported: false;
  bundledFallbackRequired: true;
  plugins: readonly MarketplaceStaticPluginEntry[];
}

export const marketplaceStaticFixture: MarketplaceStaticFixture = {
  schemaVersion: '1.0.0',
  runtimeInstallSupported: false,
  bundledFallbackRequired: true,
  plugins: [
    {
      pluginId: 'calendar',
      displayName: 'Calendar',
      version: '0.1.0',
      path: 'plugins/calendar',
      manifestPath: 'plugins/calendar/manifest.json',
      readmePath: 'plugins/calendar/README.md',
      landingPage: 'plugins/calendar/index.html',
      packageStatus: 'scaffold-only',
      runtimeInstallSupported: false,
      bundledFallbackRequired: true,
    },
    {
      pluginId: 'gallery',
      displayName: 'Gallery',
      version: '0.1.0',
      path: 'plugins/gallery',
      manifestPath: 'plugins/gallery/manifest.json',
      readmePath: 'plugins/gallery/README.md',
      landingPage: 'plugins/gallery/index.html',
      packageStatus: 'scaffold-only',
      runtimeInstallSupported: false,
      bundledFallbackRequired: true,
    },
    {
      pluginId: 'url-shortener',
      displayName: 'URL Shortener',
      version: '0.1.0',
      path: 'plugins/url-shortener',
      manifestPath: 'plugins/url-shortener/manifest.json',
      readmePath: 'plugins/url-shortener/README.md',
      landingPage: 'plugins/url-shortener/index.html',
      packageStatus: 'scaffold-only',
      runtimeInstallSupported: false,
      bundledFallbackRequired: true,
    },
  ],
};
