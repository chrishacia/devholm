export interface PluginAdminSurface {
  href: `/admin/${string}`;
  label?: string;
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
  isEnabled: boolean;
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
