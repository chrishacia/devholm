export const GALLERY_PLUGIN_ID = 'gallery';
export const GALLERY_PACKAGE_NAME = '@devholm/plugin-gallery';
export const GALLERY_PUBLISHER_ID = 'devholm-first-party';
export const GALLERY_ARTIFACT_IDENTITY = 'bundled:gallery';

export const GALLERY_ENABLEMENT_KEY = 'plugin:gallery:enabled';

// Marks the core migration baseline this plugin expects to already exist.
export const GALLERY_BASELINE_SCHEMA_VERSION_KEY = 'plugin:gallery:baseline-schema-version';
export const GALLERY_BASELINE_SCHEMA_VERSION =
  'core:20260629010000_add_calendar_gallery_and_media_transforms';

export const GALLERY_BASELINE_TABLES = ['gallery_collections', 'gallery_items'] as const;

export const GALLERY_ADMIN_PAGE_HREF = '/admin/gallery' as const;

export const GALLERY_API_BASE_PATH = '/api/gallery' as const;
export const GALLERY_ADMIN_API_BASE_PATH = '/api/admin/gallery' as const;

export const GALLERY_PUBLIC_ROUTE_EXTENSION_ID = 'gallery:public-routes';

export const GALLERY_CAPABILITY_ADMIN_MANAGEMENT = 'gallery.admin-management' as const;
export const GALLERY_CAPABILITY_PUBLIC_VIEWING = 'gallery.public-viewing' as const;

export const GALLERY_PERMISSION_ADMIN_MANAGE = 'plugin:gallery:admin.manage' as const;
export const GALLERY_PERMISSION_PUBLIC_VIEW = 'plugin:gallery:public.view' as const;

export const GALLERY_LIFECYCLE_DATA_RETENTION_POLICY_KEY =
  'plugin:gallery:lifecycle:data-retention-policy' as const;
export const GALLERY_LIFECYCLE_UNINSTALL_POLICY_KEY =
  'plugin:gallery:lifecycle:uninstall-policy' as const;
export const GALLERY_LIFECYCLE_PURGE_POLICY_KEY = 'plugin:gallery:lifecycle:purge-policy' as const;

// PluginLifecycleSafetyPolicy currently constrains this literal value.
export const GALLERY_LIFECYCLE_DATA_RETENTION_POLICY = 'retain-all-calendar-data' as const;
export const GALLERY_LIFECYCLE_UNINSTALL_POLICY = 'non-destructive' as const;
