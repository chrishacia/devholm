import type { MarketplaceInstallSourceDescriptorInput } from '@core/types/plugin-marketplace-contract';

export const validMarketplaceInstallSourceDescriptor: MarketplaceInstallSourceDescriptorInput = {
  sourceType: 'marketplace',
  repoUrl: 'https://github.com/chrishacia/devholm-plugins.git',
  ref: 'refs/tags/calendar-v0.1.0',
  pluginSubdirectory: 'plugins/calendar',
  manifestPath: 'plugins/calendar/manifest.json',
  expectedPluginId: 'calendar',
  expectedVersion: '0.1.0',
  integrity: {
    packageChecksum: 'sha256-placeholder',
    manifestChecksum: 'sha256-manifest-placeholder',
    migrationChecksums: {},
  },
  trustPolicy: {
    policy: 'manual-approval',
    allowPrerelease: false,
    requiredApprovers: ['release-manager'],
    notes: 'planning-only placeholder metadata',
  },
};

export const invalidMarketplaceInstallSourceDescriptors: MarketplaceInstallSourceDescriptorInput[] =
  [
    {
      ...validMarketplaceInstallSourceDescriptor,
      repoUrl: 'http://github.com/chrishacia/devholm-plugins',
    },
    {
      ...validMarketplaceInstallSourceDescriptor,
      ref: '',
    },
    {
      ...validMarketplaceInstallSourceDescriptor,
      ref: '../main',
    },
    {
      ...validMarketplaceInstallSourceDescriptor,
      pluginSubdirectory: '../plugins/calendar',
    },
    {
      ...validMarketplaceInstallSourceDescriptor,
      manifestPath: 'plugins/calendar/../manifest.json',
    },
    {
      ...validMarketplaceInstallSourceDescriptor,
      expectedPluginId: 'Calendar',
    },
    {
      ...validMarketplaceInstallSourceDescriptor,
      expectedVersion: 'v0.1',
    },
  ];
