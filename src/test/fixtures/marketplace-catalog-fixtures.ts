import type {
  MarketplaceArtifactReference,
  MarketplaceCatalogEntry,
} from '@core/types/plugin-marketplace-contract';
import { stockMarketplacePackageFixtures } from './marketplace-package-fixtures';

function catalogArtifactPlanned(): MarketplaceArtifactReference {
  return {
    format: 'tar.gz',
    readiness: 'planned',
    immutable: false,
    signature: {
      status: 'not-provided',
    },
  };
}

function baseCatalogEntry(
  pluginId: 'calendar' | 'gallery' | 'url-shortener'
): MarketplaceCatalogEntry {
  const metadata = stockMarketplacePackageFixtures.find((entry) => entry.pluginId === pluginId);
  if (!metadata) {
    throw new Error(`Missing package fixture for ${pluginId}`);
  }

  return {
    pluginId: metadata.pluginId,
    displayName: metadata.displayName,
    version: metadata.version,
    installReadiness: 'catalog-contract-ready',
    runtimeInstallSupported: false,
    bundledFallbackRequired: true,
    pluginSubdirectory: metadata.pluginSubdirectory,
    manifestPath: metadata.manifestPath,
    readmePath: metadata.documentation.readmePath,
    landingPagePath: metadata.documentation.indexPagePath,
    source: metadata.source,
    publisher: {
      publisherId: 'devholm-first-party',
      classification: 'first-party',
    },
    artifact: catalogArtifactPlanned(),
  };
}

export const stockMarketplaceCatalogFixtures: MarketplaceCatalogEntry[] = [
  baseCatalogEntry('calendar'),
  baseCatalogEntry('gallery'),
  baseCatalogEntry('url-shortener'),
];

export const productionEligibleCatalogFixture: MarketplaceCatalogEntry = {
  ...baseCatalogEntry('calendar'),
  installReadiness: 'production-eligible',
  runtimeInstallSupported: true,
  source: {
    sourceType: 'marketplace',
    repositoryUrl: 'https://github.com/chrishacia/devholm-plugins',
    ref: 'v0.1.0',
  },
  artifact: {
    format: 'tar.gz',
    readiness: 'available',
    immutable: true,
    immutableRefType: 'release-url',
    artifactUrl:
      'https://github.com/chrishacia/devholm-plugins/releases/download/calendar-v0.1.0/calendar-v0.1.0.tar.gz',
    sha256: 'a3c6ad48c45116f8f620f6627f7e9640f4b8f814fd64ce42a4c9b2d569f8ff08',
    compressedSizeBytes: 2048,
    maxUncompressedSizeBytes: 10240,
    signature: {
      status: 'not-provided',
    },
  },
};
