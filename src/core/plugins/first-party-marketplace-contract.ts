import type { DevholmBundledPlugin } from '@core/types/plugins';
import { bundledPlugins } from '@user/extensions/plugins/registry';

export interface FirstPartyMarketplaceContractPlugin {
  pluginId: string;
  displayName: string;
  version: string;
  description: string;
  permissions: {
    permissionKeys: string[];
    scopes: string[];
    capabilities: string[];
  };
  surfaces: {
    adminPageHrefs: string[];
    publicRouteExtensionIds: string[];
    settingKeys: string[];
  };
  lifecycle: {
    hasAfterInstall: boolean;
    hasAfterUpgrade: boolean;
    hasBeforeDisable: boolean;
    hasBeforeUninstall: boolean;
    hasPurge: boolean;
  };
  migration: {
    count: number;
  };
  package: {
    subdirectory: string;
    manifestPath: string;
  };
}

export interface FirstPartyMarketplaceContractDocument {
  schemaVersion: '1';
  source: 'devholm-generated-first-party-marketplace-contract';
  plugins: FirstPartyMarketplaceContractPlugin[];
}

function sortStrings(values: readonly string[] | undefined): string[] {
  return [...(values ?? [])].sort((a, b) => a.localeCompare(b));
}

function toContractPlugin(plugin: DevholmBundledPlugin): FirstPartyMarketplaceContractPlugin {
  const manifest = plugin.manifest;
  const pluginId = manifest.id;

  return {
    pluginId,
    displayName: manifest.name,
    version: manifest.version,
    description: manifest.description ?? '',
    permissions: {
      permissionKeys: sortStrings(manifest.permissions?.map((permission) => permission.key)),
      scopes: sortStrings(manifest.permissions?.map((permission) => permission.scope)),
      capabilities: sortStrings(manifest.permissions?.map((permission) => permission.capability)),
    },
    surfaces: {
      adminPageHrefs: sortStrings(manifest.adminPageHrefs),
      publicRouteExtensionIds: sortStrings(manifest.publicRouteExtensionIds),
      settingKeys: sortStrings(manifest.settings?.map((setting) => setting.key)),
    },
    lifecycle: {
      hasAfterInstall: Boolean(manifest.lifecycle?.afterInstall),
      hasAfterUpgrade: Boolean(manifest.lifecycle?.afterUpgrade),
      hasBeforeDisable: Boolean(manifest.lifecycle?.beforeDisable),
      hasBeforeUninstall: Boolean(manifest.lifecycle?.beforeUninstall),
      hasPurge: Boolean(manifest.lifecycle?.purge),
    },
    migration: {
      count: manifest.migrations?.length ?? 0,
    },
    package: {
      subdirectory: `plugins/${pluginId}`,
      manifestPath: `plugins/${pluginId}/manifest.json`,
    },
  };
}

export function buildFirstPartyMarketplaceContract(): FirstPartyMarketplaceContractDocument {
  const plugins = bundledPlugins
    .map(toContractPlugin)
    .sort((a, b) => a.pluginId.localeCompare(b.pluginId));

  return {
    schemaVersion: '1',
    source: 'devholm-generated-first-party-marketplace-contract',
    plugins,
  };
}
