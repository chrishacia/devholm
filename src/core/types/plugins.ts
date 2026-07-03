export interface PluginAdminSurface {
  href: `/admin/${string}`;
  label?: string;
}

export type PluginLifecycleState = 'bundled' | 'installed' | 'disabled' | 'uninstalled';

export type PluginOperationStatus =
  | 'idle'
  | 'pending_install'
  | 'pending_upgrade'
  | 'pending_disable'
  | 'pending_uninstall'
  | 'pending_purge'
  | 'error';

export type PluginLifecycleEvent = 'install' | 'upgrade' | 'disable' | 'uninstall' | 'purge';

export interface PluginLifecycleContext {
  pluginId: string;
  fromVersion?: string;
  toVersion?: string;
  initiatedBy?: string;
  dryRun?: boolean;
}

export type PluginLifecycleHook = (context: PluginLifecycleContext) => Promise<void> | void;

export interface PluginMigration {
  id: string;
  file: string;
  checksum?: string;
}

export interface PluginSeed {
  id: string;
  file: string;
  checksum?: string;
}

export interface PluginSettingsDefinition {
  key: string;
  type: 'string' | 'number' | 'boolean' | 'json';
  defaultValue?: string | number | boolean | Record<string, unknown> | null;
  description?: string;
  category?: string;
}

export interface DevholmBundledPlugin {
  manifest: DevholmPluginManifest;
  settings?: readonly PluginSettingsDefinition[];
  publicRouteExtensions?: readonly import('@core/types/extensions.server').PublicRouteExtension[];
  adminPageExtensions?: readonly import('@core/types/extensions.server').AdminPageExtension[];
}

export interface DevholmPluginManifest {
  id: string;
  name: string;
  description?: string;
  version: string;
  devholmVersion?: string;

  enablementSettingKey: string;

  dependencies?: {
    plugins?: Record<string, string>;
    packages?: Record<string, string>;
  };

  migrations?: readonly PluginMigration[];
  seeds?: readonly PluginSeed[];
  settings?: readonly PluginSettingsDefinition[];
  publicRouteExtensionIds?: readonly string[];
  adminPageHrefs?: readonly `/admin/${string}`[];

  lifecycle?: {
    afterInstall?: PluginLifecycleHook;
    afterUpgrade?: PluginLifecycleHook;
    beforeDisable?: PluginLifecycleHook;
    beforeUninstall?: PluginLifecycleHook;
    purge?: PluginLifecycleHook;
  };
}

export interface DevHolmPluginDefinition {
  id: string;
  name: string;
  description?: string;
  source: 'core' | 'user';
  enabledByDefault?: boolean;
  adminSurface?: PluginAdminSurface;
  capabilities?: {
    admin?: boolean;
    api?: boolean;
    publicRoutes?: boolean;
    navigation?: boolean;
    sitemap?: boolean;
    embeds?: boolean;
  };
}

export interface PluginRuntimeState {
  id: string;
  bundled: boolean;
  installed: boolean;
  isEnabled: boolean;
  lifecycleState: PluginLifecycleState;
  operationStatus: PluginOperationStatus;
  installedVersion: string | null;
  bundledVersion: string | null;
  updatedAt: Date | null;
}

export interface PluginAdminRecord extends PluginRuntimeState {
  name: string;
  description: string | null;
  source: 'core' | 'user';
  enabledByDefault: boolean;
  adminSurface: PluginAdminSurface | null;
  capabilities: NonNullable<DevHolmPluginDefinition['capabilities']>;
}
